import { getTwitchSubscriptions, TwitchApiError } from '@/lib/twitch/api'
import { validateTwitchId } from '@/lib/twitch/config'
import { twitchErrorResponse, twitchJson } from '@/lib/twitch/http'
import { hasTwitchScope, readValidTwitchSession } from '@/lib/twitch/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const session = await readValidTwitchSession()
    if (!session) {
      return twitchJson(
        { error: 'Connect the broadcaster Twitch account to read subscriptions.', code: 'TWITCH_AUTH_REQUIRED' },
        401,
      )
    }
    if (!hasTwitchScope(session, 'channel:read:subscriptions')) {
      return twitchJson(
        { error: 'Reconnect Twitch and approve broadcaster subscription permissions.', code: 'MISSING_TWITCH_SCOPE' },
        403,
      )
    }

    const rawId = new URL(request.url).searchParams.get('broadcasterId') || ''
    let broadcasterId: string
    try {
      broadcasterId = validateTwitchId(rawId)
    } catch {
      throw new TwitchApiError(400, '/subscriptions', 'A valid broadcaster ID is required.')
    }

    if (broadcasterId !== session.userId) {
      return twitchJson(
        { error: 'Twitch only permits a broadcaster to read their own subscription list.', code: 'BROADCASTER_ONLY' },
        403,
      )
    }

    const result = await getTwitchSubscriptions(
      broadcasterId,
      { first: 100 },
      { accessToken: session.accessToken },
    )
    return twitchJson(result)
  } catch (error) {
    return twitchErrorResponse(error)
  }
}
