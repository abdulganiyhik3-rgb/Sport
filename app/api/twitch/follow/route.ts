import { followTwitchChannel, TwitchApiError, unfollowTwitchChannel } from '@/lib/twitch/api'
import { validateTwitchId } from '@/lib/twitch/config'
import { twitchErrorResponse, twitchJson, requireSameOrigin } from '@/lib/twitch/http'
import { hasTwitchScope, readValidTwitchSession } from '@/lib/twitch/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function broadcasterIdFromRequest(request: Request): Promise<string> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new TwitchApiError(400, '/follow', 'A JSON body is required.')
  }

  const broadcasterId =
    body && typeof body === 'object' && 'broadcasterId' in body && typeof body.broadcasterId === 'string'
      ? body.broadcasterId
      : ''
  try {
    return validateTwitchId(broadcasterId)
  } catch {
    throw new TwitchApiError(400, '/follow', 'A valid Twitch broadcaster ID is required.')
  }
}

async function handle(request: Request, method: 'POST' | 'DELETE') {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  try {
    const session = await readValidTwitchSession()
    if (!session) {
      return twitchJson(
        { error: 'Connect Twitch before changing follows.', code: 'TWITCH_AUTH_REQUIRED' },
        401,
      )
    }
    if (!hasTwitchScope(session, 'user:edit:follows')) {
      return twitchJson(
        { error: 'Reconnect Twitch and approve follow permissions.', code: 'MISSING_TWITCH_SCOPE' },
        403,
      )
    }

    const broadcasterId = await broadcasterIdFromRequest(request)
    const result =
      method === 'POST'
        ? await followTwitchChannel(session.userId, broadcasterId, {
            accessToken: session.accessToken,
          })
        : await unfollowTwitchChannel(session.userId, broadcasterId, {
            accessToken: session.accessToken,
          })
    return twitchJson(result)
  } catch (error) {
    return twitchErrorResponse(error)
  }
}

export async function POST(request: Request) {
  return handle(request, 'POST')
}

export async function DELETE(request: Request) {
  return handle(request, 'DELETE')
}
