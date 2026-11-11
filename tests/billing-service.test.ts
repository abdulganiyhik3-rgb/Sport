import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { describe, it } from 'node:test'
import { hasActivePremiumAccess } from '@/lib/billing/access'
import { verifyPaystackSignature } from '@/lib/billing/paystack'
import type {
  BillingProvider,
  CheckoutInitInput,
  VerifiedTransactionResult,
} from '@/lib/billing/provider'
import {
  BillingError,
  cancelUserSubscription,
  createUserManageLink,
  getUserBillingOverview,
  initializeSubscriptionCheckout,
  listPublicPlans,
  processPaystackWebhook,
  runExpireOverdueSubscriptions,
  verifyAndActivateCheckout,
} from '@/lib/billing/service'
import { createFakeAdminClient } from './helpers/fake-supabase'
import type { ProfileRow, SubscriptionPlanRow } from './helpers/types-shim'

const TEST_WEBHOOK_SECRET = 'sk_test_webhook_secret_key'

function makeProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'user-1',
    email: 'custom-profile-email@example.com',
    full_name: 'Test Fan',
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
    ...overrides,
  }
}

function makeReadyPlan(
  overrides: Partial<SubscriptionPlanRow> = {},
): SubscriptionPlanRow {
  return {
    id: 'plan-monthly-1',
    code: 'premium_monthly',
    name: 'SPORTIVRA Premium Monthly',
    description: 'Full access',
    tier: 'premium',
    billing_interval: 'month',
    amount_minor: 1000,
    currency: 'NGN',
    provider: 'paystack',
    provider_plan_refs: { paystack: 'PLN_test_monthly' },
    features: [],
    is_active: true,
    sort_order: 1,
    created_at: '2026-11-11T00:00:00.000Z',
    updated_at: '2026-11-11T00:00:00.000Z',
    ...overrides,
  }
}

function makeMockProvider(
  overrides: Partial<BillingProvider> = {},
): BillingProvider {
  return {
    id: 'paystack',
    async initializeCheckout(input: CheckoutInitInput) {
      return {
        provider: 'paystack',
        reference: input.reference,
        authorizationUrl: `https://checkout.paystack.com/${input.reference}`,
        accessCode: `acc_${input.reference}`,
        raw: {},
      }
    },
    async verifyTransaction(reference: string): Promise<VerifiedTransactionResult> {
      return {
        provider: 'paystack',
        reference,
        providerTransactionId: '900001',
        status: 'success',
        amountMinor: 1000,
        currency: 'NGN',
        paidAt: '2026-11-11T10:00:00.000Z',
        channel: 'card',
        customerCode: 'CUS_test_1',
        authorizationCode: 'AUTH_test_1',
        authorizationReusable: true,
        planCode: 'PLN_test_monthly',
        subscriptionCode: 'SUB_test_1',
        metadata: { user_id: 'user-1' },
        raw: {},
      }
    },
    async disableSubscription() {},
    async generateManagementLink(subscriptionCode: string) {
      return {
        provider: 'paystack',
        subscriptionCode,
        managementUrl: `https://paystack.com/manage/${subscriptionCode}`,
        raw: {},
      }
    },
    verifyWebhookSignature(rawBody: string, signature: string | null) {
      return verifyPaystackSignature(rawBody, signature, TEST_WEBHOOK_SECRET)
    },
    ...overrides,
  }
}

function signWebhook(body: unknown): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify(body)
  const signature = crypto
    .createHmac('sha512', TEST_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('hex')
  return { rawBody, signature }
}

