import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  checkMediaLicenseWindow,
  handleMediaAccess,
  isRegionPermitted,
  resolveProtectedMediaAccess,
  resolveTrustedRequestRegion,
  type MediaAccessDeps,
} from '@/lib/billing/media'
import { createFakeAdminClient } from './helpers/fake-supabase'
import type {
  HighlightRow,
  MatchRow,
  PremiumMediaAssetRow,
  ProfileRow,
  SubscriptionPlanRow,
  SubscriptionRow,
} from './helpers/types-shim'

const FREE_MATCH_ID = '11111111-1111-4111-8111-111111111111'
const PREMIUM_MATCH_ID = '22222222-2222-4222-8222-222222222222'
const FREE_HIGHLIGHT_ID = '33333333-3333-4333-8333-333333333333'
const PREMIUM_HIGHLIGHT_ID = '44444444-4444-4444-8444-444444444444'
const MISSING_MATCH_ID = '99999999-9999-4999-8999-999999999999'

const USER_FREE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_PREMIUM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER_EXPIRED_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const USER_STALE_PROFILE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const USER_CANCELLED_STILL_ACTIVE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const PLAN_ID = '55555555-5555-4555-8555-555555555555'

function makePlan(): SubscriptionPlanRow {
  return {
    id: PLAN_ID,
    code: 'premium_monthly',
    name: 'SPORTIVRA Premium',
    description: 'Full live broadcasts and highlights',
    tier: 'premium',
    billing_interval: 'month',
    amount_minor: 1000,
    currency: 'NGN',
    provider: 'paystack',
    provider_plan_refs: { paystack: 'PLN_test_live' },
    features: ['Live streams'],
    is_active: true,
    sort_order: 1,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  }
}

function makeProfile(
  id: string,
  tier: 'free' | 'premium' = 'free',
  status: 'active' | 'expired' | 'cancelled' = 'active',
): ProfileRow {
  return {
    id,
    email: `${id.slice(0, 6)}@example.com`,
    full_name: 'Member',
    favorite_sport_id: null,
    favorite_sport_ids: [],
    favorite_teams: [],
    role: 'member',
    membership_tier: tier,
    membership_status: status,
    provider_customer_ids: {},
    subscription_expires_at: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  }
}

function makeMatch(id: string, tier: 'free' | 'premium', streamUrl: string | null): MatchRow {
  return {
    id,
    slug: `match-${id.slice(0, 8)}`,
    sport_id: 'sport-football',
    league: 'Champions Cup',
    home_team: 'Lagos FC',
    away_team: 'Abuja United',
    home_score: 1,
    away_score: 0,
    status: 'live',
    match_clock: "54'",
    kickoff_at: '2026-11-11T15:00:00.000Z',
    headline: 'Lagos vs Abuja',
    image_url: 'https://images.example.com/match.jpg',
    image_alt: null,
    stream_url: streamUrl,
    access_tier: tier,
    is_featured: true,
    sort_order: 1,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  }
}

function makeHighlight(
  id: string,
  tier: 'free' | 'premium',
  videoUrl: string | null,
): HighlightRow {
  return {
    id,
    slug: `highlight-${id.slice(0, 8)}`,
    sport_id: 'sport-football',
    badge: 'Matchday Highlights',
    title: 'Extended Matchday Recap',
    description: 'Full 12-minute tactical recap',
    duration: '12:04',
    image_url: 'https://images.example.com/hl.jpg',
    image_alt: null,
    video_url: videoUrl,
    access_tier: tier,
    is_featured: false,
    sort_order: 1,
    published_at: '2026-11-01T00:00:00.000Z',
    created_at: '2026-11-01T00:00:00.000Z',
  }
}

