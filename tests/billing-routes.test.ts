import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { describe, it } from 'node:test'
import {
  handleCancelUserSubscription,
  handleCreateManageLink,
  handleExpireOverdueCron,
  handleGetBillingPlans,
  handleGetUserSubscription,
  handlePaystackWebhook,
  handlePostCheckout,
  handleVerifyCheckout,
  type BillingHandlerDeps,
} from '@/lib/billing/handlers'
import { verifyPaystackSignature } from '@/lib/billing/paystack'
import type { BillingProvider } from '@/lib/billing/provider'
import { createFakeAdminClient } from './helpers/fake-supabase'
import type { ProfileRow, SubscriptionPlanRow } from './helpers/types-shim'

const ROUTE_WEBHOOK_SECRET = 'sk_test_route_webhook_secret'

function makePlan(
  overrides: Partial<SubscriptionPlanRow> = {},
): SubscriptionPlanRow {
  return {
    id: 'plan-1',
    code: 'premium_monthly',
    name: 'Premium Monthly',
    description: 'Full access',
    tier: 'premium',
    billing_interval: 'month',
    amount_minor: 1000,
    currency: 'NGN',
    provider: 'paystack',
    provider_plan_refs: { paystack: 'PLN_route_01' },
    features: [],
    is_active: true,
    sort_order: 1,
    created_at: '2026-11-11T00:00:00.000Z',
    updated_at: '2026-11-11T00:00:00.000Z',
    ...overrides,
  }
}

function makeProfile(id = 'user-route-1'): ProfileRow {
  return {
    id,
    email: 'route-fan@example.com',
    full_name: 'Route Fan',
    favorite_sport_id: null,
    favorite_sport_ids: [],
    favorite_teams: [],
    role: 'member',
    membership_tier: 'free',
    membership_status: 'active',
    provider_customer_ids: {},
    subscription_expires_at: null,
    created_at: '2026-11-11T00:00:00.000Z',
    updated_at: '2026-11-11T00:00:00.000Z',
  }
}

function makeRouteProvider(): BillingProvider {
  return {
    id: 'paystack',
    async initializeCheckout(input) {
      return {
        provider: 'paystack',
        reference: input.reference,
        authorizationUrl: `https://checkout.paystack.com/${input.reference}`,
        accessCode: 'acc_route_1',
        raw: {},
      }
    },
    async verifyTransaction(reference) {
      return {
        provider: 'paystack',
        reference,
        providerTransactionId: '1010101',
        status: 'success',
        amountMinor: 1000,
        currency: 'NGN',
        paidAt: '2026-11-11T10:00:00.000Z',
        channel: 'card',
        customerCode: 'CUS_route_1',
        authorizationCode: 'AUTH_route_secret',
        authorizationReusable: true,
        planCode: 'PLN_route_01',
        subscriptionCode: 'SUB_route_1',
        metadata: { user_id: 'user-route-1' },
        raw: {},
      }
    },
    async disableSubscription() {},
    async generateManagementLink(subscriptionCode) {
      return {
        provider: 'paystack',
        subscriptionCode,
        managementUrl: `https://paystack.com/manage/${subscriptionCode}`,
        raw: {},
      }
    },
    verifyWebhookSignature(rawBody, signature) {
      return verifyPaystackSignature(rawBody, signature, ROUTE_WEBHOOK_SECRET)
    },
  }
}

