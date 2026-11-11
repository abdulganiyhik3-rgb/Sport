import crypto from 'node:crypto'

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/billing/env.ts must only be imported in server-side modules.',
  )
}

export function getPaystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim() || ''
  if (!key) {
    throw new Error('Missing PAYSTACK_SECRET_KEY server environment variable.')
  }
  return key
}

export function getCronSecret(): string {
  return process.env.CRON_SECRET?.trim() || ''
}

export function timingSafeEqualSecret(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false
  const providedHash = crypto
    .createHash('sha256')
    .update(provided, 'utf8')
    .digest()
  const expectedHash = crypto
    .createHash('sha256')
    .update(expected, 'utf8')
    .digest()
  return crypto.timingSafeEqual(providedHash, expectedHash)
}

function isAllowedLoopbackOrigin(url: URL): boolean {
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  )
}

function parseTrustedOrigin(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`

  try {
    const parsed = new URL(normalized)
    if (parsed.protocol === 'https:' || isAllowedLoopbackOrigin(parsed)) {
      return parsed.origin
    }
    return null
  } catch {
    return null
  }
}

export function resolveServerAppOrigin(requestUrl?: string): string {
  const explicitOrigin =
    parseTrustedOrigin(process.env.APP_URL || '') ||
    parseTrustedOrigin(process.env.NEXT_PUBLIC_APP_URL || '') ||
    parseTrustedOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL || '') ||
    parseTrustedOrigin(process.env.VERCEL_URL || '')

  if (explicitOrigin) {
    return explicitOrigin
  }

  if (requestUrl) {
    const allowlist = (process.env.ALLOWED_APP_ORIGINS || '')
      .split(',')
      .map((entry) => parseTrustedOrigin(entry))
      .filter((entry): entry is string => Boolean(entry))

    const candidate = parseTrustedOrigin(requestUrl)
    if (candidate) {
      const candidateUrl = new URL(candidate)
      if (
        isAllowedLoopbackOrigin(candidateUrl) ||
        allowlist.includes(candidate)
      ) {
        return candidate
      }
    }
  }

  throw new Error(
    'Unable to determine a trusted application origin. Configure APP_URL or NEXT_PUBLIC_APP_URL.',
  )
}
