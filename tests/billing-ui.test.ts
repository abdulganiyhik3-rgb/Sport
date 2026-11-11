import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BillingClientError,
  cancelUserSubscriptionRequest,
  createManageSubscriptionLinkRequest,
  describeAccountMembershipSummary,
  describeUserSubscription,
  extractPlanFeatures,
  fetchBillingOverview,
  fetchProtectedMediaAccess,
  fetchPublicPlans,
  formatBillingIntervalLabel,
  formatMinorCurrency,
  getMembershipDisplayModel,
  getStreamPlaybackStrategy,
  initializeCheckoutSession,
  isSafePaystackRedirectUrl,
  parseBillingCallbackSearch,
  resolveBillingCallbackState,
  type PublicPlanSummary,
  type UserBillingOverview,
  type VerifyCheckoutResponse,
} from '@/lib/billing/client'

function makePublicPlan(
  overrides: Partial<PublicPlanSummary> = {},
): PublicPlanSummary {
  return {
    id: 'plan-1',
    code: 'premium_monthly',
    name: 'SPORTIVRA Premium Monthly',
    description: 'Live streams and extended highlights',
    tier: 'premium',
    billingInterval: 'month',
    amountMinor: 100000,
    currency: 'NGN',
    features: ['Live streams', 'On-demand highlights'],
    sortOrder: 1,
    checkoutReady: true,
    ...overrides,
  }
}

describe('Pricing & membership display helpers', () => {
  it('shows "Premium plans coming soon" and zero fabricated prices when paid plans are unconfigured', () => {
    const freeOnly = getMembershipDisplayModel({
      plans: [
        makePublicPlan({
          id: 'plan-free',
          code: 'free',
          name: 'SPORTIVRA Free',
          tier: 'free',
          billingInterval: 'none',
          amountMinor: 0,
          currency: null,
          checkoutReady: false,
        }),
      ],
      paidPlansConfigured: false,
    })

    assert.equal(freeOnly.paidPlansConfigured, false)
    assert.equal(freeOnly.comingSoonMessage, 'Premium plans coming soon')
    assert.equal(freeOnly.premiumPlans.length, 0)
    assert.equal(freeOnly.freePlan?.code, 'free')

    // Even if a draft premium plan row lacks checkoutReady, it must not be offered as live checkout
    const draftOnly = getMembershipDisplayModel({
      plans: [
        makePublicPlan({
          code: 'draft_monthly',
          checkoutReady: false,
        }),
      ],
      paidPlansConfigured: true,
    })
    assert.equal(draftOnly.paidPlansConfigured, false)
    assert.equal(draftOnly.comingSoonMessage, 'Premium plans coming soon')
    assert.equal(draftOnly.premiumPlans.length, 0)
  })

  it('formats configured paid plans, currencies, intervals, and features accurately', () => {
    const model = getMembershipDisplayModel({
      plans: [
        makePublicPlan({
          id: 'plan-free',
          code: 'free',
          name: 'Free',
          tier: 'free',
          billingInterval: 'none',
          amountMinor: 0,
          currency: null,
          checkoutReady: false,
        }),
        makePublicPlan({
          code: 'premium_monthly',
          name: 'Premium Monthly',
          amountMinor: 250000,
          currency: 'NGN',
          billingInterval: 'month',
          checkoutReady: true,
        }),
        makePublicPlan({
          id: 'plan-2',
          code: 'premium_yearly',
          name: 'Premium Yearly',
          amountMinor: 2500000,
          currency: 'NGN',
          billingInterval: 'year',
          checkoutReady: true,
        }),
      ],
      paidPlansConfigured: true,
    })

    assert.equal(model.paidPlansConfigured, true)
    assert.equal(model.comingSoonMessage, null)
    assert.equal(model.premiumPlans.length, 2)
    assert.equal(formatBillingIntervalLabel('month'), 'per month')
    assert.equal(formatBillingIntervalLabel('year'), 'per year')
    assert.equal(formatMinorCurrency(250000, 'NGN')?.includes('2,500'), true)
    assert.equal(formatMinorCurrency(null, 'NGN'), null)
    assert.deepEqual(
      extractPlanFeatures([' Live streams ', '', 42, 'Match alerts']),
      ['Live streams', 'Match alerts'],
    )
  })
})

