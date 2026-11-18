import { getTwitchFollowedChannels } from '@/lib/twitch/api'
import { twitchErrorResponse, twitchJson } from '@/lib/twitch/http'
import { hasTwitchScope, readValidTwitchSession } from '@/lib/twitch/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const session = await readValidTwitchSession()
    if (!session) {
      return twitchJson(
        { error: 'Connect Twitch to view followed channels.', code: 'TWITCH_AUTH_REQUIRED' },
        401,
      )
    }
    if (!hasTwitchScope(session, 'user:read:follows')) {
      return twitchJson(
        { error: 'Reconnect Twitch and approve follow-reading permissions.', code: 'MISSING_TWITCH_SCOPE' },
        403,
      )
    }

    const followed = await getTwitchFollowedChannels(session.userId, {
      first: 100,
    }, { accessToken: session.accessToken })
    return twitchJson(followed)
  } catch (error) {
    return twitchErrorResponse(error)
  }
}