describe('Unconfigured plan safety', () => {
  it('returns empty plans when no plans exist and filters out unpriced/unlinked paid plans', async () => {
    const emptyDb = createFakeAdminClient()
    const emptyRes = await listPublicPlans(emptyDb.admin)
    assert.deepEqual(emptyRes, { plans: [], paidPlansConfigured: false })

    const unconfiguredDb = createFakeAdminClient({
      subscription_plans: [
        makeReadyPlan({
          id: 'p-free',
          code: 'free',
          name: 'Free',
          tier: 'free',
          billing_interval: 'none',
          amount_minor: null,
          currency: null,
          provider: null,
          provider_plan_refs: {},
        }),
        makeReadyPlan({
          id: 'p-unpriced',
          code: 'premium_draft',
          amount_minor: null,
          currency: null,
          provider_plan_refs: {},
        }),
        makeReadyPlan({
          id: 'p-unlinked',
          code: 'premium_no_pln',
          amount_minor: 1000,
          currency: 'NGN',
          provider_plan_refs: {},
        }),
      ],
    })

    const filteredRes = await listPublicPlans(unconfiguredDb.admin)
    assert.equal(filteredRes.paidPlansConfigured, false)
    assert.equal(filteredRes.plans.length, 1)
    assert.equal(filteredRes.plans[0].code, 'free')
  })

  it('refuses checkout when plan pricing or Paystack plan code is not configured', async () => {
    const { admin, state } = createFakeAdminClient({
      profiles: [makeProfile()],
      subscription_plans: [
        makeReadyPlan({
          code: 'premium_unlinked',
          provider_plan_refs: {},
        }),
      ],
    })

    await assert.rejects(
      () =>
        initializeSubscriptionCheckout(
          { admin, provider: makeMockProvider() },
          {
            userId: 'user-1',
            userEmail: 'verified-auth@example.com',
            planCode: 'premium_unlinked',
            appOrigin: 'https://sportivra.example.com',
          },
        ),
      (err: unknown) =>
        err instanceof BillingError &&
        err.statusCode === 409 &&
        err.code === 'PLAN_NOT_CONFIGURED',
    )
    assert.equal(state.payment_transactions.length, 0)
  })
})