describe('HTTP billing, webhook, and cron route handlers', () => {
  it('enforces authentication on protected routes and returns no-store headers', async () => {
    const { admin } = createFakeAdminClient()
    const deps: BillingHandlerDeps = {
      getSessionUser: async () => null,
      getAdminClient: () => admin,
      getProvider: () => makeRouteProvider(),
      resolveOrigin: () => 'https://sportivra.example.com',
    }

    const plansRes = await handleGetBillingPlans(deps)
    assert.equal(plansRes.status, 200)
    assert.equal(plansRes.headers.get('cache-control'), 'no-store, max-age=0')
    assert.deepEqual(await plansRes.json(), {
      plans: [],
      paidPlansConfigured: false,
      checkoutConfigured: false,
    })

    const checkoutUnauth = await handlePostCheckout(
      new Request('https://sportivra.example.com/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planCode: 'premium_monthly' }),
      }),
      deps,
    )
    assert.equal(checkoutUnauth.status, 401)
    assert.equal(checkoutUnauth.headers.get('cache-control'), 'no-store, max-age=0')

    const verifyUnauth = await handleVerifyCheckout(
      new Request(
        'https://sportivra.example.com/api/billing/verify?reference=SPTV_1234',
      ),
      deps,
    )
    assert.equal(verifyUnauth.status, 401)
    assert.equal(verifyUnauth.headers.get('cache-control'), 'no-store, max-age=0')

    const subUnauth = await handleGetUserSubscription(deps)
    assert.equal(subUnauth.status, 401)
    assert.equal(subUnauth.headers.get('cache-control'), 'no-store, max-age=0')

    const cancelUnauth = await handleCancelUserSubscription(deps)
    assert.equal(cancelUnauth.status, 401)
    assert.equal(cancelUnauth.headers.get('cache-control'), 'no-store, max-age=0')

    const manageUnauth = await handleCreateManageLink(deps)
    assert.equal(manageUnauth.status, 401)
    assert.equal(manageUnauth.headers.get('cache-control'), 'no-store, max-age=0')
  })

  it('rejects malformed requests, invalid webhook payloads, and sets no-store on all billing error responses', async () => {
    const { admin } = createFakeAdminClient({
      profiles: [makeProfile()],
      subscription_plans: [makePlan()],
    })

    const deps: BillingHandlerDeps = {
      getSessionUser: async () => ({
        id: 'user-route-1',
        email: 'route-fan@example.com',
      }),
      getAdminClient: () => admin,
      getProvider: () => makeRouteProvider(),
      resolveOrigin: () => 'https://sportivra.example.com',
      getExpectedCronSecret: () => 'super-cron-secret',
    }

    const badCheckoutJson = await handlePostCheckout(
      new Request('https://sportivra.example.com/api/billing/checkout', {
        method: 'POST',
        body: '{invalid json',
      }),
      deps,
    )
    assert.equal(badCheckoutJson.status, 400)
    assert.equal(badCheckoutJson.headers.get('cache-control'), 'no-store, max-age=0')
    assert.equal(((await badCheckoutJson.json()) as { code: string }).code, 'INVALID_JSON')

    const badPlanType = await handlePostCheckout(
      new Request('https://sportivra.example.com/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planCode: 123 }),
      }),
      deps,
    )
    assert.equal(badPlanType.status, 400)
    assert.equal(badPlanType.headers.get('cache-control'), 'no-store, max-age=0')
    assert.equal(((await badPlanType.json()) as { code: string }).code, 'PLAN_CODE_REQUIRED')

    const badVerifyJson = await handleVerifyCheckout(
      new Request('https://sportivra.example.com/api/billing/verify', {
        method: 'POST',
        body: 'not json',
      }),
      deps,
    )
    assert.equal(badVerifyJson.status, 400)
    assert.equal(badVerifyJson.headers.get('cache-control'), 'no-store, max-age=0')
    assert.equal(((await badVerifyJson.json()) as { code: string }).code, 'INVALID_JSON')

    const signRaw = (raw: string) =>
      crypto
        .createHmac('sha512', ROUTE_WEBHOOK_SECRET)
        .update(raw, 'utf8')
        .digest('hex')

    const malformedWebhook = '{bad-json'
    const badWebhookJson = await handlePaystackWebhook(
      new Request('https://sportivra.example.com/api/webhooks/paystack', {
        method: 'POST',
        headers: { 'x-paystack-signature': signRaw(malformedWebhook) },
        body: malformedWebhook,
      }),
      deps,
    )
    assert.equal(badWebhookJson.status, 400)
    assert.equal(badWebhookJson.headers.get('cache-control'), 'no-store, max-age=0')
    assert.equal(((await badWebhookJson.json()) as { code: string }).code, 'INVALID_JSON')

    const missingEventPayload = JSON.stringify({ data: { id: 1 } })
    const missingEventRes = await handlePaystackWebhook(
      new Request('https://sportivra.example.com/api/webhooks/paystack', {
        method: 'POST',
        headers: { 'x-paystack-signature': signRaw(missingEventPayload) },
        body: missingEventPayload,
      }),
      deps,
    )
    assert.equal(missingEventRes.status, 400)
    assert.equal(missingEventRes.headers.get('cache-control'), 'no-store, max-age=0')
    assert.equal(((await missingEventRes.json()) as { code: string }).code, 'MISSING_EVENT_TYPE')

    const badCronGrace = await handleExpireOverdueCron(
      new Request(
        'https://sportivra.example.com/api/cron/expire-subscriptions?grace=999%20years',
        {
          method: 'POST',
          headers: { authorization: 'Bearer super-cron-secret' },
        },
      ),
      deps,
    )
    assert.equal(badCronGrace.status, 400)
    assert.equal(badCronGrace.headers.get('cache-control'), 'no-store, max-age=0')

    // Unexpected internal error also returns Cache-Control: no-store
    const internalErrRes = await handleGetUserSubscription({
      ...deps,
      getAdminClient: () => {
        throw new Error('Unexpected storage outage')
      },
    })
    assert.equal(internalErrRes.status, 500)
    assert.equal(internalErrRes.headers.get('cache-control'), 'no-store, max-age=0')
  })

  it('completes checkout -> verify -> overview -> webhook -> manage -> cancel HTTP flow', async () => {
    const { admin, state } = createFakeAdminClient({
      profiles: [makeProfile()],
      subscription_plans: [makePlan()],
    })

    const deps: BillingHandlerDeps = {
      getSessionUser: async () => ({
        id: 'user-route-1',
        email: 'route-fan@example.com',
      }),
      getAdminClient: () => admin,
      getProvider: () => makeRouteProvider(),
      resolveOrigin: () => 'https://sportivra.example.com',
      getExpectedCronSecret: () => 'super-cron-secret',
    }

    const plansRes = await handleGetBillingPlans(deps)
    assert.equal(plansRes.status, 200)
    const plansJson = (await plansRes.json()) as {
      plans: Array<{ code: string; checkoutReady: boolean }>
      paidPlansConfigured: boolean
      checkoutConfigured: boolean
    }
    assert.equal(plansJson.paidPlansConfigured, true)
    assert.equal(plansJson.checkoutConfigured, true)
    assert.equal(plansJson.plans[0].checkoutReady, true)
    // Ensure internal provider_plan_refs are not leaked on public plans endpoint
    assert.equal(JSON.stringify(plansJson).includes('PLN_route_01'), false)

    // Without Paystack plan codes or PAYSTACK_SECRET_KEY, public plans still expose approved prices
    // with checkoutConfigured=false and checkout endpoints strictly return 409 PLAN_NOT_CONFIGURED.
    const prevPaystackKey = process.env.PAYSTACK_SECRET_KEY
    delete process.env.PAYSTACK_SECRET_KEY
    try {
      const noCodesDb = createFakeAdminClient({
        profiles: [makeProfile()],
        subscription_plans: [
          makePlan({
            id: 'plan-free',
            code: 'free',
            name: 'SPORTIVRA Free',
            tier: 'free',
            billing_interval: 'none',
            amount_minor: 0,
            currency: null,
            provider: null,
            provider_plan_refs: {},
            sort_order: 0,
          }),
          makePlan({
            id: 'plan-monthly',
            code: 'premium_monthly',
            name: 'Monthly Premium',
            billing_interval: 'month',
            amount_minor: 350000,
            currency: 'NGN',
            provider_plan_refs: {},
            sort_order: 1,
          }),
          makePlan({
            id: 'plan-yearly',
            code: 'premium_yearly',
            name: 'Yearly Premium',
            billing_interval: 'year',
            amount_minor: 3500000,
            currency: 'NGN',
            provider_plan_refs: {},
            sort_order: 2,
          }),
        ],
      })

      const publicNoCodesRes = await handleGetBillingPlans({
        getAdminClient: () => noCodesDb.admin,
      })
      assert.equal(publicNoCodesRes.status, 200)
      const publicNoCodesJson = (await publicNoCodesRes.json()) as {
        plans: Array<{
          code: string
          amountMinor: number | null
          currency: string | null
          checkoutReady: boolean
        }>
        paidPlansConfigured: boolean
        checkoutConfigured: boolean
      }
      assert.equal(publicNoCodesJson.paidPlansConfigured, true)
      assert.equal(publicNoCodesJson.checkoutConfigured, false)
      assert.equal(publicNoCodesJson.plans.length, 3)
      assert.equal(publicNoCodesJson.plans[1].amountMinor, 350000)
      assert.equal(publicNoCodesJson.plans[1].checkoutReady, false)
      assert.equal(publicNoCodesJson.plans[2].amountMinor, 3500000)
      assert.equal(publicNoCodesJson.plans[2].checkoutReady, false)

      const blockedCheckoutRes = await handlePostCheckout(
        new Request('https://sportivra.example.com/api/billing/checkout', {
          method: 'POST',
          body: JSON.stringify({ planCode: 'premium_monthly' }),
        }),
        { ...deps, getAdminClient: () => noCodesDb.admin },
      )
      assert.equal(blockedCheckoutRes.status, 409)
      assert.equal(
        ((await blockedCheckoutRes.json()) as { code: string }).code,
        'PLAN_NOT_CONFIGURED',
      )
    } finally {
      if (prevPaystackKey !== undefined) {
        process.env.PAYSTACK_SECRET_KEY = prevPaystackKey
      }
    }

    const checkoutRes = await handlePostCheckout(
      new Request('https://sportivra.example.com/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planCode: 'premium_monthly' }),
      }),
      deps,
    )
    assert.equal(checkoutRes.status, 200)
    const checkoutBody = (await checkoutRes.json()) as {
      reference: string
      authorizationUrl: string
    }
    assert.match(checkoutBody.reference, /^SPTV_/)

    const verifyRes = await handleVerifyCheckout(
      new Request('https://sportivra.example.com/api/billing/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: checkoutBody.reference }),
      }),
      deps,
    )
    assert.equal(verifyRes.status, 200)
    assert.equal(verifyRes.headers.get('cache-control'), 'no-store, max-age=0')
    const verifyBody = (await verifyRes.json()) as {
      status: string
      hasActivePremium: boolean
    }
    assert.equal(verifyBody.status, 'succeeded')
    assert.equal(verifyBody.hasActivePremium, true)

    const verifyGetIdempotent = await handleVerifyCheckout(
      new Request(
        `https://sportivra.example.com/api/billing/verify?reference=${checkoutBody.reference}`,
      ),
      deps,
    )
    assert.equal(verifyGetIdempotent.status, 200)
    assert.equal(
      ((await verifyGetIdempotent.json()) as { alreadyProcessed: boolean })
        .alreadyProcessed,
      true,
    )

    // Deliver subscription.create webhook with email_token
    const subCreateBody = JSON.stringify({
      id: 'evt_route_sub_1',
      event: 'subscription.create',
      data: {
        subscription_code: 'SUB_route_1',
        email_token: 'tok_route_secret',
        next_payment_date: '2099-12-11T10:00:00.000Z',
        customer: { customer_code: 'CUS_route_1' },
        authorization: { authorization_code: 'AUTH_route_secret' },
        plan: { plan_code: 'PLN_route_01' },
      },
    })
    const validSig = crypto
      .createHmac('sha512', ROUTE_WEBHOOK_SECRET)
      .update(subCreateBody, 'utf8')
      .digest('hex')

    const badWebhookRes = await handlePaystackWebhook(
      new Request('https://sportivra.example.com/api/webhooks/paystack', {
        method: 'POST',
        headers: { 'x-paystack-signature': 'f'.repeat(128) },
        body: subCreateBody,
      }),
      deps,
    )
    assert.equal(badWebhookRes.status, 401)
    assert.equal(badWebhookRes.headers.get('cache-control'), 'no-store, max-age=0')

    const okWebhookRes = await handlePaystackWebhook(
      new Request('https://sportivra.example.com/api/webhooks/paystack', {
        method: 'POST',
        headers: { 'x-paystack-signature': validSig },
        body: subCreateBody,
      }),
      deps,
    )
    assert.equal(okWebhookRes.status, 200)

    const overviewRes = await handleGetUserSubscription(deps)
    assert.equal(overviewRes.status, 200)
    const overviewText = await overviewRes.text()
    assert.equal(overviewText.includes('tok_route_secret'), false)
    assert.equal(overviewText.includes('AUTH_route_secret'), false)

    const manageRes = await handleCreateManageLink(deps)
    assert.equal(manageRes.status, 200)
    assert.deepEqual(await manageRes.json(), {
      managementUrl: 'https://paystack.com/manage/SUB_route_1',
    })

    const cancelRes = await handleCancelUserSubscription(deps)
    assert.equal(cancelRes.status, 200)
    const cancelBody = (await cancelRes.json()) as {
      hasActivePremium: boolean
      subscription: { status: string; cancelAtPeriodEnd: boolean }
    }
    assert.equal(cancelBody.subscription.status, 'cancelled')
    assert.equal(cancelBody.subscription.cancelAtPeriodEnd, true)
    assert.equal(cancelBody.hasActivePremium, true)

    // Cron endpoint security & expiry execution
    const cronUnauth = await handleExpireOverdueCron(
      new Request('https://sportivra.example.com/api/cron/expire-subscriptions', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-token' },
      }),
      deps,
    )
    assert.equal(cronUnauth.status, 401)
    assert.equal(cronUnauth.headers.get('cache-control'), 'no-store, max-age=0')

    const cronUnconfigured = await handleExpireOverdueCron(
      new Request('https://sportivra.example.com/api/cron/expire-subscriptions', {
        method: 'POST',
      }),
      { ...deps, getExpectedCronSecret: () => '' },
    )
    assert.equal(cronUnconfigured.status, 503)
    assert.equal(cronUnconfigured.headers.get('cache-control'), 'no-store, max-age=0')

    // Move period_end into the past and run authorized cron expiry
    state.subscriptions[0].current_period_end = '2026-01-01T00:00:00.000Z'
    const cronOk = await handleExpireOverdueCron(
      new Request('https://sportivra.example.com/api/cron/expire-subscriptions', {
        method: 'POST',
        headers: { authorization: 'Bearer super-cron-secret' },
      }),
      deps,
    )
    assert.equal(cronOk.status, 200)
    assert.deepEqual(await cronOk.json(), {
      ok: true,
      expiredCount: 1,
      graceInterval: '0 seconds',
    })
    assert.equal(state.profiles[0].membership_tier, 'free')
    assert.equal(state.profiles[0].membership_status, 'expired')
  })
})
