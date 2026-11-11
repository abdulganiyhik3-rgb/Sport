import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterEach, describe, it } from 'node:test'
import {
  calculatePeriodEnd,
  isPlanCheckoutReady,
  isSubscriptionEntitled,
} from '@/lib/billing/access'
import {
  resolveServerAppOrigin,
  timingSafeEqualSecret,
} from '@/lib/billing/env'
import {
  createPaystackProvider,
  PaystackApiError,
  verifyPaystackSignature,
} from '@/lib/billing/paystack'

const MOCK_SECRET = 'sk_test_mock_signature_key_only'

function signPayload(rawBody: string, secret = MOCK_SECRET): string {
  return crypto
    .createHmac('sha512', secret)
    .update(rawBody, 'utf8')
    .digest('hex')
}

describe('Paystack signature & REST adapter', () => {
  const savedEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...savedEnv }
  })

  it('verifies valid HMAC-SHA512 webhook signatures and rejects tampered/malformed ones', () => {
    const rawBody = '{"event":"charge.success","data":{"id":991,"amount":1000}}'
    const validSig = signPayload(rawBody)

    assert.equal(verifyPaystackSignature(rawBody, validSig, MOCK_SECRET), true)
    assert.equal(
      verifyPaystackSignature(rawBody, validSig.toUpperCase(), MOCK_SECRET),
      true,
    )

    // Tampered whitespace or payload must fail
    assert.equal(
      verifyPaystackSignature(`${rawBody} `, validSig, MOCK_SECRET),
      false,
    )
    assert.equal(
      verifyPaystackSignature(
        rawBody.replace('1000', '100'),
        validSig,
        MOCK_SECRET,
      ),
      false,
    )

    // Wrong key, short/long string, non-hex, or null must fail safely without throwing
    assert.equal(
      verifyPaystackSignature(rawBody, validSig, 'sk_test_other'),
      false,
    )
    assert.equal(verifyPaystackSignature(rawBody, 'deadbeef', MOCK_SECRET), false)
    assert.equal(
      verifyPaystackSignature(rawBody, 'z'.repeat(128), MOCK_SECRET),
      false,
    )
    assert.equal(verifyPaystackSignature(rawBody, null, MOCK_SECRET), false)
    assert.equal(verifyPaystackSignature(rawBody, validSig, ''), false)
  })

  it('compares cron secrets in constant time regardless of length differences', () => {
    assert.equal(
      timingSafeEqualSecret('cron-secret-alpha-123', 'cron-secret-alpha-123'),
      true,
    )
    assert.equal(
      timingSafeEqualSecret('cron-secret-alpha-124', 'cron-secret-alpha-123'),
      false,
    )
    assert.equal(
      timingSafeEqualSecret('short', 'cron-secret-alpha-123'),
      false,
    )
    assert.equal(timingSafeEqualSecret('', 'cron-secret-alpha-123'), false)
    assert.equal(timingSafeEqualSecret(null, 'cron-secret-alpha-123'), false)
  })

  it('resolves only trusted application origins for Paystack callback URLs', () => {
    delete process.env.APP_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_URL
    delete process.env.ALLOWED_APP_ORIGINS

    process.env.APP_URL = 'https://sportivra.example.com/some/path'
    assert.equal(
      resolveServerAppOrigin('https://evil.attacker.test/api/billing/checkout'),
      'https://sportivra.example.com',
    )

    delete process.env.APP_URL
    // Localhost loopback is permitted for local dev
    assert.equal(
      resolveServerAppOrigin('http://localhost:3000/api/billing/checkout'),
      'http://localhost:3000',
    )
    // Untrusted external origin is rejected when no APP_URL or allowlist matches
    assert.throws(
      () =>
        resolveServerAppOrigin(
          'https://evil.attacker.test/api/billing/checkout',
        ),
      /trusted application origin/i,
    )

    // Allowlisted preview origin succeeds
    process.env.ALLOWED_APP_ORIGINS = 'https://3000-sandbox.e2b.app'
    assert.equal(
      resolveServerAppOrigin(
        'https://3000-sandbox.e2b.app/api/billing/checkout',
      ),
      'https://3000-sandbox.e2b.app',
    )
  })

  it('initializes checkout, verifies transaction, disables subscription, and creates manage link via Paystack API', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = []

    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, method, body })

      if (url.endsWith('/transaction/initialize')) {
        return Response.json({
          status: true,
          message: 'Authorization URL created',
          data: {
            authorization_url: 'https://checkout.paystack.com/mock_session',
            access_code: 'mock_access_123',
            reference: body.reference,
          },
        })
      }

      if (url.includes('/transaction/verify/')) {
        return Response.json({
          status: true,
          message: 'Verification successful',
          data: {
            id: 778899,
            status: 'success',
            reference: 'SPTV_ref_001',
            amount: 1000,
            currency: 'NGN',
            paid_at: '2026-11-11T12:00:00.000Z',
            channel: 'card',
            plan: 'PLN_mock_monthly',
            customer: { customer_code: 'CUS_mock_01' },
            authorization: {
              authorization_code: 'AUTH_mock_01',
              reusable: true,
            },
            subscription: { subscription_code: 'SUB_mock_01' },
            metadata: { user_id: 'user-1' },
          },
        })
      }

      if (url.endsWith('/subscription/disable')) {
        return Response.json({
          status: true,
          message: 'Subscription disabled successfully',
        })
      }

      if (url.endsWith('/subscription/SUB_mock_01/manage/link')) {
        return Response.json({
          status: true,
          message: 'Link generated',
          data: { link: 'https://paystack.com/manage/mock_link' },
        })
      }

      return Response.json({ status: false, message: 'Not found' }, { status: 404 })
    }

    const provider = createPaystackProvider({
      secretKey: MOCK_SECRET,
      fetchImpl: mockFetch,
    })

    const checkout = await provider.initializeCheckout({
      userId: 'user-1',
      email: 'fan@example.com',
      planId: 'plan-1',
      planCode: 'premium_monthly',
      billingInterval: 'month',
      amountMinor: 1000,
      currency: 'NGN',
      providerPlanRef: 'PLN_mock_monthly',
      reference: 'SPTV_ref_001',
      callbackUrl: 'https://sportivra.example.com/billing/callback',
    })

    assert.equal(
      checkout.authorizationUrl,
      'https://checkout.paystack.com/mock_session',
    )
    assert.equal(checkout.accessCode, 'mock_access_123')
    assert.equal(calls[0].method, 'POST')

    const verified = await provider.verifyTransaction('SPTV_ref_001')
    assert.equal(verified.status, 'success')
    assert.equal(verified.providerTransactionId, '778899')
    assert.equal(verified.amountMinor, 1000)
    assert.equal(verified.currency, 'NGN')
    assert.equal(verified.customerCode, 'CUS_mock_01')
    assert.equal(verified.authorizationCode, 'AUTH_mock_01')
    assert.equal(verified.subscriptionCode, 'SUB_mock_01')

    await provider.disableSubscription({
      subscriptionCode: 'SUB_mock_01',
      emailToken: 'tok_secret_01',
    })
    assert.deepEqual(calls[2].body, {
      code: 'SUB_mock_01',
      token: 'tok_secret_01',
    })

    const link = await provider.generateManagementLink('SUB_mock_01')
    assert.equal(link.managementUrl, 'https://paystack.com/manage/mock_link')

    // Also verify top-level data.subscription_code fallback when data.subscription is omitted
    const fallbackProvider = createPaystackProvider({
      secretKey: MOCK_SECRET,
      fetchImpl: async () =>
        Response.json({
          status: true,
          data: {
            id: 778900,
            status: 'success',
            reference: 'SPTV_ref_002',
            amount: 1000,
            currency: 'NGN',
            subscription_code: 'SUB_top_level_mock',
          },
        }),
    })
    const verifiedTopLevel = await fallbackProvider.verifyTransaction('SPTV_ref_002')
    assert.equal(verifiedTopLevel.subscriptionCode, 'SUB_top_level_mock')
  })

  it('rejects Paystack verification when reference or payload invariants fail', async () => {
    const mockFetch: typeof fetch = async () =>
      Response.json({
        status: true,
        data: {
          id: 1,
          status: 'success',
          reference: 'DIFFERENT_REF',
          amount: 1000,
          currency: 'NGN',
        },
      })

    const provider = createPaystackProvider({
      secretKey: MOCK_SECRET,
      fetchImpl: mockFetch,
    })

    await assert.rejects(
      () => provider.verifyTransaction('SPTV_expected_ref'),
      (err: unknown) =>
        err instanceof PaystackApiError && /reference mismatch/i.test(err.message),
    )
  })
})