function makeAsset(
  overrides: Partial<PremiumMediaAssetRow> = {},
): PremiumMediaAssetRow {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    match_id: PREMIUM_MATCH_ID,
    highlight_id: null,
    access_tier: 'premium',
    media_url: 'https://protected-streams.example.com/live/match.m3u8',
    stream_format: 'hls',
    rights_holder: 'SPORTIVRA Sports Media',
    license_reference: null,
    permitted_regions: ['GLOBAL'],
    license_starts_at: '2026-11-01T00:00:00.000Z',
    license_expires_at: '2026-12-31T23:59:59.000Z',
    is_active: true,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

function futureIso(days = 15): string {
  return new Date(Date.now() + days * 86400 * 1000).toISOString()
}

function pastIso(days = 2): string {
  return new Date(Date.now() - days * 86400 * 1000).toISOString()
}

function makeSubscriptions(): SubscriptionRow[] {
  return [
    {
      id: 'sub-active-1',
      user_id: USER_PREMIUM_ID,
      plan_id: PLAN_ID,
      provider: 'paystack',
      provider_customer_ref: 'CUS_1',
      provider_subscription_ref: 'SUB_1',
      status: 'active',
      billing_interval: 'month',
      current_period_start: pastIso(5),
      current_period_end: futureIso(25),
      cancel_at_period_end: false,
      cancelled_at: null,
      ended_at: null,
      metadata: {},
      created_at: pastIso(5),
      updated_at: pastIso(5),
    },
    {
      id: 'sub-expired-1',
      user_id: USER_EXPIRED_ID,
      plan_id: PLAN_ID,
      provider: 'paystack',
      provider_customer_ref: 'CUS_2',
      provider_subscription_ref: 'SUB_2',
      status: 'expired',
      billing_interval: 'month',
      current_period_start: pastIso(35),
      current_period_end: pastIso(5),
      cancel_at_period_end: true,
      cancelled_at: pastIso(10),
      ended_at: pastIso(5),
      metadata: {},
      created_at: pastIso(35),
      updated_at: pastIso(5),
    },
    {
      id: 'sub-cancelled-active-1',
      user_id: USER_CANCELLED_STILL_ACTIVE_ID,
      plan_id: PLAN_ID,
      provider: 'paystack',
      provider_customer_ref: 'CUS_3',
      provider_subscription_ref: 'SUB_3',
      status: 'cancelled',
      billing_interval: 'month',
      current_period_start: pastIso(10),
      current_period_end: futureIso(20),
      cancel_at_period_end: true,
      cancelled_at: pastIso(2),
      ended_at: null,
      metadata: {},
      created_at: pastIso(10),
      updated_at: pastIso(2),
    },
  ]
}

describe('Premium media access control and licensing (/api/media/access)', () => {
  const savedEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...savedEnv }
  })

  it('allows free match and free highlight playback without requiring Premium or service-role key', async () => {
    const { admin } = createFakeAdminClient({
      matches: [
        makeMatch(
          FREE_MATCH_ID,
          'free',
          'https://free-cdn.example.com/live/free-match.m3u8',
        ),
        makeMatch(PREMIUM_MATCH_ID, 'premium', null),
      ],
      highlights: [
        makeHighlight(
          FREE_HIGHLIGHT_ID,
          'free',
          'https://free-cdn.example.com/vod/free-hl.mp4',
        ),
      ],
    })

    const depsWithoutServiceRole: MediaAccessDeps = {
      getSessionUser: async () => null,
      getCatalogClient: () => admin,
      getAdminClient: () => {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY server environment variable.')
      },
    }

    const matchRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: FREE_MATCH_ID }),
      }),
      depsWithoutServiceRole,
    )
    assert.equal(matchRes.status, 200)
    assert.equal(matchRes.headers.get('cache-control'), 'no-store, max-age=0')
    assert.deepEqual(await matchRes.json(), {
      granted: true,
      accessTier: 'free',
      mediaUrl: 'https://free-cdn.example.com/live/free-match.m3u8',
      streamFormat: 'hls',
      rightsHolder: null,
      licenseExpiresAt: null,
    })

    const hlRes = await handleMediaAccess(
      new Request(
        `https://sportivra.example.com/api/media/access?highlightId=${FREE_HIGHLIGHT_ID}`,
      ),
      depsWithoutServiceRole,
    )
    assert.equal(hlRes.status, 200)
    assert.deepEqual(await hlRes.json(), {
      granted: true,
      accessTier: 'free',
      mediaUrl: 'https://free-cdn.example.com/vod/free-hl.mp4',
      streamFormat: 'mp4',
      rightsHolder: null,
      licenseExpiresAt: null,
    })

    // Unauthenticated Premium request also returns 401 cleanly before requiring service-role key
    const unauthPremiumRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: PREMIUM_MATCH_ID }),
      }),
      depsWithoutServiceRole,
    )
    assert.equal(unauthPremiumRes.status, 401)
    assert.equal(unauthPremiumRes.headers.get('cache-control'), 'no-store, max-age=0')
  })

  it('denies unauthenticated, free, expired, and stale-profile users from Premium media', async () => {
    const { admin } = createFakeAdminClient({
      subscription_plans: [makePlan()],
      profiles: [
        makeProfile(USER_FREE_ID, 'free', 'active'),
        makeProfile(USER_EXPIRED_ID, 'free', 'expired'),
        // Simulate a stale/tampered profile column without a live active subscription row:
        makeProfile(USER_STALE_PROFILE_ID, 'premium', 'active'),
      ],
      subscriptions: makeSubscriptions(),
      matches: [makeMatch(PREMIUM_MATCH_ID, 'premium', null)],
      highlights: [makeHighlight(PREMIUM_HIGHLIGHT_ID, 'premium', null)],
      premium_media_assets: [
        makeAsset({
          match_id: PREMIUM_MATCH_ID,
          highlight_id: null,
        }),
        makeAsset({
          id: '77777777-7777-4777-8777-777777777777',
          match_id: null,
          highlight_id: PREMIUM_HIGHLIGHT_ID,
          media_url: 'https://protected-streams.example.com/vod/hl.mp4',
          stream_format: 'mp4',
        }),
      ],
    })

    // 1. Unauthenticated -> 401 UNAUTHENTICATED
    const unauthRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: PREMIUM_MATCH_ID }),
      }),
      {
        getSessionUser: async () => null,
        getAdminClient: () => admin,
      },
    )
    assert.equal(unauthRes.status, 401)
    assert.equal(unauthRes.headers.get('cache-control'), 'no-store, max-age=0')
    const unauthBody = (await unauthRes.json()) as Record<string, unknown>
    assert.equal(unauthBody.granted, false)
    assert.equal(unauthBody.code, 'UNAUTHENTICATED')
    assert.equal(unauthBody.mediaUrl, undefined)

    // 2. Authenticated Free user -> 403 PREMIUM_REQUIRED (no_active_subscription)
    const freeRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ highlightId: PREMIUM_HIGHLIGHT_ID }),
      }),
      {
        getSessionUser: async () => ({ id: USER_FREE_ID, email: 'free@example.com' }),
        getAdminClient: () => admin,
      },
    )
    assert.equal(freeRes.status, 403)
    const freeBody = (await freeRes.json()) as Record<string, unknown>
    assert.equal(freeBody.granted, false)
    assert.equal(freeBody.code, 'PREMIUM_REQUIRED')
    assert.equal(freeBody.upgradeRequired, true)
    assert.equal(freeBody.reason, 'no_active_subscription')

    // 3. Expired subscription -> 403 PREMIUM_REQUIRED (subscription_expired)
    const expiredRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: PREMIUM_MATCH_ID }),
      }),
      {
        getSessionUser: async () => ({
          id: USER_EXPIRED_ID,
          email: 'expired@example.com',
        }),
        getAdminClient: () => admin,
      },
    )
    assert.equal(expiredRes.status, 403)
    const expiredBody = (await expiredRes.json()) as Record<string, unknown>
    assert.equal(expiredBody.code, 'PREMIUM_REQUIRED')
    assert.equal(expiredBody.reason, 'subscription_expired')
    assert.equal(expiredBody.upgradeRequired, true)

    // 4. Stale profile row claiming membership_tier='premium' with no active subscription -> 403
    const staleRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: PREMIUM_MATCH_ID }),
      }),
      {
        getSessionUser: async () => ({
          id: USER_STALE_PROFILE_ID,
          email: 'stale@example.com',
        }),
        getAdminClient: () => admin,
      },
    )
    assert.equal(staleRes.status, 403)
    const staleBody = (await staleRes.json()) as Record<string, unknown>
    assert.equal(staleBody.code, 'PREMIUM_REQUIRED')
  })

  it('grants Premium playback for active and cancelled-within-period users and checks license windows', async () => {
    const { admin } = createFakeAdminClient({
      subscription_plans: [makePlan()],
      profiles: [
        makeProfile(USER_PREMIUM_ID, 'premium', 'active'),
        makeProfile(USER_CANCELLED_STILL_ACTIVE_ID, 'premium', 'cancelled'),
      ],
      subscriptions: makeSubscriptions(),
      matches: [makeMatch(PREMIUM_MATCH_ID, 'premium', null)],
      premium_media_assets: [
        makeAsset({
          match_id: PREMIUM_MATCH_ID,
          license_starts_at: pastIso(5),
          license_expires_at: futureIso(10),
        }),
      ],
    })

    // Active Premium user -> granted
    const activeGrant = await resolveProtectedMediaAccess({
      admin,
      userId: USER_PREMIUM_ID,
      matchId: PREMIUM_MATCH_ID,
      viewerRegion: 'NG',
    })
    assert.equal(activeGrant.granted, true)
    assert.equal(activeGrant.accessTier, 'premium')
    assert.equal(
      activeGrant.mediaUrl,
      'https://protected-streams.example.com/live/match.m3u8',
    )
    assert.equal(activeGrant.streamFormat, 'hls')
    assert.equal(activeGrant.rightsHolder, 'SPORTIVRA Sports Media')

    // Cancelled user whose paid billing period hasn't ended yet -> granted
    const cancelledStillActiveGrant = await resolveProtectedMediaAccess({
      admin,
      userId: USER_CANCELLED_STILL_ACTIVE_ID,
      matchId: PREMIUM_MATCH_ID,
      viewerRegion: 'NG',
    })
    assert.equal(cancelledStillActiveGrant.granted, true)

    // Future license start -> LICENSE_NOT_STARTED
    assert.throws(
      () =>
        checkMediaLicenseWindow(
          {
            is_active: true,
            license_starts_at: futureIso(3),
            license_expires_at: futureIso(20),
          },
          new Date(),
        ),
      (err: unknown) =>
        err instanceof Error &&
        'code' in err &&
        err.code === 'LICENSE_NOT_STARTED',
    )

    // Expired license -> LICENSE_EXPIRED
    assert.throws(
      () =>
        checkMediaLicenseWindow(
          {
            is_active: true,
            license_starts_at: pastIso(20),
            license_expires_at: pastIso(1),
          },
          new Date(),
        ),
      (err: unknown) =>
        err instanceof Error &&
        'code' in err &&
        err.code === 'LICENSE_EXPIRED',
    )
  })

  it('requires explicit GLOBAL entry and enforces fail-closed trusted regional licensing without header fallback', async () => {
    // Empty array and non-GLOBAL wildcards must fail closed (never grant worldwide access)
    assert.equal(isRegionPermitted([], null), false)
    assert.equal(isRegionPermitted([], 'NG'), false)
    assert.equal(isRegionPermitted(['*'], 'NG'), false)
    assert.equal(isRegionPermitted(['ALL'], 'NG'), false)
    assert.equal(isRegionPermitted(['GLOBAL'], null), true)
    assert.equal(isRegionPermitted(['global'], null), true)
    assert.equal(isRegionPermitted(['NG', 'GH'], 'ng'), true)
    assert.equal(isRegionPermitted(['NG', 'GH'], 'US'), false)
    assert.equal(isRegionPermitted(['NG', 'GH'], null), false)

    // 1. Unconfigured TRUSTED_GEO_HEADER must ignore all incoming geo headers
    delete process.env.TRUSTED_GEO_HEADER
    delete process.env.VERCEL
    delete process.env.TRUSTED_GEO_PROXY_SECRET
    const allHeadersReq = new Request('https://sportivra.example.com/api/media/access', {
      headers: {
        'x-vercel-ip-country': 'NG',
        'cf-ipcountry': 'NG',
        'cloudfront-viewer-country': 'NG',
        'x-country-code': 'NG',
      },
    })
    assert.equal(resolveTrustedRequestRegion(allHeadersReq), null)

    // 2. Unsupported header name (x-country-code) is never trusted even if configured
    assert.equal(
      resolveTrustedRequestRegion(allHeadersReq, {
        header: 'x-country-code',
        isVercelRuntime: true,
        proxySecret: 'edge-secret',
      }),
      null,
    )

    // 3. Direct-origin spoofing of x-vercel-ip-country outside Vercel runtime fails closed
    assert.equal(
      resolveTrustedRequestRegion(allHeadersReq, {
        header: 'x-vercel-ip-country',
        isVercelRuntime: false,
        proxySecret: '',
      }),
      null,
    )

    // 4. Valid Vercel runtime + x-vercel-ip-country succeeds and ignores conflicting spoofed headers
    assert.equal(
      resolveTrustedRequestRegion(
        new Request('https://sportivra.example.com/api/media/access', {
          headers: {
            'x-vercel-ip-country': 'gb',
            'cf-ipcountry': 'NG',
            'x-country-code': 'NG',
          },
        }),
        { header: 'x-vercel-ip-country', isVercelRuntime: true },
      ),
      'GB',
    )

    // 5. Missing, XX, T1, or invalid values never fall back to cf-ipcountry / x-country-code
    for (const badVal of ['XX', 'T1', 'NGA', '12', 'GB, NG', '']) {
      const headers: Record<string, string> = {
        'cf-ipcountry': 'NG',
        'cloudfront-viewer-country': 'NG',
        'x-country-code': 'NG',
      }
      if (badVal) {
        headers['x-vercel-ip-country'] = badVal
      }
      assert.equal(
        resolveTrustedRequestRegion(
          new Request('https://sportivra.example.com/api/media/access', { headers }),
          { header: 'x-vercel-ip-country', isVercelRuntime: true },
        ),
        null,
      )
    }

    // 6. Upstream CDN headers (cf-ipcountry / cloudfront-viewer-country) require verified proxy secret
    assert.equal(
      resolveTrustedRequestRegion(allHeadersReq, {
        header: 'cf-ipcountry',
        proxySecret: '',
      }),
      null,
    )
    assert.equal(
      resolveTrustedRequestRegion(
        new Request('https://sportivra.example.com/api/media/access', {
          headers: {
            'cf-ipcountry': 'GH',
            'x-trusted-proxy-secret': 'wrong-secret',
          },
        }),
        {
          header: 'cf-ipcountry',
          proxySecret: 'cf-origin-secret-123',
        },
      ),
      null,
    )
    assert.equal(
      resolveTrustedRequestRegion(
        new Request('https://sportivra.example.com/api/media/access', {
          headers: {
            'cf-ipcountry': 'gh',
            'x-vercel-ip-country': 'US',
            'x-origin-verify': 'cf-origin-secret-123',
          },
        }),
        {
          header: 'cf-ipcountry',
          proxySecret: 'cf-origin-secret-123',
          proxySecretHeader: 'x-origin-verify',
        },
      ),
      'GH',
    )

    const { admin } = createFakeAdminClient({
      subscription_plans: [makePlan()],
      profiles: [makeProfile(USER_PREMIUM_ID, 'premium', 'active')],
      subscriptions: makeSubscriptions(),
      matches: [
        makeMatch(PREMIUM_MATCH_ID, 'premium', null),
        makeMatch(FREE_MATCH_ID, 'premium', null),
      ],
      highlights: [makeHighlight(PREMIUM_HIGHLIGHT_ID, 'premium', null)],
      premium_media_assets: [
        makeAsset({
          match_id: PREMIUM_MATCH_ID,
          permitted_regions: ['NG', 'GH'],
          license_starts_at: pastIso(2),
          license_expires_at: futureIso(10),
        }),
        // Empty permitted_regions array must fail closed, not grant worldwide access
        makeAsset({
          id: '88888888-8888-4888-8888-888888888888',
          match_id: FREE_MATCH_ID,
          permitted_regions: [],
          license_starts_at: pastIso(2),
          license_expires_at: futureIso(10),
        }),
        // Explicit GLOBAL allows playback without geo header
        makeAsset({
          id: '99999999-9999-4999-8999-999999999998',
          match_id: null,
          highlight_id: PREMIUM_HIGHLIGHT_ID,
          media_url: 'https://protected-streams.example.com/vod/global.mp4',
          stream_format: 'mp4',
          permitted_regions: ['GLOBAL'],
          license_starts_at: pastIso(2),
          license_expires_at: futureIso(10),
        }),
      ],
    })

    const authedUser = async () => ({
      id: USER_PREMIUM_ID,
      email: 'pro@example.com',
    })

    // Valid trusted Vercel edge provider header via env -> 200
    process.env.TRUSTED_GEO_HEADER = 'x-vercel-ip-country'
    process.env.VERCEL = '1'
    const vercelAllowedRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-ip-country': 'NG',
        },
        body: JSON.stringify({ matchId: PREMIUM_MATCH_ID }),
      }),
      { getSessionUser: authedUser, getAdminClient: () => admin },
    )
    assert.equal(vercelAllowedRes.status, 200)

    // Conflicting headers: trusted Vercel header is GB while spoofed cf-ipcountry/x-country-code say NG -> 403
    const conflictingRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-ip-country': 'GB',
          'cf-ipcountry': 'NG',
          'x-country-code': 'NG',
        },
        body: JSON.stringify({ matchId: PREMIUM_MATCH_ID }),
      }),
      { getSessionUser: authedUser, getAdminClient: () => admin },
    )
    assert.equal(conflictingRes.status, 403)
    const conflictingBody = (await conflictingRes.json()) as Record<string, unknown>
    assert.equal(conflictingBody.code, 'REGION_RESTRICTED')
    assert.equal(conflictingBody.granted, false)
    assert.equal(conflictingBody.mediaUrl, undefined)

    // Spoofed x-vercel-ip-country outside Vercel runtime without proxy secret -> 403 fail closed
    delete process.env.VERCEL
    const directOriginSpoofRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-ip-country': 'NG',
        },
        body: JSON.stringify({ matchId: PREMIUM_MATCH_ID }),
      }),
      { getSessionUser: authedUser, getAdminClient: () => admin },
    )
    assert.equal(directOriginSpoofRes.status, 403)

    // CloudFront header with verified proxy secret -> 200; without proxy secret -> 403
    const cfAllowedRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cloudfront-viewer-country': 'GH',
          'x-trusted-proxy-secret': 'cf-secret-xyz',
        },
        body: JSON.stringify({ matchId: PREMIUM_MATCH_ID }),
      }),
      {
        getSessionUser: authedUser,
        getAdminClient: () => admin,
        geoConfig: {
          header: 'cloudfront-viewer-country',
          proxySecret: 'cf-secret-xyz',
        },
      },
    )
    assert.equal(cfAllowedRes.status, 200)

    const cfMissingSecretRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cloudfront-viewer-country': 'GH',
        },
        body: JSON.stringify({ matchId: PREMIUM_MATCH_ID }),
      }),
      {
        getSessionUser: authedUser,
        getAdminClient: () => admin,
        geoConfig: {
          header: 'cloudfront-viewer-country',
          proxySecret: 'cf-secret-xyz',
        },
      },
    )
    assert.equal(cfMissingSecretRes.status, 403)

    // Empty permitted_regions array in DB fails closed even with valid verified NG region
    const emptyRegionsRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-ip-country': 'NG',
        },
        body: JSON.stringify({ matchId: FREE_MATCH_ID }),
      }),
      {
        getSessionUser: authedUser,
        getAdminClient: () => admin,
        geoConfig: { header: 'x-vercel-ip-country', isVercelRuntime: true },
      },
    )
    assert.equal(emptyRegionsRes.status, 403)
    assert.equal(((await emptyRegionsRes.json()) as { code: string }).code, 'REGION_RESTRICTED')

    // Explicit GLOBAL asset succeeds even with no viewer region header
    const globalRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ highlightId: PREMIUM_HIGHLIGHT_ID }),
      }),
      {
        getSessionUser: authedUser,
        getAdminClient: () => admin,
        geoConfig: { header: null },
      },
    )
    assert.equal(globalRes.status, 200)
  })

  it('returns proper HTTP denials for inactive, missing, non-HTTPS, unstarted, and expired media assets', async () => {
    const MATCH_INACTIVE_ID = 'aaaa1111-1111-4111-8111-111111111111'
    const MATCH_NO_ASSET_ID = 'bbbb2222-2222-4222-8222-222222222222'
    const MATCH_HTTP_URL_ID = 'cccc3333-3333-4333-8333-333333333333'
    const MATCH_NOT_STARTED_ID = 'dddd4444-4444-4444-8444-444444444444'
    const MATCH_EXPIRED_ID = 'eeee5555-5555-4555-8555-555555555555'

    const { admin } = createFakeAdminClient({
      subscription_plans: [makePlan()],
      profiles: [makeProfile(USER_PREMIUM_ID, 'premium', 'active')],
      subscriptions: makeSubscriptions(),
      matches: [
        makeMatch(MATCH_INACTIVE_ID, 'premium', null),
        makeMatch(MATCH_NO_ASSET_ID, 'premium', null),
        makeMatch(MATCH_HTTP_URL_ID, 'premium', null),
        makeMatch(MATCH_NOT_STARTED_ID, 'premium', null),
        makeMatch(MATCH_EXPIRED_ID, 'premium', null),
      ],
      premium_media_assets: [
        makeAsset({
          id: '10101010-1010-4010-8010-101010101010',
          match_id: MATCH_INACTIVE_ID,
          is_active: false,
        }),
        makeAsset({
          id: '20202020-2020-4020-8020-202020202020',
          match_id: MATCH_HTTP_URL_ID,
          media_url: 'http://insecure.example.com/stream.m3u8',
        }),
        makeAsset({
          id: '30303030-3030-4030-8030-303030303030',
          match_id: MATCH_NOT_STARTED_ID,
          license_starts_at: futureIso(2),
          license_expires_at: futureIso(10),
        }),
        makeAsset({
          id: '40404040-4040-4040-8040-404040404040',
          match_id: MATCH_EXPIRED_ID,
          license_starts_at: pastIso(10),
          license_expires_at: pastIso(1),
        }),
      ],
    })

    const deps: MediaAccessDeps = {
      getSessionUser: async () => ({ id: USER_PREMIUM_ID, email: 'pro@example.com' }),
      getAdminClient: () => admin,
      geoConfig: { header: 'x-vercel-ip-country', isVercelRuntime: true },
    }

    const inactiveRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: MATCH_INACTIVE_ID }),
      }),
      deps,
    )
    assert.equal(inactiveRes.status, 409)
    assert.equal(inactiveRes.headers.get('cache-control'), 'no-store, max-age=0')
    assert.equal(((await inactiveRes.json()) as { code: string }).code, 'MEDIA_UNAVAILABLE')

    const missingAssetRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: MATCH_NO_ASSET_ID }),
      }),
      deps,
    )
    assert.equal(missingAssetRes.status, 409)
    assert.equal(((await missingAssetRes.json()) as { code: string }).code, 'MEDIA_UNAVAILABLE')

    const httpUrlRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: MATCH_HTTP_URL_ID }),
      }),
      deps,
    )
    assert.equal(httpUrlRes.status, 409)
    assert.equal(((await httpUrlRes.json()) as { code: string }).code, 'MEDIA_UNAVAILABLE')

    const notStartedRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: MATCH_NOT_STARTED_ID }),
      }),
      deps,
    )
    assert.equal(notStartedRes.status, 403)
    assert.equal(notStartedRes.headers.get('cache-control'), 'no-store, max-age=0')
    const notStartedBody = (await notStartedRes.json()) as Record<string, unknown>
    assert.equal(notStartedBody.code, 'LICENSE_NOT_STARTED')
    assert.equal(notStartedBody.mediaUrl, undefined)

    const expiredRes = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: MATCH_EXPIRED_ID }),
      }),
      deps,
    )
    assert.equal(expiredRes.status, 403)
    assert.equal(expiredRes.headers.get('cache-control'), 'no-store, max-age=0')
    const expiredBody = (await expiredRes.json()) as Record<string, unknown>
    assert.equal(expiredBody.code, 'LICENSE_EXPIRED')
    assert.equal(expiredBody.mediaUrl, undefined)
  })

  it('rejects malformed targets, invalid JSON, and reports missing matches cleanly', async () => {
    const { admin } = createFakeAdminClient()
    const deps: MediaAccessDeps = {
      getSessionUser: async () => ({ id: USER_FREE_ID, email: 'u@example.com' }),
      getAdminClient: () => admin,
    }

    const badJson = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad json',
      }),
      deps,
    )
    assert.equal(badJson.status, 400)
    assert.equal(badJson.headers.get('cache-control'), 'no-store, max-age=0')
    assert.equal(((await badJson.json()) as { code: string }).code, 'INVALID_JSON')

    const badTarget = await handleMediaAccess(
      new Request('https://sportivra.example.com/api/media/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: FREE_MATCH_ID,
          highlightId: FREE_HIGHLIGHT_ID,
        }),
      }),
      deps,
    )
    assert.equal(badTarget.status, 400)

    const badUuid = await handleMediaAccess(
      new Request(
        'https://sportivra.example.com/api/media/access?matchId=not-a-uuid',
      ),
      deps,
    )
    assert.equal(badUuid.status, 400)

    const missing = await handleMediaAccess(
      new Request(
        `https://sportivra.example.com/api/media/access?matchId=${MISSING_MATCH_ID}`,
      ),
      deps,
    )
    assert.equal(missing.status, 404)
  })
})
