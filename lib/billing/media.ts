import { NextResponse } from 'next/server'
import { createAdminClient, type AdminSupabaseClient } from '@/lib/supabase/admin'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import type { AccessTier, StreamFormat } from '@/lib/supabase/types'
import { hasActivePremiumAccess } from './access'
import { timingSafeEqualSecret } from './env'
import type { SessionAuthUser } from './handlers'

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/billing/media.ts must only be imported in server-side modules.',
  )
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/

export const SUPPORTED_GEO_HEADERS = [
  'x-vercel-ip-country',
  'cf-ipcountry',
  'cloudfront-viewer-country',
] as const

export type SupportedGeoHeader = (typeof SUPPORTED_GEO_HEADERS)[number]

export interface TrustedGeoConfig {
  header?: string | null
  isVercelRuntime?: boolean
  proxySecret?: string | null
  proxySecretHeader?: string | null
}

export type MediaDenyCode =
  | 'INVALID_JSON'
  | 'INVALID_MEDIA_TARGET'
  | 'UNAUTHENTICATED'
  | 'MEDIA_NOT_FOUND'
  | 'PREMIUM_REQUIRED'
  | 'MEDIA_UNAVAILABLE'
  | 'LICENSE_NOT_STARTED'
  | 'LICENSE_EXPIRED'
  | 'REGION_RESTRICTED'
  | 'INTERNAL_ERROR'

export interface MediaAccessGrant {
  granted: true
  accessTier: AccessTier
  mediaUrl: string
  streamFormat: StreamFormat
  rightsHolder: string | null
  licenseExpiresAt: string | null
}

export interface MediaAccessDenial {
  granted: false
  code: MediaDenyCode
  error: string
  upgradeRequired: boolean
  reason?: 'no_active_subscription' | 'subscription_expired'
  licenseStartsAt?: string | null
  licenseExpiresAt?: string | null
}

export interface MediaAccessDeps {
  getSessionUser?: () => Promise<SessionAuthUser | null>
  getCatalogClient?: () => AdminSupabaseClient | Promise<AdminSupabaseClient>
  getAdminClient?: () => AdminSupabaseClient
  resolveRegion?: (request: Request) => string | null
  geoConfig?: TrustedGeoConfig
  now?: () => Date
}

export class MediaAccessError extends Error {
  readonly statusCode: number
  readonly code: MediaDenyCode
  readonly upgradeRequired: boolean
  readonly reason?: 'no_active_subscription' | 'subscription_expired'
  readonly licenseStartsAt?: string | null
  readonly licenseExpiresAt?: string | null

  constructor(
    statusCode: number,
    code: MediaDenyCode,
    message: string,
    extra?: {
      upgradeRequired?: boolean
      reason?: 'no_active_subscription' | 'subscription_expired'
      licenseStartsAt?: string | null
      licenseExpiresAt?: string | null
    },
  ) {
    super(message)
    this.name = 'MediaAccessError'
    this.statusCode = statusCode
    this.code = code
    this.upgradeRequired = extra?.upgradeRequired ?? false
    this.reason = extra?.reason
    this.licenseStartsAt = extra?.licenseStartsAt
    this.licenseExpiresAt = extra?.licenseExpiresAt
  }
}

async function defaultGetSessionUser(): Promise<SessionAuthUser | null> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null
  return {
    id: user.id,
    email: user.email ?? null,
  }
}

function isSupportedGeoHeader(value: string): value is SupportedGeoHeader {
  return (SUPPORTED_GEO_HEADERS as readonly string[]).includes(value)
}