describe('Entitlement & period helpers', () => {
  it('validates plan checkout readiness strictly without allowing unpriced or unlinked plans', () => {
    assert.equal(
      isPlanCheckoutReady({
        is_active: true,
        tier: 'premium',
        billing_interval: 'month',
        amount_minor: null,
        currency: null,
        provider: 'paystack',
        provider_plan_refs: {},
      }),
      false,
    )

    assert.equal(
      isPlanCheckoutReady({
        is_active: true,
        tier: 'premium',
        billing_interval: 'month',
        amount_minor: 1000,
        currency: 'NGN',
        provider: 'paystack',
        provider_plan_refs: {},
      }),
      false,
    )

    assert.equal(
      isPlanCheckoutReady({
        is_active: true,
        tier: 'free',
        billing_interval: 'none',
        amount_minor: null,
        currency: null,
        provider: null,
        provider_plan_refs: {},
      }),
      false,
    )

    assert.equal(
      isPlanCheckoutReady({
        is_active: true,
        tier: 'premium',
        billing_interval: 'month',
        amount_minor: 1000,
        currency: 'NGN',
        provider: 'paystack',
        provider_plan_refs: { paystack: 'PLN_mock_01' },
      }),
      true,
    )
  })

  it('evaluates entitlement across active, cancelled, past_due, expired, and incomplete states', () => {
    const now = new Date('2026-11-11T12:00:00.000Z')
    const future = '2026-12-11T12:00:00.000Z'
    const past = '2026-11-10T12:00:00.000Z'

    assert.equal(
      isSubscriptionEntitled(
        {
          status: 'active',
          planTier: 'premium',
          currentPeriodEnd: future,
          endedAt: null,
        },
        now,
      ),
      true,
    )
    assert.equal(
      isSubscriptionEntitled(
        {
          status: 'active',
          planTier: 'premium',
          currentPeriodEnd: past,
          endedAt: null,
        },
        now,
      ),
      false,
    )
    assert.equal(
      isSubscriptionEntitled(
        {
          status: 'cancelled',
          planTier: 'premium',
          currentPeriodEnd: future,
          endedAt: null,
        },
        now,
      ),
      true,
    )
    assert.equal(
      isSubscriptionEntitled(
        {
          status: 'cancelled',
          planTier: 'premium',
          currentPeriodEnd: future,
          endedAt: '2026-11-11T11:00:00.000Z',
        },
        now,
      ),
      false,
    )
    assert.equal(
      isSubscriptionEntitled(
        {
          status: 'past_due',
          planTier: 'premium',
          currentPeriodEnd: future,
          endedAt: null,
        },
        now,
      ),
      true,
    )
    assert.equal(
      isSubscriptionEntitled(
        {
          status: 'past_due',
          planTier: 'premium',
          currentPeriodEnd: past,
          endedAt: null,
        },
        now,
      ),
      false,
    )
    assert.equal(
      isSubscriptionEntitled(
        {
          status: 'expired',
          planTier: 'premium',
          currentPeriodEnd: future,
          endedAt: null,
        },
        now,
      ),
      false,
    )
    assert.equal(
      isSubscriptionEntitled(
        {
          status: 'incomplete',
          planTier: 'premium',
          currentPeriodEnd: future,
          endedAt: null,
        },
        now,
      ),
      false,
    )
  })

  it('clamps month-end billing dates cleanly in UTC', () => {
    const jan31 = new Date('2026-01-31T10:15:00.000Z')
    assert.equal(
      calculatePeriodEnd(jan31, 'month').toISOString(),
      '2026-02-28T10:15:00.000Z',
    )

    const leapFeb29 = new Date('2024-02-29T10:15:00.000Z')
    assert.equal(
      calculatePeriodEnd(leapFeb29, 'year').toISOString(),
      '2025-02-28T10:15:00.000Z',
    )
  })
})