describe('Checkout, payment verification, IDOR & duplicate payment protection', () => {
  it('initializes checkout with verified Auth email (ignoring editable profile email) and activates on verification', async () => {
    let capturedEmail = ''
    const { admin, state } = createFakeAdminClient({
      profiles: [makeProfile({ email: 'spoofed-profile-email@evil.test' })],
      subscription_plans: [makeReadyPlan()],
    })

    const provider = makeMockProvider({
      async initializeCheckout(input) {
        capturedEmail = input.email
        return {
          provider: 'paystack',
          reference: input.reference,
          authorizationUrl: `https://checkout.paystack.com/${input.reference}`,
          accessCode: 'acc_1',
          raw: {},
        }
      },
    })

    const init = await initializeSubscriptionCheckout(
      { admin, provider },
      {
        userId: 'user-1',
        userEmail: 'verified-auth@example.com',
        planCode: 'premium_monthly',
        appOrigin: 'https://sportivra.example.com',
      },
    )

    // W5: must strictly use Auth user email, not editable profiles.email
    assert.equal(capturedEmail, 'verified-auth@example.com')
    assert.equal(state.payment_transactions.length, 1)
    assert.equal(state.payment_transactions[0].status, 'pending')
    assert.equal(
      state.payment_transactions[0].provider_checkout_ref,
      init.reference,
    )
    assert.equal(state.payment_transactions[0].provider_transaction_ref, null)

    const verifyRes = await verifyAndActivateCheckout(
      { admin, provider },
      { userId: 'user-1', reference: init.reference },
    )

    assert.equal(verifyRes.status, 'succeeded')
    assert.equal(verifyRes.alreadyProcessed, false)
    assert.equal(verifyRes.hasActivePremium, true)
    assert.equal(verifyRes.subscription?.status, 'active')
    assert.equal(state.profiles[0].membership_tier, 'premium')
    assert.equal(state.profiles[0].membership_status, 'active')
    assert.deepEqual(state.profiles[0].provider_customer_ids, {
      paystack: 'CUS_test_1',
    })
    assert.equal(state.subscription_provider_tokens.length, 1)
    assert.equal(
      state.subscription_provider_tokens[0].authorization_code,
      'AUTH_test_1',
    )

    // Idempotent duplicate verify call must not extend or duplicate subscription
    const initialPeriodEnd = state.subscriptions[0].current_period_end
    const secondVerify = await verifyAndActivateCheckout(
      { admin, provider },
      { userId: 'user-1', reference: init.reference },
    )
    assert.equal(secondVerify.alreadyProcessed, true)
    assert.equal(state.subscriptions.length, 1)
    assert.equal(state.subscriptions[0].current_period_end, initialPeriodEnd)
  })

  it('blocks another user from verifying someone else’s payment reference (IDOR -> 403)', async () => {
    const { admin, state } = createFakeAdminClient({
      profiles: [
        makeProfile({ id: 'user-1' }),
        makeProfile({ id: 'user-2', email: 'other@example.com' }),
      ],
      subscription_plans: [makeReadyPlan()],
    })
    const provider = makeMockProvider()

    const init = await initializeSubscriptionCheckout(
      { admin, provider },
      {
        userId: 'user-1',
        userEmail: 'user1@example.com',
        planCode: 'premium_monthly',
        appOrigin: 'https://sportivra.example.com',
      },
    )

    await assert.rejects(
      () =>
        verifyAndActivateCheckout(
          { admin, provider },
          { userId: 'user-2', reference: init.reference },
        ),
      (err: unknown) =>
        err instanceof BillingError &&
        err.statusCode === 403 &&
        err.code === 'FORBIDDEN',
    )
    assert.equal(state.subscriptions.length, 0)
  })

  it('rejects tampered payment amount or currency and marks pending transaction failed', async () => {
    const { admin, state } = createFakeAdminClient({
      profiles: [makeProfile()],
      subscription_plans: [makeReadyPlan({ amount_minor: 1000, currency: 'NGN' })],
    })
    const tamperedProvider = makeMockProvider({
      async verifyTransaction(reference) {
        return {
          provider: 'paystack',
          reference,
          providerTransactionId: '900099',
          status: 'success',
          amountMinor: 100, // underpaid tamper!
          currency: 'NGN',
          paidAt: '2026-11-11T10:00:00.000Z',
          channel: 'card',
          customerCode: 'CUS_test_1',
          authorizationCode: 'AUTH_test_1',
          authorizationReusable: true,
          planCode: 'PLN_test_monthly',
          subscriptionCode: 'SUB_test_1',
          metadata: { user_id: 'user-1' },
          raw: {},
        }
      },
    })

    const init = await initializeSubscriptionCheckout(
      { admin, provider: tamperedProvider },
      {
        userId: 'user-1',
        userEmail: 'fan@example.com',
        planCode: 'premium_monthly',
        appOrigin: 'https://sportivra.example.com',
      },
    )

    await assert.rejects(
      () =>
        verifyAndActivateCheckout(
          { admin, provider: tamperedProvider },
          { userId: 'user-1', reference: init.reference },
        ),
      (err: unknown) =>
        err instanceof BillingError && err.code === 'PAYMENT_MISMATCH',
    )
    assert.equal(state.payment_transactions[0].status, 'failed')
    assert.equal(state.subscriptions.length, 0)
    assert.equal(await hasActivePremiumAccess(admin, 'user-1'), false)
  })

  it('prevents duplicate checkout when user already has active or past_due subscription', async () => {
    const { admin } = createFakeAdminClient({
      profiles: [makeProfile()],
      subscription_plans: [makeReadyPlan()],
      subscriptions: [
        {
          id: 'sub-existing',
          user_id: 'user-1',
          plan_id: 'plan-monthly-1',
          provider: 'paystack',
          provider_customer_ref: 'CUS_1',
          provider_subscription_ref: 'SUB_1',
          status: 'active',
          billing_interval: 'month',
          current_period_start: '2026-11-01T00:00:00.000Z',
          current_period_end: '2099-12-01T00:00:00.000Z',
          cancel_at_period_end: false,
          cancelled_at: null,
          ended_at: null,
          metadata: {},
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z',
        },
      ],
    })

    await assert.rejects(
      () =>
        initializeSubscriptionCheckout(
          { admin, provider: makeMockProvider() },
          {
            userId: 'user-1',
            userEmail: 'fan@example.com',
            planCode: 'premium_monthly',
            appOrigin: 'https://sportivra.example.com',
          },
        ),
      (err: unknown) =>
        err instanceof BillingError &&
        err.statusCode === 409 &&
        err.code === 'ALREADY_SUBSCRIBED',
    )
  })
})