export function resolveTrustedRequestRegion(
  request: Request,
  config: TrustedGeoConfig = {},
): string | null {
  const configuredHeader = (
    config.header !== undefined
      ? (config.header ?? '')
      : (process.env.TRUSTED_GEO_HEADER ?? '')
  )
    .trim()
    .toLowerCase()

  // Require an explicit, supported edge-provider geo header; never fall back.
  if (!configuredHeader || !isSupportedGeoHeader(configuredHeader)) {
    return null
  }

  const proxySecret = (
    config.proxySecret !== undefined
      ? (config.proxySecret ?? '')
      : (process.env.TRUSTED_GEO_PROXY_SECRET ?? '')
  ).trim()

  const proxySecretHeader = (
    config.proxySecretHeader !== undefined
      ? (config.proxySecretHeader ?? '')
      : (process.env.TRUSTED_GEO_PROXY_HEADER ?? 'x-trusted-proxy-secret')
  )
    .trim()
    .toLowerCase()

  if (!proxySecretHeader) {
    return null
  }

  const isVercelRuntime =
    config.isVercelRuntime !== undefined
      ? config.isVercelRuntime
      : process.env.VERCEL === '1'

  if (configuredHeader === 'x-vercel-ip-country') {
    if (proxySecret) {
      if (
        !timingSafeEqualSecret(
          request.headers.get(proxySecretHeader),
          proxySecret,
        )
      ) {
        return null
      }
    } else if (!isVercelRuntime) {
      // Outside Vercel's managed Edge runtime, x-vercel-ip-country can be spoofed
      // directly by any HTTP client unless a verified proxy secret proves provenance.
      return null
    }
  } else {
    // Upstream CDN headers (cf-ipcountry, cloudfront-viewer-country) can be forged
    // via direct-origin requests unless the CDN injects a verified origin secret
    // and strips/overwrites client-supplied headers.
    if (!proxySecret) {
      return null
    }
    if (
      !timingSafeEqualSecret(
        request.headers.get(proxySecretHeader),
        proxySecret,
      )
    ) {
      return null
    }
  }

  const raw = request.headers.get(configuredHeader)
  if (!raw) return null

  const code = raw.trim().toUpperCase()
  if (code === 'XX' || code === 'T1') return null
  if (!COUNTRY_CODE_PATTERN.test(code)) return null

  return code
}

export function isRegionPermitted(
  permittedRegions: readonly string[],
  viewerRegion: string | null,
): boolean {
  const normalized = permittedRegions
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0)

  // Fail closed when no permitted_regions are configured; require explicit 'GLOBAL'
  // for worldwide licensing so empty arrays never accidentally bypass geo-locks.
  if (normalized.length === 0) {
    return false
  }

  if (normalized.includes('GLOBAL')) {
    return true
  }

  if (!viewerRegion) {
    return false
  }

  const cleanViewer = viewerRegion.trim().toUpperCase()
  return COUNTRY_CODE_PATTERN.test(cleanViewer) && normalized.includes(cleanViewer)
}

export function inferStreamFormatFromUrl(mediaUrl: string): StreamFormat {
  if (/\.m3u8(\?|$)/i.test(mediaUrl)) return 'hls'
  if (/\.mpd(\?|$)/i.test(mediaUrl)) return 'dash'
  return 'mp4'
}

export function checkMediaLicenseWindow(
  asset: {
    is_active: boolean
    license_starts_at: string | null
    license_expires_at: string | null
  },
  now: Date = new Date(),
): void {
  if (!asset.is_active) {
    throw new MediaAccessError(
      409,
      'MEDIA_UNAVAILABLE',
      'This Premium stream is currently inactive.',
    )
  }

  const nowMs = now.getTime()

  if (asset.license_starts_at) {
    const startsMs = Date.parse(asset.license_starts_at)
    if (!Number.isFinite(startsMs) || startsMs > nowMs) {
      throw new MediaAccessError(
        403,
        'LICENSE_NOT_STARTED',
        'This broadcast is not yet within its licensed playback window.',
        {
          licenseStartsAt: asset.license_starts_at,
          licenseExpiresAt: asset.license_expires_at,
        },
      )
    }
  }

  if (asset.license_expires_at) {
    const expiresMs = Date.parse(asset.license_expires_at)
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
      throw new MediaAccessError(
        403,
        'LICENSE_EXPIRED',
        'The broadcast license for this content has expired.',
        {
          licenseStartsAt: asset.license_starts_at,
          licenseExpiresAt: asset.license_expires_at,
        },
      )
    }
  }
}

