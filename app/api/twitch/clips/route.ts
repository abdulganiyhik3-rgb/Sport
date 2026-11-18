import { createTwitchClip, TwitchApiError } from '@/lib/twitch/api'
import { validateTwitchId } from '@/lib/twitch/config'
import { twitchErrorResponse, twitchJson, requireSameOrigin } from '@/lib/twitch/http'
import { hasTwitchScope, readValidTwitchSession } from '@/lib/twitch/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  try {
    const session = await readValidTwitchSession()
    if (!session) {
      return twitchJson(
        { error: 'Connect Twitch before creating a clip.', code: 'TWITCH_AUTH_REQUIRED' },
        401,
      )
    }
    if (!hasTwitchScope(session, 'clips:edit')) {
      return twitchJson(
        { error: 'Reconnect Twitch and approve clip permissions.', code: 'MISSING_TWITCH_SCOPE' },
        403,
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new TwitchApiError(400, '/clips', 'A JSON body is required.')
    }

    const broadcasterId =
      body && typeof body === 'object' && 'broadcasterId' in body && typeof body.broadcasterId === 'string'
        ? body.broadcasterId
        : ''
    let validBroadcasterId: string
    try {
      validBroadcasterId = validateTwitchId(broadcasterId)
    } catch {
      throw new TwitchApiError(400, '/clips', 'A valid broadcaster ID is required.')
    }

    const hasDelay = Boolean(
      body &&
        typeof body === 'object' &&
        'hasDelay' in body &&
        body.hasDelay === true,
    )
    const result = await createTwitchClip(validBroadcasterId, {
      accessToken: session.accessToken,
      hasDelay,
    })
    return twitchJson(result, 202)
  } catch (error) {
    return twitchErrorResponse(error)
  }
}
