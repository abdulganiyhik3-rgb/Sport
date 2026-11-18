import { resolveServerAppOrigin } from '@/lib/billing/env'
import { getTwitchEncryptionKey } from '@/lib/twitch/crypto'

export const TWITCH_API_BASE = 'https://api.twitch.tv/helix'
export const TWITCH_OAUTH_BASE = 'https://id.twitch.tv/oauth2'

export const TWITCH_FEATURE_SCOPES = {
  follow: ['user:read:follows', 'user:edit:follows'],
  clips: ['clips:edit'],
  subscriptions: ['channel:read:subscriptions'],
} as const

export type TwitchOAuthFeature = keyof typeof TWITCH_FEATURE_SCOPES

export interface TwitchServerConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

function isAllowedTwitchRedirectUri(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash) return false
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        (url.hostname === 'localhost' ||
          url.hostname === '127.0.0.1' ||
          url.hostname === '[::1]'))
    )
  } catch {
    return false
  }
}

function validateTwitchRedirectUri(value: string): string {
  if (!isAllowedTwitchRedirectUri(value)) {
    throw new Error(
      'Twitch redirect URI must use HTTPS, or HTTP only for local loopback development.',
    )
  }
  return value
}

export function getTwitchServerConfig(requestUrl?: string): TwitchServerConfig {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim() || ''

  if (!clientId || !clientSecret) {
    throw new Error(
      'Twitch integration is not configured. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET on the server.',
    )
  }

  const configuredRedirectUri = process.env.TWITCH_REDIRECT_URI?.trim() || ''
  const redirectUri = configuredRedirectUri
    ? validateTwitchRedirectUri(configuredRedirectUri)
    : requestUrl
      ? `${resolveServerAppOrigin(requestUrl)}/api/twitch/oauth/callback`
      : ''

  return { clientId, clientSecret, redirectUri }
}

export function isTwitchConfigured(): boolean {
  return Boolean(
    process.env.TWITCH_CLIENT_ID?.trim() &&
      process.env.TWITCH_CLIENT_SECRET?.trim(),
  )
}

export function isTwitchOAuthConfigured(requestUrl?: string): boolean {
  if (!isTwitchConfigured()) return false
  try {
    getTwitchEncryptionKey()
    const config = getTwitchServerConfig(requestUrl)
    return Boolean(config.redirectUri)
  } catch {
    return false
  }
}

export function resolveTwitchScopes(
  requested: string | null | undefined,
): string[] {
  const features = new Set<TwitchOAuthFeature>(['follow'])

  for (const feature of (requested || '').split(',')) {
    if (Object.prototype.hasOwnProperty.call(TWITCH_FEATURE_SCOPES, feature)) {
      features.add(feature as TwitchOAuthFeature)
    }
  }

  return Array.from(features).flatMap(
    (feature) => TWITCH_FEATURE_SCOPES[feature],
  )
}

export function sanitizeTwitchReturnTo(value: string | null | undefined): string {
  const candidate = value?.trim() || '/'
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return '/'
  }
  return candidate
}

export function validateTwitchId(value: string | null | undefined): string {
  const id = value?.trim() || ''
  if (!/^\d{1,30}$/.test(id)) {
    throw new Error('A valid Twitch broadcaster or user ID is required.')
  }
  return id
}

export function parseTwitchPageSize(value: string | null | undefined): number {
  const parsed = Number(value || 20)
  if (!Number.isInteger(parsed) || parsed < 1) return 20
  return Math.min(parsed, 100)
}

export function parseTwitchCursor(value: string | null | undefined): string | undefined {
  const cursor = value?.trim()
  return cursor ? cursor.slice(0, 500) : undefined
}