export async function resolveProtectedMediaAccess(
  deps: {
    admin?: AdminSupabaseClient
    catalogClient?: AdminSupabaseClient
    getAdminClient?: () => AdminSupabaseClient
    getSessionUser?: () => Promise<SessionAuthUser | null>
    userId?: string | null
    matchId?: string | null
    highlightId?: string | null
    viewerRegion: string | null
    now?: Date
  },
): Promise<MediaAccessGrant> {
  const cleanMatchId = deps.matchId?.trim() || null
  const cleanHighlightId = deps.highlightId?.trim() || null

  if (
    (cleanMatchId !== null && cleanHighlightId !== null) ||
    (cleanMatchId === null && cleanHighlightId === null)
  ) {
    throw new MediaAccessError(
      400,
      'INVALID_MEDIA_TARGET',
      'Provide either a matchId or a highlightId.',
    )
  }

  const targetId = cleanMatchId ?? cleanHighlightId!
  if (!UUID_PATTERN.test(targetId)) {
    throw new MediaAccessError(
      400,
      'INVALID_MEDIA_TARGET',
      'Invalid media target identifier.',
    )
  }

  const catalogReader =
    deps.catalogClient ?? deps.admin ?? deps.getAdminClient?.() ?? null
  if (!catalogReader) {
    throw new MediaAccessError(
      500,
      'INTERNAL_ERROR',
      'Unable to inspect media catalog configuration.',
    )
  }

  let accessTier: AccessTier
  let publicMediaUrl: string | null

  if (cleanMatchId) {
    const { data: matchRow, error: matchErr } = await catalogReader
      .from('matches')
      .select('id, access_tier, stream_url')
      .eq('id', cleanMatchId)
      .maybeSingle()

    if (matchErr) {
      throw new MediaAccessError(
        500,
        'INTERNAL_ERROR',
        'Unable to verify match media configuration.',
      )
    }
    if (!matchRow) {
      throw new MediaAccessError(
        404,
        'MEDIA_NOT_FOUND',
        'Requested match could not be found.',
      )
    }
    accessTier = matchRow.access_tier
    publicMediaUrl = matchRow.stream_url
  } else {
    const { data: highlightRow, error: highlightErr } = await catalogReader
      .from('highlights')
      .select('id, access_tier, video_url')
      .eq('id', cleanHighlightId!)
      .maybeSingle()

    if (highlightErr) {
      throw new MediaAccessError(
        500,
        'INTERNAL_ERROR',
        'Unable to verify highlight media configuration.',
      )
    }
    if (!highlightRow) {
      throw new MediaAccessError(
        404,
        'MEDIA_NOT_FOUND',
        'Requested highlight could not be found.',
      )
    }
    accessTier = highlightRow.access_tier
    publicMediaUrl = highlightRow.video_url
  }

  // Free matches and highlights continue working without requiring admin/service-role credentials.
  if (accessTier === 'free') {
    const cleanUrl = publicMediaUrl?.trim() || ''
    if (!/^https?:\/\/\S+$/i.test(cleanUrl)) {
      throw new MediaAccessError(
        409,
        'MEDIA_UNAVAILABLE',
        cleanMatchId
          ? 'A broadcast stream is not yet attached to this event.'
          : 'A highlight video is not yet attached to this clip.',
      )
    }

    return {
      granted: true,
      accessTier: 'free',
      mediaUrl: cleanUrl,
      streamFormat: inferStreamFormatFromUrl(cleanUrl),
      rightsHolder: null,
      licenseExpiresAt: null,
    }
  }

  const resolvedUserId =
    deps.userId !== undefined
      ? deps.userId
      : deps.getSessionUser
        ? ((await deps.getSessionUser())?.id ?? null)
        : null

  // Premium content strictly requires authentication + live server entitlement.
  if (!resolvedUserId) {
    throw new MediaAccessError(
      401,
      'UNAUTHENTICATED',
      'Sign in with an active SPORTIVRA Premium subscription to watch this content.',
      { upgradeRequired: true },
    )
  }

  const admin = deps.admin ?? deps.getAdminClient?.() ?? null
  if (!admin) {
    throw new MediaAccessError(
      500,
      'INTERNAL_ERROR',
      'Unable to verify Premium media authorization.',
    )
  }

  const entitled = await hasActivePremiumAccess(admin, resolvedUserId)
  if (!entitled) {
    const { data: priorSub } = await admin
      .from('subscriptions')
      .select('status, ended_at, current_period_end')
      .eq('user_id', resolvedUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nowMs = (deps.now ?? new Date()).getTime()
    const periodEndMs = priorSub?.current_period_end
      ? Date.parse(priorSub.current_period_end)
      : null
    const wasExpired = Boolean(
      priorSub &&
        (priorSub.status === 'expired' ||
          priorSub.ended_at !== null ||
          (periodEndMs !== null && Number.isFinite(periodEndMs) && periodEndMs <= nowMs)),
    )

    throw new MediaAccessError(
      403,
      'PREMIUM_REQUIRED',
      wasExpired
        ? 'Your SPORTIVRA Premium subscription has expired. Renew your membership to watch Premium content.'
        : 'An active SPORTIVRA Premium subscription is required to watch this content.',
      {
        upgradeRequired: true,
        reason: wasExpired ? 'subscription_expired' : 'no_active_subscription',
      },
    )
  }

  const assetQuery = admin
    .from('premium_media_assets')
    .select(
      'id, media_url, stream_format, rights_holder, permitted_regions, license_starts_at, license_expires_at, is_active',
    )
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)

  const { data: assetRow, error: assetErr } = cleanMatchId
    ? await assetQuery.eq('match_id', cleanMatchId).maybeSingle()
    : await assetQuery.eq('highlight_id', cleanHighlightId!).maybeSingle()

  if (assetErr) {
    throw new MediaAccessError(
      500,
      'INTERNAL_ERROR',
      'Unable to inspect licensed media asset.',
    )
  }

  if (!assetRow) {
    throw new MediaAccessError(
      409,
      'MEDIA_UNAVAILABLE',
      'A licensed stream is not yet available for this Premium event.',
    )
  }

  checkMediaLicenseWindow(assetRow, deps.now ?? new Date())

  if (!isRegionPermitted(assetRow.permitted_regions ?? [], deps.viewerRegion)) {
    throw new MediaAccessError(
      403,
      'REGION_RESTRICTED',
      'This broadcast is not licensed for playback in your region.',
    )
  }

  const cleanAssetUrl = assetRow.media_url?.trim() || ''
  if (!/^https:\/\/\S+$/i.test(cleanAssetUrl)) {
    throw new MediaAccessError(
      409,
      'MEDIA_UNAVAILABLE',
      'The configured Premium stream source is unavailable.',
    )
  }

  return {
    granted: true,
    accessTier: 'premium',
    mediaUrl: cleanAssetUrl,
    streamFormat: assetRow.stream_format,
    rightsHolder: assetRow.rights_holder,
    licenseExpiresAt: assetRow.license_expires_at,
  }
}

