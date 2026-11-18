import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  getTwitchServerConfig,
  resolveTwitchScopes,
  sanitizeTwitchReturnTo,
  TWITCH_OAUTH_BASE,
} from '@/lib/twitch/config'
import { twitchErrorResponse } from '@/lib/twitch/http'
import { writeTwitchOAuthState } from '@/lib/twitch/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url)
    const config = getTwitchServerConfig(request.url)
    if (!config.redirectUri) {
      throw new Error('Twitch OAuth redirect URI is not configured.')
    }

    const state = crypto.randomBytes(32).toString('hex')
    const scopes = resolveTwitchScopes(requestUrl.searchParams.get('scopes'))
    const returnTo = sanitizeTwitchReturnTo(
      requestUrl.searchParams.get('returnTo'),
    )

    await writeTwitchOAuthState({ state, returnTo, scopes })

    const authorizeUrl = new URL(`${TWITCH_OAUTH_BASE}/authorize`)
    authorizeUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
    }).toString()

    return NextResponse.redirect(authorizeUrl)
  } catch (error) {
    return twitchErrorResponse(error)
  }
}
