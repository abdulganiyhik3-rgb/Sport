import { twitchErrorResponse, twitchJson } from '@/lib/twitch/http'
import { readValidTwitchSession } from '@/lib/twitch/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const session = await readValidTwitchSession()
    if (!session) {
      return twitchJson(
        { connected: false, user: null, scopes: [] },
        401,
      )
    }

    return twitchJson({
      connected: true,
      user: {
        id: session.userId,
        login: session.login,
        displayName: session.displayName,
      },
      scopes: session.scopes,
    })
  } catch (error) {
    return twitchErrorResponse(error)
  }
}