function noStoreJson(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}

export async function handleMediaAccess(
  request: Request,
  deps: MediaAccessDeps = {},
): Promise<NextResponse> {
  try {
    let matchId: string | null = null
    let highlightId: string | null = null

    const url = new URL(request.url)
    matchId = url.searchParams.get('matchId')
    highlightId = url.searchParams.get('highlightId')

    if (request.method === 'POST') {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        throw new MediaAccessError(
          400,
          'INVALID_JSON',
          'Invalid JSON request body.',
        )
      }

      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const record = body as { matchId?: unknown; highlightId?: unknown }
        if (typeof record.matchId === 'string') matchId = record.matchId
        if (typeof record.highlightId === 'string') {
          highlightId = record.highlightId
        }
      }
    }

    const catalogClient = deps.getCatalogClient
      ? await deps.getCatalogClient()
      : deps.getAdminClient
        ? deps.getAdminClient()
        : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
          ? createAdminClient()
          : await createServerSupabaseClient()

    const viewerRegion = deps.resolveRegion
      ? deps.resolveRegion(request)
      : resolveTrustedRequestRegion(request, deps.geoConfig)

    const grant = await resolveProtectedMediaAccess({
      catalogClient,
      getAdminClient: deps.getAdminClient ?? createAdminClient,
      getSessionUser: deps.getSessionUser ?? defaultGetSessionUser,
      matchId,
      highlightId,
      viewerRegion,
      now: deps.now ? deps.now() : new Date(),
    })

    return noStoreJson(grant, 200)
  } catch (err) {
    if (err instanceof MediaAccessError) {
      const denial: MediaAccessDenial = {
        granted: false,
        code: err.code,
        error: err.message,
        upgradeRequired: err.upgradeRequired,
        ...(err.reason ? { reason: err.reason } : {}),
        ...(err.licenseStartsAt !== undefined
          ? { licenseStartsAt: err.licenseStartsAt }
          : {}),
        ...(err.licenseExpiresAt !== undefined
          ? { licenseExpiresAt: err.licenseExpiresAt }
          : {}),
      }
      return noStoreJson(denial, err.statusCode)
    }

    const fallback: MediaAccessDenial = {
      granted: false,
      code: 'INTERNAL_ERROR',
      error: 'Unable to verify media access right now.',
      upgradeRequired: false,
    }
    return noStoreJson(fallback, 500)
  }
}
