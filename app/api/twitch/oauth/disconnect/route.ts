import { revokeTwitchAccessToken } from '@/lib/twitch/api'
import { twitchJson, requireSameOrigin } from '@/lib/twitch/http'
import { clearTwitchSession, readTwitchSession } from '@/lib/twitch/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const originError = requireSameOrigin(request)
  if (originError) return originError
  const session = await readTwitchSession()
  try {
    if (session?.accessToken) {
      await revokeTwitchAccessToken(session.accessToken)
    }
  } catch {
    // Local logout must still succeed if Twitch revocation is unavailable.
  } finally {
    await clearTwitchSession()
  }
  return twitchJson({ connected: false })
}
