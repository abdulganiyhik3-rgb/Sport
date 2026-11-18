import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  exchangeTwitchAuthorizationCode,
  getTwitchUsers,
  validateTwitchAccessToken,
} from '@/lib/twitch/api'
import { getTwitchServerConfig } from '@/lib/twitch/config'
import { twitchErrorResponse } from '@/lib/twitch/http'
import {
  clearTwitchOAuthState,
  readTwitchOAuthState,
  writeTwitchSession,
} from '@/lib/twitch/session'
import type { TwitchSession } from '@/lib/twitch/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function safeRedirect(request: Request, returnTo: string, key: string, value: string) {
  const target = new URL(returnTo, request.url)
  target.searchParams.set(key, value)
  return NextResponse.redirect(target)
}

function statesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8')
  const rightBuffer = Buffer.from(right, 'utf8')
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  )
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const storedState = await readTwitchOAuthState()
  await clearTwitchOAuthState()

  const returnTo = storedState?.returnTo || '/'
  const code = requestUrl.searchParams.get('code')
  const state = requestUrl.searchParams.get('state')
  const oauthError = requestUrl.searchParams.get('error')

  if (oauthError) {
    return safeRedirect(request, returnTo, 'twitch_error', 'authorization_denied')
  }

  if (!storedState || !state || !statesMatch(state, storedState.state)) {
    return safeRedirect(request, '/', 'twitch_error', 'invalid_state')
  }

  if (!code) {
    return safeRedirect(request, returnTo, 'twitch_error', 'missing_code')
  }

  try {
    const config = getTwitchServerConfig(request.url)
    const token = await exchangeTwitchAuthorizationCode(
      code,
      config.redirectUri,
    )
    const validated = await validateTwitchAccessToken(token.accessToken)
    const users = await getTwitchUsers(
      { ids: [validated.user_id] },
      { accessToken: token.accessToken },
    )
    const user = users.data[0]

    const session: TwitchSession = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: Date.now() + token.expiresIn * 1000,
      userId: validated.user_id,
      login: validated.login,
      displayName: user?.display_name || validated.login,
      scopes: validated.scopes.length > 0 ? validated.scopes : token.scopes,
    }
    await writeTwitchSession(session)

    return safeRedirect(request, returnTo, 'twitch', 'connected')
  } catch (error) {
    if (error instanceof Error && error.message.includes('not configured')) {
      return twitchErrorResponse(error)
    }
    return safeRedirect(request, returnTo, 'twitch_error', 'connection_failed')
  }
}
