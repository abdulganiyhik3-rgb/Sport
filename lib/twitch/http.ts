import { NextResponse } from 'next/server'
import { TwitchApiError } from '@/lib/twitch/api'

export function twitchJson<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  })
}

export function twitchErrorResponse(error: unknown): NextResponse {
  if (error instanceof TwitchApiError) {
    const code =
      error.statusCode === 429
        ? 'TWITCH_RATE_LIMITED'
        : error.statusCode === 401
          ? 'TWITCH_UNAUTHENTICATED'
          : 'TWITCH_API_ERROR'
    return twitchJson(
      {
        error: error.message,
        code,
        retryAfter: error.retryAfter,
      },
      error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502,
    )
  }

  const message = error instanceof Error ? error.message : ''
  if (message.includes('Twitch integration is not configured')) {
    return twitchJson(
      {
        error: 'Twitch integration is not configured on the server.',
        code: 'TWITCH_NOT_CONFIGURED',
      },
      503,
    )
  }

  if (
    message.includes('TWITCH_TOKEN_ENCRYPTION_KEY') ||
    message.includes('redirect URI') ||
    message.includes('trusted application origin')
  ) {
    return twitchJson(
      {
        error: 'Twitch OAuth is not configured on the server.',
        code: 'TWITCH_OAUTH_NOT_CONFIGURED',
      },
      503,
    )
  }

  return twitchJson(
    { error: 'Twitch is temporarily unavailable.', code: 'TWITCH_UNAVAILABLE' },
    502,
  )
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true

  try {
    const originUrl = new URL(origin)
    const requestUrl = new URL(request.url)
    if (originUrl.origin === requestUrl.origin) return true

    // A trusted reverse proxy can terminate TLS or normalize the request URL.
    // Compare the browser origin with the forwarded/received host as well, but
    // still require the scheme to match the externally visible request scheme.
    const host = request.headers.get('host')?.toLowerCase()
    const forwardedProtocol = request.headers
      .get('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
      .toLowerCase()
    const expectedProtocols = new Set([
      requestUrl.protocol,
      forwardedProtocol ? `${forwardedProtocol}:` : '',
    ])
    return (
      Boolean(host) &&
      originUrl.host.toLowerCase() === host &&
      expectedProtocols.has(originUrl.protocol)
    )
  } catch {
    return false
  }
}

export function requireSameOrigin(request: Request): NextResponse | null {
  return isSameOriginRequest(request)
    ? null
    : twitchJson(
        { error: 'Cross-origin requests are not allowed.', code: 'CSRF_REJECTED' },
        403,
      )
}