describe('Webhooks, duplicate delivery, lifecycle & server-only token isolation', () => {
  it('rejects forged webhook signatures with 401 without inserting into webhook_events', async () => {
    const { admin, state } = createFakeAdminClient({
      profiles: [makeProfile()],
      subscription_plans: [makeReadyPlan()],
    })

    await assert.rejects(
      () =>
        processPaystackWebhook(
          { admin, provider: makeMockProvider() },
          {
            rawBody: JSON.stringify({
              id: 'evt_forged_1',
              event: 'charge.success',
              data: { reference: 'SPTV_x', amount: 1000, currency: 'NGN' },
            }),
            signature: '0'.repeat(128),
          },
        ),
      (err: unknown) =>
        err instanceof BillingError &&
        err.statusCode === 401 &&
        err.code === 'INVALID_WEBHOOK_SIGNATURE',
    )
    assert.equal(state.webhook_events.length, 0)
  })

  it('processes charge.success + subscription.create, deduplicates repeats, and handles cancel/fail/refund', async () => {
    const { admin, state } = createFakeAdminClient({
      profiles: [makeProfile()],
      subscription_plans: [makeReadyPlan()],
    })
    const provider = makeMockProvider()

    const init = await initializeSubscriptionCheckout(
      { admin, provider },
      {
        userId: 'user-1',
        userEmail: 'fan@example.com',
        planCode: 'premium_monthly',
        appOrigin: 'https://sportivra.example.com',
      },
    )

    // 1. Out-of-order subscription.create BEFORE charge.success returns 503 for safe Paystack retry
    const earlySubCreate = signWebhook({
      id: 'evt_sub_create_early',
      event: 'subscription.create',
      data: {
        subscription_code: 'SUB_live_1',
        email_token: 'tok_email_secret_99',
        next_payment_date: '2099-12-11T10:00:00.000Z',
        customer: { customer_code: 'CUS_live_1' },
        authorization: { authorization_code: 'AUTH_live_1' },
        plan: { plan_code: 'PLN_test_monthly' },
        most_recent_invoice: { transaction_reference: init.reference },
      },
    })

    await assert.rejects(
      () =>
        processPaystackWebhook({ admin, provider }, earlySubCreate),
      (err: unknown) =>
        err instanceof BillingError && err.statusCode === 503,
    )
    assert.equal(state.webhook_events[0].processing_status, 'failed')

    // 2. charge.success arrives and activates subscription
    const chargeSuccess = signWebhook({
      id: 'evt_charge_1',
      event: 'charge.success',
      data: {
        id: 555001,
        reference: init.reference,
        amount: 1000,
        currency: 'NGN',
        paid_at: '2026-11-11T10:00:00.000Z',
        channel: 'card',
        customer: { customer_code: 'CUS_live_1' },
        authorization: { authorization_code: 'AUTH_live_1' },
        plan: 'PLN_test_monthly',
        metadata: { user_id: 'user-1', plan_id: 'plan-monthly-1' },
      },
    })

    const chargeRes = await processPaystackWebhook(
      { admin, provider },
      chargeSuccess,
    )
    assert.equal(chargeRes.processingStatus, 'processed')
    assert.equal(chargeRes.deduplicated, false)
    assert.equal(await hasActivePremiumAccess(admin, 'user-1'), true)

    // 3. Duplicate charge.success webhook is deduplicated
    const dupWebhookRes = await processPaystackWebhook(
      { admin, provider },
      chargeSuccess,
    )
    assert.equal(dupWebhookRes.deduplicated, true)
    assert.equal(state.subscriptions.length, 1)

    // 4. Different event ID with same Paystack transaction ID does NOT double-extend period
    const prevEnd = state.subscriptions[0].current_period_end
    const sameTxDifferentEvent = signWebhook({
      id: 'evt_charge_1_replay_new_id',
      event: 'charge.success',
      data: {
        id: 555001,
        reference: init.reference,
        amount: 1000,
        currency: 'NGN',
        paid_at: '2026-11-11T10:00:00.000Z',
        channel: 'card',
        customer: { customer_code: 'CUS_live_1' },
        authorization: { authorization_code: 'AUTH_live_1' },
        plan: 'PLN_test_monthly',
      },
    })
    await processPaystackWebhook({ admin, provider }, sameTxDifferentEvent)
    assert.equal(state.subscriptions[0].current_period_end, prevEnd)
    assert.equal(state.payment_transactions.length, 1)

    // 5. Retry of subscription.create now links SUB_live_1 & stores email_token server-side
    const subCreateRetry = await processPaystackWebhook(
      { admin, provider },
      earlySubCreate,
    )
    assert.equal(subCreateRetry.processingStatus, 'processed')
    assert.equal(state.subscriptions[0].provider_subscription_ref, 'SUB_live_1')
    assert.equal(
      state.subscription_provider_tokens[0].email_token,
      'tok_email_secret_99',
    )

    // 6. Overview never leaks email_token or authorization_code
    const overview = await getUserBillingOverview(admin, 'user-1')
    const serializedOverview = JSON.stringify(overview)
    assert.equal(serializedOverview.includes('tok_email_secret_99'), false)
    assert.equal(serializedOverview.includes('AUTH_live_1'), false)
    assert.equal(overview.hasActivePremium, true)

    // 7. Cancel preserves paid-through access while disabling Paystack auto-renew
    let disabledArgs: { subscriptionCode: string; emailToken: string } | null =
      null
    const cancelProvider = makeMockProvider({
      async disableSubscription(args) {
        disabledArgs = args
      },
    })
    const cancelRes = await cancelUserSubscription(
      { admin, provider: cancelProvider },
      'user-1',
    )
    assert.deepEqual(disabledArgs, {
      subscriptionCode: 'SUB_live_1',
      emailToken: 'tok_email_secret_99',
    })
    assert.equal(cancelRes.subscription.status, 'cancelled')
    assert.equal(cancelRes.subscription.endedAt, null)
    assert.equal(cancelRes.hasActivePremium, true)

    // 8. Manage link works and persists link server-side
    const manageRes = await createUserManageLink(
      { admin, provider },
      'user-1',
    )
    assert.equal(
      manageRes.managementUrl,
      'https://paystack.com/manage/SUB_live_1',
    )
    assert.equal(
      state.subscription_provider_tokens[0].management_url,
      'https://paystack.com/manage/SUB_live_1',
    )

    // 9. refund.processed revokes access immediately (ended_at IS NOT NULL)
    const refundWebhook = signWebhook({
      id: 'evt_refund_1',
      event: 'refund.processed',
      data: {
        transaction: 555001,
        transaction_reference: init.reference,
      },
    })
    await processPaystackWebhook({ admin, provider }, refundWebhook)
    assert.equal(state.payment_transactions[0].status, 'refunded')
    assert.equal(await hasActivePremiumAccess(admin, 'user-1'), false)
    assert.equal(state.profiles[0].membership_tier, 'free')
  })

  it('marks active subscription past_due on invoice.payment_failed and expires overdue subscriptions', async () => {
    const pastEnd = '2026-11-01T00:00:00.000Z'
    const futureEnd = '2099-12-01T00:00:00.000Z'

    const { admin, state } = createFakeAdminClient({
      profiles: [
        makeProfile({ id: 'user-overdue' }),
        makeProfile({ id: 'user-active' }),
        makeProfile({ id: 'user-cancelled-ended' }),
      ],
      subscription_plans: [makeReadyPlan()],
      subscriptions: [
        {
          id: 'sub-overdue',
          user_id: 'user-overdue',
          plan_id: 'plan-monthly-1',
          provider: 'paystack',
          provider_customer_ref: 'CUS_ov',
          provider_subscription_ref: 'SUB_ov',
          status: 'active',
          billing_interval: 'month',
          current_period_start: '2026-10-01T00:00:00.000Z',
          current_period_end: pastEnd,
          cancel_at_period_end: false,
          cancelled_at: null,
          ended_at: null,
          metadata: {},
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
        },
        {
          id: 'sub-active',
          user_id: 'user-active',
          plan_id: 'plan-monthly-1',
          provider: 'paystack',
          provider_customer_ref: 'CUS_act',
          provider_subscription_ref: 'SUB_act',
          status: 'active',
          billing_interval: 'month',
          current_period_start: '2026-11-01T00:00:00.000Z',
          current_period_end: futureEnd,
          cancel_at_period_end: false,
          cancelled_at: null,
          ended_at: null,
          metadata: {},
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'sub-cancelled-overdue',
          user_id: 'user-cancelled-ended',
          plan_id: 'plan-monthly-1',
          provider: 'paystack',
          provider_customer_ref: 'CUS_can',
          provider_subscription_ref: 'SUB_can',
          status: 'cancelled',
          billing_interval: 'month',
          current_period_start: '2026-10-01T00:00:00.000Z',
          current_period_end: pastEnd,
          cancel_at_period_end: true,
          cancelled_at: '2026-10-15T00:00:00.000Z',
          ended_at: null,
          metadata: {},
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-15T00:00:00.000Z',
        },
      ],
    })

    const provider = makeMockProvider()

    // invoice.payment_failed moves sub-active -> past_due without cutting off futureEnd early
    const failWebhook = signWebhook({
      id: 'evt_inv_fail_1',
      event: 'invoice.payment_failed',
      data: {
        invoice_code: 'INV_fail_1',
        amount: 1000,
        plan: { currency: 'NGN' },
        subscription: { subscription_code: 'SUB_act' },
        transaction: { id: 8881, reference: 'SPTV_inv_1' },
      },
    })
    await processPaystackWebhook({ admin, provider }, failWebhook)
    assert.equal(state.subscriptions[1].status, 'past_due')
    assert.equal(await hasActivePremiumAccess(admin, 'user-active'), true)

    // Before sweep: overdue users still lose live access via current_period_end <= now()
    assert.equal(await hasActivePremiumAccess(admin, 'user-overdue'), false)
    assert.equal(
      await hasActivePremiumAccess(admin, 'user-cancelled-ended'),
      false,
    )

    // Run expiry sweep
    const sweep = await runExpireOverdueSubscriptions(admin, '0 seconds')
    assert.equal(sweep.expiredCount, 2)
    assert.equal(state.subscriptions[0].status, 'expired')
    assert.equal(state.subscriptions[2].status, 'expired')
    assert.equal(state.subscriptions[1].status, 'past_due')
    assert.equal(state.profiles[0].membership_tier, 'free')
    assert.equal(state.profiles[0].membership_status, 'expired')
    assert.equal(state.profiles[2].membership_tier, 'free')
    assert.equal(state.profiles[2].membership_status, 'expired')
  })

  it('handles recurring renewals, concurrent verify+webhook races, failed checkout cleanup, and deferred cancel disable', async () => {
    // 1. Failed Paystack initialize marks pending transaction failed so user can retry cleanly
    const { admin: errAdmin, state: errState } = createFakeAdminClient({
      profiles: [makeProfile()],
      subscription_plans: [makeReadyPlan()],
    })
    const failingInitProvider = makeMockProvider({
      async initializeCheckout() {
        throw new Error('Paystack upstream 503')
      },
    })
    await assert.rejects(
      () =>
        initializeSubscriptionCheckout(
          { admin: errAdmin, provider: failingInitProvider },
          {
            userId: 'user-1',
            userEmail: 'fan@example.com',
            planCode: 'premium_monthly',
            appOrigin: 'https://sportivra.example.com',
          },
        ),
      (err: unknown) =>
        err instanceof BillingError &&
        err.statusCode === 502 &&
        err.code === 'PROVIDER_INIT_FAILED',
    )
    assert.equal(errState.payment_transactions.length, 1)
    assert.equal(errState.payment_transactions[0].status, 'failed')

    // 2. Concurrent verifyAndActivateCheckout + charge.success webhook never duplicates or double-extends
    const { admin, state } = createFakeAdminClient({
      profiles: [makeProfile()],
      subscription_plans: [makeReadyPlan()],
    })
    const provider = makeMockProvider()

    const init = await initializeSubscriptionCheckout(
      { admin, provider },
      {
        userId: 'user-1',
        userEmail: 'fan@example.com',
        planCode: 'premium_monthly',
        appOrigin: 'https://sportivra.example.com',
      },
    )

    const initialCharge = signWebhook({
      id: 'evt_concurrent_1',
      event: 'charge.success',
      data: {
        id: 900001,
        reference: init.reference,
        amount: 1000,
        currency: 'NGN',
        paid_at: '2026-11-11T10:00:00.000Z',
        channel: 'card',
        customer: { customer_code: 'CUS_test_1' },
        authorization: { authorization_code: 'AUTH_test_1' },
        plan: 'PLN_test_monthly',
        metadata: { user_id: 'user-1', plan_id: 'plan-monthly-1' },
      },
    })

    const [verifyOutcome, webhookOutcome] = await Promise.all([
      verifyAndActivateCheckout(
        { admin, provider },
        { userId: 'user-1', reference: init.reference },
      ),
      processPaystackWebhook({ admin, provider }, initialCharge),
    ])

    assert.equal(verifyOutcome.status, 'succeeded')
    assert.equal(webhookOutcome.processingStatus, 'processed')
    assert.equal(state.subscriptions.length, 1)
    assert.equal(state.payment_transactions.length, 1)
    assert.equal(state.payment_transactions[0].status, 'succeeded')
    const firstPeriodEnd = state.subscriptions[0].current_period_end!

    // 3. Genuine recurring renewal extends period from currentPeriodEnd and records second transaction
    // Link subscription code first
    state.subscriptions[0].provider_subscription_ref = 'SUB_test_1'
    state.subscriptions[0].status = 'past_due' // simulate recovery on successful renewal!

    const renewalWebhook = signWebhook({
      id: 'evt_renewal_2',
      event: 'charge.success',
      data: {
        id: 900002,
        reference: 'PAYSTACK_RENEW_900002',
        amount: 1000,
        currency: 'NGN',
        paid_at: '2026-12-11T10:00:00.000Z',
        channel: 'card',
        customer: { customer_code: 'CUS_test_1' },
        authorization: { authorization_code: 'AUTH_test_1' },
        plan: 'PLN_test_monthly',
        subscription_code: 'SUB_test_1',
      },
    })
    await processPaystackWebhook({ admin, provider }, renewalWebhook)
    assert.equal(state.payment_transactions.length, 2)
    assert.equal(state.subscriptions[0].status, 'active')
    assert.ok(
      Date.parse(state.subscriptions[0].current_period_end!) >
        Date.parse(firstPeriodEnd),
    )

    // 4. Pre-webhook cancel flags pending_provider_disable, then subscription.create executes disableSubscription
    const disabledCalls: Array<{ subscriptionCode: string; emailToken: string }> =
      []
    const cancelDeferredProvider = makeMockProvider({
      async disableSubscription(args) {
        disabledCalls.push(args)
      },
    })
    const cancelEarly = await cancelUserSubscription(
      { admin, provider: cancelDeferredProvider },
      'user-1',
    )
    assert.equal(cancelEarly.subscription.status, 'cancelled')
    assert.equal(disabledCalls.length, 0)

    const delayedSubCreate = signWebhook({
      id: 'evt_delayed_sub_create',
      event: 'subscription.create',
      data: {
        subscription_code: 'SUB_test_1',
        email_token: 'tok_delayed_1',
        next_payment_date: '2099-12-11T10:00:00.000Z',
        customer: { customer_code: 'CUS_test_1' },
        authorization: { authorization_code: 'AUTH_test_1' },
        plan: { plan_code: 'PLN_test_monthly' },
      },
    })
    await processPaystackWebhook(
      { admin, provider: cancelDeferredProvider },
      delayedSubCreate,
    )
    assert.deepEqual(disabledCalls, [
      { subscriptionCode: 'SUB_test_1', emailToken: 'tok_delayed_1' },
    ])

    // 5. subscription.disable after period end expires immediately
    state.subscriptions[0].current_period_end = '2026-01-01T00:00:00.000Z'
    const disableElapsed = signWebhook({
      id: 'evt_sub_disable_elapsed',
      event: 'subscription.disable',
      data: {
        subscription_code: 'SUB_test_1',
        email_token: 'tok_delayed_1',
      },
    })
    await processPaystackWebhook({ admin, provider }, disableElapsed)
    assert.equal(state.subscriptions[0].status, 'expired')
    assert.ok(state.subscriptions[0].ended_at !== null)
    assert.equal(await hasActivePremiumAccess(admin, 'user-1'), false)
  })

  it('rejects tampered webhook charge amounts and supports top-level subscription_code renewal fallback', async () => {
    const { admin, state } = createFakeAdminClient({
      profiles: [makeProfile()],
      subscription_plans: [makeReadyPlan({ amount_minor: 2500, currency: 'NGN' })],
    })
    const provider = makeMockProvider()

    const init = await initializeSubscriptionCheckout(
      { admin, provider },
      {
        userId: 'user-1',
        userEmail: 'fan@example.com',
        planCode: 'premium_monthly',
        appOrigin: 'https://sportivra.example.com',
      },
    )

    // Tampered amount/currency via charge.success webhook -> 409 WEBHOOK_AMOUNT_MISMATCH
    const tamperedWebhook = signWebhook({
      id: 'evt_tampered_charge_1',
      event: 'charge.success',
      data: {
        id: 777001,
        reference: init.reference,
        amount: 100,
        currency: 'NGN',
        customer: { customer_code: 'CUS_test_1' },
        plan: 'PLN_test_monthly',
      },
    })

    await assert.rejects(
      () => processPaystackWebhook({ admin, provider }, tamperedWebhook),
      (err: unknown) =>
        err instanceof BillingError &&
        err.statusCode === 409 &&
        err.code === 'WEBHOOK_AMOUNT_MISMATCH',
    )
    assert.equal(state.payment_transactions[0].status, 'failed')
    assert.equal(state.subscriptions.length, 0)
    assert.equal(state.webhook_events[0].processing_status, 'failed')

    // Valid charge settles initial subscription
    const validInitCharge = signWebhook({
      id: 'evt_valid_charge_1',
      event: 'charge.success',
      data: {
        id: 777002,
        reference: init.reference,
        amount: 2500,
        currency: 'NGN',
        paid_at: '2026-11-11T10:00:00.000Z',
        channel: 'card',
        customer: { customer_code: 'CUS_initial' },
        authorization: { authorization_code: 'AUTH_1' },
        plan: 'PLN_test_monthly',
        subscription_code: 'SUB_top_level_1',
      },
    })
    await processPaystackWebhook({ admin, provider }, validInitCharge)
    assert.equal(state.subscriptions.length, 1)
    assert.equal(state.subscriptions[0].provider_subscription_ref, 'SUB_top_level_1')
    const firstEnd = state.subscriptions[0].current_period_end!

    // Renewal webhook with ONLY top-level data.subscription_code (no matching customer_code)
    const topLevelRenewal = signWebhook({
      id: 'evt_top_level_renewal_2',
      event: 'charge.success',
      data: {
        id: 777003,
        reference: 'PAYSTACK_RENEW_777003',
        amount: 2500,
        currency: 'NGN',
        paid_at: '2026-12-11T10:00:00.000Z',
        channel: 'card',
        customer: { customer_code: 'CUS_different_on_renewal' },
        plan: 'PLN_test_monthly',
        subscription_code: 'SUB_top_level_1',
      },
    })
    const renewalResult = await processPaystackWebhook(
      { admin, provider },
      topLevelRenewal,
    )
    assert.equal(renewalResult.processingStatus, 'processed')
    assert.equal(state.payment_transactions.length, 2)
    assert.ok(
      Date.parse(state.subscriptions[0].current_period_end!) > Date.parse(firstEnd),
    )

    // invoice.payment_failed with top-level data.subscription_code marks past_due
    const failTopLevel = signWebhook({
      id: 'evt_fail_top_level_sub',
      event: 'invoice.payment_failed',
      data: {
        invoice_code: 'INV_fail_top',
        amount: 2500,
        subscription_code: 'SUB_top_level_1',
        transaction: { id: 777004, reference: 'SPTV_fail_top' },
      },
    })
    await processPaystackWebhook({ admin, provider }, failTopLevel)
    assert.equal(state.subscriptions[0].status, 'past_due')
  })
})