describe('Checkout initiation and Paystack redirect verification', () => {
  it('validates HTTPS Paystack authorization URLs and rejects unsafe redirects', async () => {
    assert.equal(
      isSafePaystackRedirectUrl('https://checkout.paystack.com/xyz'),
      true,
    )
    assert.equal(
      isSafePaystackRedirectUrl('http://checkout.paystack.com/xyz'),
      false,
    )
    assert.equal(isSafePaystackRedirectUrl('javascript:alert(1)'), false)

    let requestedPath = ''
    let requestedBody = ''
    const okFetch: typeof fetch = async (input, init) => {
      requestedPath = String(input)
      requestedBody = String(init?.body ?? '')
      return new Response(
        JSON.stringify({
          provider: 'paystack',
          reference: 'SPV_ref_001',
          authorizationUrl: 'https://checkout.paystack.com/acc_123',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const checkout = await initializeCheckoutSession('premium_monthly', okFetch)
    assert.equal(requestedPath, '/api/billing/checkout')
    assert.deepEqual(JSON.parse(requestedBody), { planCode: 'premium_monthly' })
    assert.equal(checkout.authorizationUrl, 'https://checkout.paystack.com/acc_123')

    const unsafeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          provider: 'paystack',
          reference: 'SPV_bad',
          authorizationUrl: 'http://insecure.example.com/pay',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )

    await assert.rejects(
      () => initializeCheckoutSession('premium_monthly', unsafeFetch),
      (err: unknown) =>
        err instanceof BillingClientError && err.code === 'INVALID_CHECKOUT_URL',
    )
  })

  it('parses callback search parameters and verifies strictly against /api/billing/verify', async () => {
    const parsedSuccess = parseBillingCallbackSearch(
      '?trxref=SPV_101&reference=SPV_101',
    )
    assert.equal(parsedSuccess.reference, 'SPV_101')
    assert.equal(parsedSuccess.cancelled, false)

    const parsedCancelled = parseBillingCallbackSearch('?cancelled=1')
    assert.equal(parsedCancelled.cancelled, true)
    assert.equal(parsedCancelled.reference, null)

    // 1. Server verifies payment and confirms active Premium
    const verifiedResult = await resolveBillingCallbackState(
      '?reference=SPV_ok_1',
      async (ref): Promise<VerifyCheckoutResponse> => ({
        status: 'succeeded',
        alreadyProcessed: false,
        reference: ref,
        hasActivePremium: true,
        subscription: {
          id: 'sub-1',
          planId: 'plan-1',
          planCode: 'premium_monthly',
          planName: 'SPORTIVRA Premium Monthly',
          planTier: 'premium',
          provider: 'paystack',
          status: 'active',
          billingInterval: 'month',
          currentPeriodStart: '2026-11-11T00:00:00.000Z',
          currentPeriodEnd: '2026-12-11T00:00:00.000Z',
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          endedAt: null,
          entitledNow: true,
        },
      }),
    )
    assert.equal(verifiedResult.kind, 'succeeded')
    if (verifiedResult.kind === 'succeeded') {
      assert.equal(verifiedResult.planName, 'SPORTIVRA Premium Monthly')
    }

    // 2. Never grant Premium if server says hasActivePremium: false
    const settledInactive = await resolveBillingCallbackState(
      '?reference=SPV_inactive',
      async (ref): Promise<VerifyCheckoutResponse> => ({
        status: 'succeeded',
        alreadyProcessed: false,
        reference: ref,
        hasActivePremium: false,
        subscription: null,
      }),
    )
    assert.equal(settledInactive.kind, 'settled_inactive')

    // 3. Browser redirect without verification ref never grants Premium
    const missingRef = await resolveBillingCallbackState('?status=success')
    assert.equal(missingRef.kind, 'failed')

    // 4. Cancelled checkout
    const cancelled = await resolveBillingCallbackState('?cancelled=1')
    assert.equal(cancelled.kind, 'cancelled')

    // 5. Pending verification from Paystack
    const pending = await resolveBillingCallbackState(
      '?reference=SPV_pending',
      async (ref): Promise<VerifyCheckoutResponse> => ({
        status: 'pending',
        alreadyProcessed: false,
        reference: ref,
        hasActivePremium: false,
        subscription: null,
      }),
    )
    assert.equal(pending.kind, 'pending')

    // 6. Failed charge
    const failed = await resolveBillingCallbackState(
      '?reference=SPV_failed',
      async (ref): Promise<VerifyCheckoutResponse> => ({
        status: 'failed',
        alreadyProcessed: false,
        reference: ref,
        hasActivePremium: false,
        subscription: null,
      }),
    )
    assert.equal(failed.kind, 'failed')

    // 7. 401 session expired on callback -> prompts re-auth preserving reference
    const unauth = await resolveBillingCallbackState(
      '?reference=SPV_reauth',
      async () => {
        throw new BillingClientError(
          401,
          'UNAUTHENTICATED',
          'Authentication required.',
        )
      },
    )
    assert.equal(unauth.kind, 'unauthenticated')
    if (unauth.kind === 'unauthenticated') {
      assert.equal(unauth.reference, 'SPV_reauth')
    }
  })
})

describe('Account subscription management & protected media client calls', () => {
  it('describes active, cancelling, expired, and free subscription states cleanly', () => {
    assert.equal(describeUserSubscription(null).badgeLabel, 'Free')

    const activeOverview: UserBillingOverview = {
      hasActivePremium: true,
      profile: {
        role: 'member',
        membershipTier: 'premium',
        membershipStatus: 'active',
        subscriptionExpiresAt: '2026-12-11T00:00:00.000Z',
      },
      subscription: {
        id: 'sub-1',
        planId: 'plan-1',
        planCode: 'premium_monthly',
        planName: 'SPORTIVRA Premium Monthly',
        planTier: 'premium',
        provider: 'paystack',
        status: 'active',
        billingInterval: 'month',
        currentPeriodStart: '2026-11-11T00:00:00.000Z',
        currentPeriodEnd: '2026-12-11T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        endedAt: null,
        entitledNow: true,
      },
      recentTransactions: [],
    }
    const activeDisplay = describeUserSubscription(activeOverview)
    assert.equal(activeDisplay.hasActivePremium, true)
    assert.equal(activeDisplay.badgeLabel, 'Active')
    assert.equal(activeDisplay.canCancel, true)
    assert.equal(activeDisplay.canManage, true)
    assert.equal(activeDisplay.periodSummary.includes('Renews on'), true)

    const cancelAtPeriodEndDisplay = describeUserSubscription({
      ...activeOverview,
      subscription: {
        ...activeOverview.subscription!,
        cancelAtPeriodEnd: true,
      },
    })
    assert.equal(cancelAtPeriodEndDisplay.badgeLabel, 'Cancels at period end')
    assert.equal(cancelAtPeriodEndDisplay.canCancel, false)
    assert.equal(cancelAtPeriodEndDisplay.canManage, true)

    const expiredDisplay = describeUserSubscription({
      ...activeOverview,
      hasActivePremium: false,
      subscription: {
        ...activeOverview.subscription!,
        status: 'expired',
        endedAt: '2026-12-11T00:00:00.000Z',
        entitledNow: false,
      },
    })
    assert.equal(expiredDisplay.hasActivePremium, false)
    assert.equal(expiredDisplay.badgeLabel, 'Expired')
    assert.equal(expiredDisplay.canCancel, false)
    assert.equal(expiredDisplay.canManage, false)

    // Regression: active DB subscription whose current_period_end is past (before cron sweep)
    // must show Expired, NEVER Incomplete, even when cached profile still says membershipTier='premium'
    const overdueActiveOverview: UserBillingOverview = {
      hasActivePremium: false,
      profile: {
        role: 'member',
        membershipTier: 'premium',
        membershipStatus: 'active',
        subscriptionExpiresAt: '2099-01-01T00:00:00.000Z',
      },
      subscription: {
        ...activeOverview.subscription!,
        status: 'active',
        currentPeriodEnd: '2026-10-01T00:00:00.000Z',
        endedAt: null,
        entitledNow: false,
      },
      recentTransactions: [],
    }
    const overdueActiveDisplay = describeUserSubscription(overdueActiveOverview)
    assert.equal(overdueActiveDisplay.hasActivePremium, false)
    assert.equal(overdueActiveDisplay.badgeLabel, 'Expired')
    assert.equal(overdueActiveDisplay.periodSummary.includes('Ended on'), true)
    assert.equal(overdueActiveDisplay.canCancel, false)
    assert.equal(overdueActiveDisplay.canManage, false)

    const overdueAccountSummary =
      describeAccountMembershipSummary(overdueActiveOverview)
    assert.equal(overdueAccountSummary.tierLabel, 'Free')
    assert.equal(overdueAccountSummary.statusLabel, 'Expired')
    assert.equal(overdueAccountSummary.periodDateVerb, 'Ended')
    assert.equal(
      overdueAccountSummary.periodDateIso,
      '2026-10-01T00:00:00.000Z',
    )

    // Regression: stale profile with no live subscription must still display Free (never Premium)
    const staleNoSubSummary = describeAccountMembershipSummary({
      hasActivePremium: false,
      profile: {
        role: 'member',
        membershipTier: 'premium',
        membershipStatus: 'active',
        subscriptionExpiresAt: '2099-01-01T00:00:00.000Z',
      },
      subscription: null,
      recentTransactions: [],
    })
    assert.equal(staleNoSubSummary.tierLabel, 'Free')
    assert.equal(staleNoSubSummary.statusLabel, 'Free')
    assert.equal(staleNoSubSummary.periodDateIso, null)

    // Legitimate cancellation at period end still preserves Premium access until paid period ends
    const cancelledStillActiveSummary = describeAccountMembershipSummary({
      hasActivePremium: true,
      profile: {
        role: 'member',
        membershipTier: 'premium',
        membershipStatus: 'cancelled',
        subscriptionExpiresAt: '2026-12-11T00:00:00.000Z',
      },
      subscription: {
        ...activeOverview.subscription!,
        status: 'cancelled',
        cancelAtPeriodEnd: true,
        cancelledAt: '2026-11-12T00:00:00.000Z',
        endedAt: null,
        entitledNow: true,
      },
      recentTransactions: [],
    })
    assert.equal(cancelledStillActiveSummary.tierLabel, 'Premium')
    assert.equal(cancelledStillActiveSummary.statusLabel, 'Cancelled')
    assert.equal(cancelledStillActiveSummary.periodDateVerb, 'Ends')
    assert.equal(cancelledStillActiveSummary.subscription.canCancel, false)
    assert.equal(cancelledStillActiveSummary.subscription.canManage, true)

    // past_due inside paid period vs past_due elapsed
    assert.equal(
      describeUserSubscription({
        ...activeOverview,
        hasActivePremium: true,
        subscription: {
          ...activeOverview.subscription!,
          status: 'past_due',
          entitledNow: true,
        },
      }).badgeLabel,
      'Past due',
    )
    assert.equal(
      describeUserSubscription({
        ...activeOverview,
        hasActivePremium: false,
        subscription: {
          ...activeOverview.subscription!,
          status: 'past_due',
          entitledNow: false,
        },
      }).badgeLabel,
      'Expired',
    )

    // Loading & error states do not misreport Free or stale Premium
    assert.equal(
      describeAccountMembershipSummary(null, { loading: true }).tierLabel,
      'Checking',
    )
    assert.equal(
      describeAccountMembershipSummary(null, { error: 'Network error' })
        .tierLabel,
      'Unavailable',
    )
  })

  it('classifies HLS, MP4, and explicit unsupported DASH playback strategies accurately', () => {
    assert.equal(
      getStreamPlaybackStrategy('https://cdn.example.com/live/stream.m3u8'),
      'hls',
    )
    assert.equal(
      getStreamPlaybackStrategy('https://cdn.example.com/live/stream', 'hls'),
      'hls',
    )
    assert.equal(
      getStreamPlaybackStrategy('https://cdn.example.com/vod/clip.mp4', 'mp4'),
      'native',
    )
    assert.equal(
      getStreamPlaybackStrategy(
        'https://cdn.example.com/live/manifest.mpd',
        'dash',
      ),
      'unsupported_dash',
    )
    assert.equal(
      getStreamPlaybackStrategy('https://cdn.example.com/live/manifest.mpd'),
      'unsupported_dash',
    )
  })

  it('calls billing overview, cancel, manage-link, plans, and media access endpoints cleanly', async () => {
    const calls: string[] = []
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url === '/api/billing/plans') {
        return new Response(
          JSON.stringify({ plans: [], paidPlansConfigured: false }),
          { status: 200 },
        )
      }
      if (url === '/api/billing/subscription') {
        return new Response(
          JSON.stringify({
            hasActivePremium: false,
            profile: null,
            subscription: null,
            recentTransactions: [],
          }),
          { status: 200 },
        )
      }
      if (url === '/api/billing/subscription/cancel') {
        return new Response(
          JSON.stringify({
            hasActivePremium: true,
            subscription: {
              id: 'sub-1',
              planId: 'plan-1',
              planCode: 'premium_monthly',
              planName: 'Premium',
              planTier: 'premium',
              provider: 'paystack',
              status: 'cancelled',
              billingInterval: 'month',
              currentPeriodStart: null,
              currentPeriodEnd: '2026-12-11T00:00:00.000Z',
              cancelAtPeriodEnd: true,
              cancelledAt: '2026-11-11T00:00:00.000Z',
              endedAt: null,
              entitledNow: true,
            },
          }),
          { status: 200 },
        )
      }
      if (url === '/api/billing/subscription/manage-link') {
        return new Response(
          JSON.stringify({
            managementUrl: 'https://paystack.com/manage/SUB_123',
          }),
          { status: 200 },
        )
      }
      if (url === '/api/media/access') {
        return new Response(
          JSON.stringify({
            granted: false,
            code: 'PREMIUM_REQUIRED',
            error: 'Upgrade required.',
            upgradeRequired: true,
            reason: 'no_active_subscription',
          }),
          { status: 403 },
        )
      }
      return new Response('{}', { status: 404 })
    }

    const plans = await fetchPublicPlans(mockFetch)
    assert.equal(plans.paidPlansConfigured, false)

    const overview = await fetchBillingOverview(mockFetch)
    assert.equal(overview.hasActivePremium, false)

    const cancelled = await cancelUserSubscriptionRequest(mockFetch)
    assert.equal(cancelled.subscription.cancelAtPeriodEnd, true)

    const manage = await createManageSubscriptionLinkRequest(mockFetch)
    assert.equal(manage.managementUrl, 'https://paystack.com/manage/SUB_123')

    const media = await fetchProtectedMediaAccess(
      { matchId: '22222222-2222-4222-8222-222222222222' },
      mockFetch,
    )
    assert.equal(media.granted, false)
    if (!media.granted) {
      assert.equal(media.statusCode, 403)
      assert.equal(media.code, 'PREMIUM_REQUIRED')
      assert.equal(media.upgradeRequired, true)
    }

    assert.deepEqual(calls, [
      '/api/billing/plans',
      '/api/billing/subscription',
      '/api/billing/subscription/cancel',
      '/api/billing/subscription/manage-link',
      '/api/media/access',
    ])
  })
})
