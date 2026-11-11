import crypto from 'node:crypto'
import type { AdminSupabaseClient } from '@/lib/supabase/admin'
import type {
  AccessTier,
  BillingInterval,
  Database,
  Json,
  MembershipStatus,
  MembershipTier,
  PaymentTransactionRow,
  SubscriptionPlanRow,
  SubscriptionRow,
  SubscriptionStatus,
  TransactionStatus,
  UserRole,
} from '@/lib/supabase/types'
import {
  calculatePeriodEnd,
  extractPaystackPlanRef,
  hasActivePremiumAccess,
  isPlanCheckoutReady,
  isSubscriptionEntitled,
} from './access'
import type { BillingProvider, VerifiedTransactionResult } from './provider'

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/billing/service.ts must only be imported in server-side modules.',
  )
}

export class BillingError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'BillingError'
    this.statusCode = statusCode
    this.code = code
  }
}

export interface BillingServiceDeps {
  admin: AdminSupabaseClient
  provider: BillingProvider
}

export interface PublicPlanSummary {
  id: string
  code: string
  name: string
  description: string | null
  tier: AccessTier
  billingInterval: BillingInterval
  amountMinor: number | null
  currency: string | null
  features: Json
  sortOrder: number
  checkoutReady: boolean
}

export interface PublicPlansResponse {
  plans: PublicPlanSummary[]
  paidPlansConfigured: boolean
}

export interface SubscriptionSummary {
  id: string
  planId: string
  planCode: string | null
  planName: string | null
  planTier: AccessTier | null
  provider: string
  status: SubscriptionStatus
  billingInterval: 'month' | 'year'
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  cancelledAt: string | null
  endedAt: string | null
  entitledNow: boolean
}

export interface TransactionSummary {
  id: string
  provider: string
  reference: string | null
  amountMinor: number
  currency: string
  status: TransactionStatus
  paymentChannel: string | null
  paidAt: string | null
  createdAt: string
}

export interface UserBillingOverview {
  hasActivePremium: boolean
  profile: {
    role: UserRole
    membershipTier: MembershipTier
    membershipStatus: MembershipStatus
    subscriptionExpiresAt: string | null
  } | null
  subscription: SubscriptionSummary | null
  recentTransactions: TransactionSummary[]
}

export interface CheckoutResponse {
  provider: string
  reference: string
  authorizationUrl: string
}

export interface VerifyCheckoutResponse {
  status: 'succeeded' | 'failed' | 'pending' | 'refunded'
  alreadyProcessed: boolean
  reference: string
  hasActivePremium: boolean
  subscription: SubscriptionSummary | null
}

export interface WebhookProcessResult {
  received: boolean
  deduplicated: boolean
  eventType: string
  processingStatus: 'processed' | 'ignored' | 'failed'
}

const REFERENCE_PATTERN = /^[A-Za-z0-9._-]{4,128}$/
const ALLOWED_EXPIRY_GRACE_PATTERN =
  /^(0 seconds|1 hour|6 hours|12 hours|1 day|2 days|3 days|7 days)$/

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asIsoDateString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

function toJson(record: Record<string, unknown>): Json {
  return record as unknown as Json
}

function serializePlan(plan: SubscriptionPlanRow): PublicPlanSummary {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    tier: plan.tier,
    billingInterval: plan.billing_interval,
    amountMinor: plan.amount_minor,
    currency: plan.currency,
    features: plan.features,
    sortOrder: plan.sort_order,
    checkoutReady: isPlanCheckoutReady(plan),
  }
}

function serializeSubscription(
  sub: SubscriptionRow,
  plan: Pick<SubscriptionPlanRow, 'code' | 'name' | 'tier'> | null,
): SubscriptionSummary {
  const tier = plan?.tier ?? 'premium'
  return {
    id: sub.id,
    planId: sub.plan_id,
    planCode: plan?.code ?? null,
    planName: plan?.name ?? null,
    planTier: plan?.tier ?? null,
    provider: sub.provider,
    status: sub.status,
    billingInterval: sub.billing_interval,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    cancelledAt: sub.cancelled_at,
    endedAt: sub.ended_at,
    entitledNow: isSubscriptionEntitled({
      status: sub.status,
      planTier: tier,
      currentPeriodEnd: sub.current_period_end,
      endedAt: sub.ended_at,
    }),
  }
}

function serializeTransaction(tx: PaymentTransactionRow): TransactionSummary {
  return {
    id: tx.id,
    provider: tx.provider,
    reference: tx.provider_checkout_ref ?? tx.provider_transaction_ref,
    amountMinor: tx.amount_minor,
    currency: tx.currency,
    status: tx.status,
    paymentChannel: tx.payment_channel,
    paidAt: tx.paid_at,
    createdAt: tx.created_at,
  }
}

async function mergeProfilePaystackCustomerId(
  admin: AdminSupabaseClient,
  userId: string,
  customerCode: string | null,
): Promise<void> {
  if (!customerCode) return

  const { data: profile } = await admin
    .from('profiles')
    .select('provider_customer_ids')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return

  const existingIds = asRecord(profile.provider_customer_ids)
  if (existingIds.paystack === customerCode) return

  await admin
    .from('profiles')
    .update({
      provider_customer_ids: toJson({
        ...existingIds,
        paystack: customerCode,
      }),
    })
    .eq('id', userId)
}

async function upsertProviderTokens(
  admin: AdminSupabaseClient,
  subscriptionId: string,
  provider: string,
  tokens: {
    emailToken?: string | null
    authorizationCode?: string | null
    managementUrl?: string | null
    tokenMetadata?: Record<string, unknown>
  },
): Promise<void> {
  const { data: existing } = await admin
    .from('subscription_provider_tokens')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .maybeSingle()

  const nextEmailToken =
    tokens.emailToken !== undefined
      ? tokens.emailToken
      : (existing?.email_token ?? null)
  const nextAuthCode =
    tokens.authorizationCode !== undefined
      ? tokens.authorizationCode
      : (existing?.authorization_code ?? null)
  const nextManagementUrl =
    tokens.managementUrl !== undefined
      ? tokens.managementUrl
      : (existing?.management_url ?? null)

  if (
    !nextEmailToken &&
    !nextAuthCode &&
    !nextManagementUrl &&
    !tokens.tokenMetadata
  ) {
    return
  }

  const mergedMetadata = {
    ...asRecord(existing?.token_metadata),
    ...(tokens.tokenMetadata ?? {}),
  }

  const { error } = await admin.from('subscription_provider_tokens').upsert(
    {
      subscription_id: subscriptionId,
      provider,
      email_token: nextEmailToken,
      authorization_code: nextAuthCode,
      management_url: nextManagementUrl,
      token_metadata: toJson(mergedMetadata),
    },
    { onConflict: 'subscription_id' },
  )

  if (error) {
    throw new Error(
      `Failed to store subscription provider tokens: ${error.message}`,
    )
  }
}

export async function listPublicPlans(
  admin: AdminSupabaseClient,
): Promise<PublicPlansResponse> {
  const { data, error } = await admin
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new BillingError(
      500,
      'PLANS_FETCH_FAILED',
      'Unable to load subscription plans.',
    )
  }

  const rows = (data ?? []) as SubscriptionPlanRow[]
  // Only expose free plans or fully configured, Paystack-linked paid plans.
  const visiblePlans = rows
    .filter((plan) => plan.tier === 'free' || isPlanCheckoutReady(plan))
    .map(serializePlan)

  const paidPlansConfigured = visiblePlans.some(
    (plan) => plan.tier === 'premium' && plan.checkoutReady,
  )

  return {
    plans: visiblePlans,
    paidPlansConfigured,
  }
}

export async function initializeSubscriptionCheckout(
  deps: BillingServiceDeps,
  input: {
    userId: string
    userEmail: string | null | undefined
    planCode: string
    appOrigin: string
  },
): Promise<CheckoutResponse> {
  const { admin, provider } = deps
  const cleanEmail = input.userEmail?.trim() || ''
  const cleanPlanCode = input.planCode?.trim() || ''

  if (!input.userId) {
    throw new BillingError(401, 'UNAUTHENTICATED', 'Authentication required.')
  }
  if (!cleanEmail) {
    throw new BillingError(
      400,
      'AUTH_EMAIL_REQUIRED',
      'A verified account email address is required before checkout.',
    )
  }
  if (!cleanPlanCode) {
    throw new BillingError(
      400,
      'PLAN_CODE_REQUIRED',
      'A subscription plan code is required.',
    )
  }

  const { data: planRow, error: planError } = await admin
    .from('subscription_plans')
    .select('*')
    .eq('code', cleanPlanCode)
    .eq('is_active', true)
    .maybeSingle()

  if (planError) {
    throw new BillingError(
      500,
      'PLAN_LOOKUP_FAILED',
      'Unable to inspect subscription plan.',
    )
  }
  if (!planRow) {
    throw new BillingError(
      404,
      'PLAN_NOT_FOUND',
      'Selected subscription plan was not found or is inactive.',
    )
  }

  const plan = planRow as SubscriptionPlanRow
  if (plan.tier !== 'premium') {
    throw new BillingError(
      400,
      'FREE_PLAN_NO_CHECKOUT',
      'Free membership does not require checkout.',
    )
  }

  if (!isPlanCheckoutReady(plan)) {
    throw new BillingError(
      409,
      'PLAN_NOT_CONFIGURED',
      'Paid subscription plans are not yet configured for checkout.',
    )
  }

  const providerPlanRef = extractPaystackPlanRef(plan)
  if (
    !providerPlanRef ||
    plan.amount_minor === null ||
    !plan.currency ||
    (plan.billing_interval !== 'month' && plan.billing_interval !== 'year')
  ) {
    throw new BillingError(
      409,
      'PLAN_NOT_CONFIGURED',
      'Paid subscription plan pricing or Paystack reference is incomplete.',
    )
  }

  const alreadyPremium = await hasActivePremiumAccess(admin, input.userId)
  if (alreadyPremium) {
    throw new BillingError(
      409,
      'ALREADY_SUBSCRIBED',
      'You already have an active Premium subscription.',
    )
  }

  const { data: openSubs, error: openSubError } = await admin
    .from('subscriptions')
    .select('id, status')
    .eq('user_id', input.userId)
    .in('status', ['active', 'past_due'])
    .limit(1)

  if (openSubError) {
    throw new BillingError(
      500,
      'SUBSCRIPTION_CHECK_FAILED',
      'Unable to check existing subscription status.',
    )
  }

  if (openSubs && openSubs.length > 0) {
    throw new BillingError(
      409,
      'OPEN_SUBSCRIPTION_EXISTS',
      'An open subscription already exists on your account.',
    )
  }

  const checkoutRef = `SPTV_${crypto.randomUUID().replace(/-/g, '')}`

  const { data: pendingTx, error: txInsertError } = await admin
    .from('payment_transactions')
    .insert({
      user_id: input.userId,
      plan_id: plan.id,
      provider: provider.id,
      provider_transaction_ref: null,
      provider_checkout_ref: checkoutRef,
      expected_amount_minor: plan.amount_minor,
      expected_currency: plan.currency,
      amount_minor: plan.amount_minor,
      currency: plan.currency,
      status: 'pending',
      metadata: toJson({
        plan_code: plan.code,
        billing_interval: plan.billing_interval,
      }),
    })
    .select('*')
    .single()

  if (txInsertError || !pendingTx) {
    throw new BillingError(
      500,
      'CHECKOUT_RECORD_FAILED',
      'Could not record checkout attempt.',
    )
  }

  try {
    const callbackUrl = `${input.appOrigin.replace(/\/+$/, '')}/billing/callback`
    const initResult = await provider.initializeCheckout({
      userId: input.userId,
      email: cleanEmail,
      planId: plan.id,
      planCode: plan.code,
      billingInterval: plan.billing_interval,
      amountMinor: plan.amount_minor,
      currency: plan.currency,
      providerPlanRef,
      reference: checkoutRef,
      callbackUrl,
    })

    await admin
      .from('payment_transactions')
      .update({
        metadata: toJson({
          ...asRecord(pendingTx.metadata),
          access_code: initResult.accessCode,
        }),
      })
      .eq('id', pendingTx.id)
      .eq('status', 'pending')

    return {
      provider: initResult.provider,
      reference: initResult.reference,
      authorizationUrl: initResult.authorizationUrl,
    }
  } catch (err) {
    await admin
      .from('payment_transactions')
      .update({
        status: 'failed',
        metadata: toJson({
          ...asRecord(pendingTx.metadata),
          init_error: err instanceof Error ? err.message : 'Initialization failed',
        }),
      })
      .eq('id', pendingTx.id)
      .eq('status', 'pending')

    throw new BillingError(
      502,
      'PROVIDER_INIT_FAILED',
      'Unable to initialize Paystack checkout right now.',
    )
  }
}

async function resolveConcurrentWinnerSubscription(
  admin: AdminSupabaseClient,
  opts: {
    txId: string
    userId: string
    provider: string
    subscriptionCode?: string | null
  },
): Promise<{
  transaction: PaymentTransactionRow
  subscription: SubscriptionRow
} | null> {
  // Brief bounded check in case the winning worker is mid-flight between
  // settling payment_transactions and inserting/linking subscriptions.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: latestTx } = await admin
      .from('payment_transactions')
      .select('*')
      .eq('id', opts.txId)
      .maybeSingle()

    if (latestTx?.subscription_id) {
      const { data: sub } = await admin
        .from('subscriptions')
        .select('*')
        .eq('id', latestTx.subscription_id)
        .maybeSingle()
      if (sub) {
        return { transaction: latestTx, subscription: sub }
      }
    }

    if (opts.subscriptionCode) {
      const { data: byCode } = await admin
        .from('subscriptions')
        .select('*')
        .eq('provider', opts.provider)
        .eq('provider_subscription_ref', opts.subscriptionCode)
        .maybeSingle()
      if (byCode && latestTx) {
        return { transaction: latestTx, subscription: byCode }
      }
    }

    const { data: openSub } = await admin
      .from('subscriptions')
      .select('*')
      .eq('user_id', opts.userId)
      .in('status', ['active', 'past_due'])
      .limit(1)
      .maybeSingle()
    if (openSub && latestTx) {
      return { transaction: latestTx, subscription: openSub }
    }

    if (attempt < 7) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  return null
}

async function settleVerifiedCharge(
  admin: AdminSupabaseClient,
  input: {
    txRow: PaymentTransactionRow | null
    userId: string
    plan: SubscriptionPlanRow
    provider: string
    providerTransactionId: string | null
    reference: string | null
    amountMinor: number
    currency: string
    paidAt: string | null
    channel: string | null
    customerCode: string | null
    authorizationCode: string | null
    subscriptionCode: string | null
    nextPaymentDate?: string | null
    isRenewal?: boolean
    rawMetadata?: Record<string, unknown>
  },
): Promise<{
  alreadyProcessed: boolean
  transaction: PaymentTransactionRow
  subscription: SubscriptionRow
}> {
  const {
    txRow,
    userId,
    plan,
    provider,
    providerTransactionId,
    reference,
    amountMinor,
    currency,
    paidAt,
    channel,
    customerCode,
    authorizationCode,
    subscriptionCode,
    nextPaymentDate,
    isRenewal = false,
    rawMetadata = {},
  } = input

  if (plan.billing_interval !== 'month' && plan.billing_interval !== 'year') {
    throw new BillingError(
      400,
      'INVALID_PLAN_INTERVAL',
      'Only monthly and yearly plans can create subscriptions.',
    )
  }

  // Step 1: Check whether this exact provider transaction ID has already been settled or refunded.
  if (providerTransactionId) {
    const { data: existingByTxId } = await admin
      .from('payment_transactions')
      .select('*')
      .eq('provider', provider)
      .eq('provider_transaction_ref', providerTransactionId)
      .maybeSingle()

    if (existingByTxId?.status === 'refunded') {
      throw new BillingError(
        409,
        'TRANSACTION_REFUNDED',
        'This transaction has already been refunded.',
      )
    }

    if (existingByTxId && existingByTxId.status === 'succeeded') {
      const existingSub = existingByTxId.subscription_id
        ? (
            await admin
              .from('subscriptions')
              .select('*')
              .eq('id', existingByTxId.subscription_id)
              .maybeSingle()
          ).data
        : null

      if (existingSub) {
        return {
          alreadyProcessed: true,
          transaction: existingByTxId,
          subscription: existingSub,
        }
      }
    }
  }

  const paidAtIso = asIsoDateString(paidAt) ?? new Date().toISOString()
  const paidAtDate = new Date(paidAtIso)
  const cleanCurrency = currency.trim().toUpperCase()
  const cleanTxId = providerTransactionId?.trim() || null
  const cleanRef = reference?.trim() || null

  // Step 2: Atomically settle (or insert) the payment_transactions record.
  let settledTx: PaymentTransactionRow | null = null

  if (txRow) {
    const { data: updatedTx, error: updateTxErr } = await admin
      .from('payment_transactions')
      .update({
        status: 'succeeded',
        provider_transaction_ref: cleanTxId,
        amount_minor: amountMinor,
        currency: cleanCurrency,
        payment_channel: channel,
        paid_at: paidAtIso,
        metadata: toJson({
          ...asRecord(txRow.metadata),
          ...rawMetadata,
        }),
      })
      .eq('id', txRow.id)
      .in('status', ['pending', 'failed'])
      .select('*')
      .maybeSingle()

    if (updateTxErr) {
      if (updateTxErr.code === '23505') {
        const { data: dup } = await admin
          .from('payment_transactions')
          .select('*')
          .eq('id', txRow.id)
          .single()

        if (dup?.subscription_id) {
          const { data: dupSub } = await admin
            .from('subscriptions')
            .select('*')
            .eq('id', dup.subscription_id)
            .single()

          if (dupSub) {
            return {
              alreadyProcessed: true,
              transaction: dup,
              subscription: dupSub,
            }
          }
        }
      }
      throw new BillingError(
        500,
        'TRANSACTION_UPDATE_FAILED',
        `Failed to settle payment transaction: ${updateTxErr.message}`,
      )
    }

    if (!updatedTx) {
      // Another worker (e.g. concurrent webhook or verify request) already transitioned txRow.
      const { data: currentTx } = await admin
        .from('payment_transactions')
        .select('*')
        .eq('id', txRow.id)
        .single()

      if (!currentTx || currentTx.status !== 'succeeded') {
        throw new BillingError(
          409,
          'TRANSACTION_STATE_CONFLICT',
          'Payment transaction could not be settled from its current state.',
        )
      }

      const winner = await resolveConcurrentWinnerSubscription(admin, {
        txId: currentTx.id,
        userId,
        provider,
        subscriptionCode,
      })

      if (winner) {
        return {
          alreadyProcessed: true,
          transaction: winner.transaction,
          subscription: winner.subscription,
        }
      }

      settledTx = currentTx
    } else {
      settledTx = updatedTx
    }
  } else {
    if (!cleanTxId && !cleanRef) {
      throw new BillingError(
        400,
        'TRANSACTION_REFERENCE_MISSING',
        'Charge event lacks both transaction ID and checkout reference.',
      )
    }

    const { data: insertedTx, error: insertTxErr } = await admin
      .from('payment_transactions')
      .insert({
        user_id: userId,
        plan_id: plan.id,
        provider,
        provider_transaction_ref: cleanTxId,
        provider_checkout_ref: cleanRef,
        expected_amount_minor: plan.amount_minor,
        expected_currency: plan.currency,
        amount_minor: amountMinor,
        currency: cleanCurrency,
        status: 'succeeded',
        payment_channel: channel,
        paid_at: paidAtIso,
        metadata: toJson(rawMetadata),
      })
      .select('*')
      .single()

    if (insertTxErr) {
      if (insertTxErr.code === '23505') {
        const { data: existingDup } = cleanTxId
          ? await admin
              .from('payment_transactions')
              .select('*')
              .eq('provider', provider)
              .eq('provider_transaction_ref', cleanTxId)
              .maybeSingle()
          : await admin
              .from('payment_transactions')
              .select('*')
              .eq('provider', provider)
              .eq('provider_checkout_ref', cleanRef!)
              .maybeSingle()

        if (existingDup) {
          const winner = await resolveConcurrentWinnerSubscription(admin, {
            txId: existingDup.id,
            userId,
            provider,
            subscriptionCode,
          })
          if (winner) {
            return {
              alreadyProcessed: true,
              transaction: winner.transaction,
              subscription: winner.subscription,
            }
          }
        }
      }
      throw new BillingError(
        500,
        'TRANSACTION_INSERT_FAILED',
        `Failed to record payment transaction: ${insertTxErr.message}`,
      )
    }
    settledTx = insertedTx
  }

  // Step 3: Locate or create/renew subscription row.
  let existingSub: SubscriptionRow | null = null
  if (subscriptionCode) {
    const { data } = await admin
      .from('subscriptions')
      .select('*')
      .eq('provider', provider)
      .eq('provider_subscription_ref', subscriptionCode)
      .maybeSingle()
    existingSub = data ?? null
  }

  if (!existingSub) {
    const { data } = await admin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'past_due'])
      .limit(1)
      .maybeSingle()
    existingSub = data ?? null
  }

  const parsedNextPayment = asIsoDateString(nextPaymentDate)
  const parsedNextDate = parsedNextPayment
    ? new Date(parsedNextPayment)
    : null

  let finalSub: SubscriptionRow

  if (existingSub) {
    const existingEnd = existingSub.current_period_end
      ? new Date(existingSub.current_period_end)
      : null

    const baseDate =
      isRenewal && existingEnd && existingEnd.getTime() > paidAtDate.getTime()
        ? existingEnd
        : paidAtDate

    const computedEnd =
      parsedNextDate && parsedNextDate.getTime() > baseDate.getTime()
        ? parsedNextDate
        : calculatePeriodEnd(baseDate, plan.billing_interval)

    const { data: updatedSub, error: updateSubErr } = await admin
      .from('subscriptions')
      .update({
        plan_id: plan.id,
        provider_customer_ref: customerCode ?? existingSub.provider_customer_ref,
        provider_subscription_ref:
          subscriptionCode ?? existingSub.provider_subscription_ref,
        status: 'active',
        billing_interval: plan.billing_interval,
        current_period_start: paidAtDate.toISOString(),
        current_period_end: computedEnd.toISOString(),
        cancel_at_period_end: false,
        cancelled_at: null,
        ended_at: null,
      })
      .eq('id', existingSub.id)
      .select('*')
      .single()

    if (updateSubErr || !updatedSub) {
      throw new BillingError(
        500,
        'SUBSCRIPTION_UPDATE_FAILED',
        `Failed to update subscription: ${updateSubErr?.message ?? 'unknown error'}`,
      )
    }
    finalSub = updatedSub
  } else {
    const computedEnd =
      parsedNextDate && parsedNextDate.getTime() > paidAtDate.getTime()
        ? parsedNextDate
        : calculatePeriodEnd(paidAtDate, plan.billing_interval)

    const { data: insertedSub, error: insertSubErr } = await admin
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_id: plan.id,
        provider,
        provider_customer_ref: customerCode ?? null,
        provider_subscription_ref: subscriptionCode ?? null,
        status: 'active',
        billing_interval: plan.billing_interval,
        current_period_start: paidAtDate.toISOString(),
        current_period_end: computedEnd.toISOString(),
        cancel_at_period_end: false,
        cancelled_at: null,
        ended_at: null,
        metadata: toJson({
          initial_checkout_ref: cleanRef,
        }),
      })
      .select('*')
      .single()

    if (insertSubErr || !insertedSub) {
      if (insertSubErr?.code === '23505') {
        const { data: racedSub } = await admin
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .in('status', ['active', 'past_due'])
          .limit(1)
          .maybeSingle()

        if (racedSub) {
          if (settledTx.subscription_id !== racedSub.id) {
            await admin
              .from('payment_transactions')
              .update({ subscription_id: racedSub.id })
              .eq('id', settledTx.id)
          }
          return {
            alreadyProcessed: true,
            transaction: settledTx,
            subscription: racedSub,
          }
        }
      }

      throw new BillingError(
        500,
        'SUBSCRIPTION_CREATE_FAILED',
        `Failed to activate subscription: ${insertSubErr?.message ?? 'unknown error'}`,
      )
    }
    finalSub = insertedSub
  }

  // Step 4: Link transaction -> subscription, store server-only tokens, sync customer ID.
  if (settledTx.subscription_id !== finalSub.id) {
    const { data: linkedTx } = await admin
      .from('payment_transactions')
      .update({ subscription_id: finalSub.id })
      .eq('id', settledTx.id)
      .select('*')
      .maybeSingle()

    if (linkedTx) settledTx = linkedTx
  }

  await upsertProviderTokens(admin, finalSub.id, provider, {
    authorizationCode: authorizationCode ?? undefined,
  })

  await mergeProfilePaystackCustomerId(admin, userId, customerCode)

  return {
    alreadyProcessed: false,
    transaction: settledTx,
    subscription: finalSub,
  }
}

export async function verifyAndActivateCheckout(
  deps: BillingServiceDeps,
  input: {
    userId: string
    reference: string
  },
): Promise<VerifyCheckoutResponse> {
  const { admin, provider } = deps
  const cleanRef = input.reference?.trim() || ''

  if (!input.userId) {
    throw new BillingError(401, 'UNAUTHENTICATED', 'Authentication required.')
  }
  if (!REFERENCE_PATTERN.test(cleanRef)) {
    throw new BillingError(
      400,
      'INVALID_REFERENCE',
      'Invalid payment verification reference.',
    )
  }

  const { data: txRow, error: txFetchErr } = await admin
    .from('payment_transactions')
    .select('*')
    .eq('provider', provider.id)
    .eq('provider_checkout_ref', cleanRef)
    .maybeSingle()

  if (txFetchErr) {
    throw new BillingError(
      500,
      'TRANSACTION_LOOKUP_FAILED',
      'Unable to look up payment record.',
    )
  }
  if (!txRow) {
    throw new BillingError(
      404,
      'TRANSACTION_NOT_FOUND',
      'Payment record was not found for this reference.',
    )
  }

  // Strict ownership verification against verified auth user (W5).
  if (txRow.user_id !== input.userId) {
    throw new BillingError(
      403,
      'FORBIDDEN',
      'You do not have permission to verify this payment.',
    )
  }

  const plan = txRow.plan_id
    ? (
        await admin
          .from('subscription_plans')
          .select('*')
          .eq('id', txRow.plan_id)
          .maybeSingle()
      ).data
    : null

  if (txRow.status === 'succeeded') {
    const existingSub = txRow.subscription_id
      ? (
          await admin
            .from('subscriptions')
            .select('*')
            .eq('id', txRow.subscription_id)
            .maybeSingle()
        ).data
      : null

    return {
      status: 'succeeded',
      alreadyProcessed: true,
      reference: cleanRef,
      hasActivePremium: await hasActivePremiumAccess(admin, input.userId),
      subscription: existingSub ? serializeSubscription(existingSub, plan) : null,
    }
  }

  if (txRow.status === 'refunded') {
    return {
      status: 'refunded',
      alreadyProcessed: true,
      reference: cleanRef,
      hasActivePremium: await hasActivePremiumAccess(admin, input.userId),
      subscription: null,
    }
  }

  let verified: VerifiedTransactionResult
  try {
    verified = await provider.verifyTransaction(cleanRef)
  } catch {
    throw new BillingError(
      502,
      'PROVIDER_VERIFY_FAILED',
      'Unable to verify payment with Paystack right now.',
    )
  }

  if (verified.status === 'pending') {
    return {
      status: 'pending',
      alreadyProcessed: false,
      reference: cleanRef,
      hasActivePremium: await hasActivePremiumAccess(admin, input.userId),
      subscription: null,
    }
  }

  if (verified.status === 'failed' || verified.status === 'abandoned') {
    await admin
      .from('payment_transactions')
      .update({
        status: 'failed',
        provider_transaction_ref: verified.providerTransactionId,
        payment_channel: verified.channel,
        metadata: toJson({
          ...asRecord(txRow.metadata),
          provider_status: verified.status,
        }),
      })
      .eq('id', txRow.id)
      .eq('status', 'pending')

    return {
      status: 'failed',
      alreadyProcessed: false,
      reference: cleanRef,
      hasActivePremium: await hasActivePremiumAccess(admin, input.userId),
      subscription: null,
    }
  }

  if (!plan || plan.tier !== 'premium') {
    throw new BillingError(
      409,
      'PLAN_NOT_FOUND',
      'Associated subscription plan no longer exists.',
    )
  }

  const expectedAmount = txRow.expected_amount_minor ?? plan.amount_minor
  const expectedCurrency = (
    txRow.expected_currency ?? plan.currency
  )?.toUpperCase()

  if (
    expectedAmount === null ||
    expectedAmount <= 0 ||
    !expectedCurrency ||
    verified.amountMinor !== expectedAmount ||
    verified.currency.toUpperCase() !== expectedCurrency
  ) {
    await admin
      .from('payment_transactions')
      .update({
        status: 'failed',
        provider_transaction_ref: verified.providerTransactionId,
        metadata: toJson({
          ...asRecord(txRow.metadata),
          mismatch_error: true,
          verified_amount_minor: verified.amountMinor,
          verified_currency: verified.currency,
          expected_amount_minor: expectedAmount,
          expected_currency: expectedCurrency,
        }),
      })
      .eq('id', txRow.id)
      .in('status', ['pending', 'failed'])

    throw new BillingError(
      409,
      'PAYMENT_MISMATCH',
      'Verified payment amount or currency does not match the expected plan.',
    )
  }

  const metaUserId = asNonEmptyString(verified.metadata.user_id)
  if (metaUserId && metaUserId !== txRow.user_id) {
    throw new BillingError(
      409,
      'METADATA_USER_MISMATCH',
      'Payment metadata user does not match transaction owner.',
    )
  }

  const settled = await settleVerifiedCharge(admin, {
    txRow,
    userId: txRow.user_id,
    plan,
    provider: provider.id,
    providerTransactionId: verified.providerTransactionId,
    reference: cleanRef,
    amountMinor: verified.amountMinor,
    currency: verified.currency,
    paidAt: verified.paidAt,
    channel: verified.channel,
    customerCode: verified.customerCode,
    authorizationCode: verified.authorizationCode,
    subscriptionCode: verified.subscriptionCode,
    isRenewal: false,
  })

  return {
    status: 'succeeded',
    alreadyProcessed: settled.alreadyProcessed,
    reference: cleanRef,
    hasActivePremium: await hasActivePremiumAccess(admin, input.userId),
    subscription: serializeSubscription(settled.subscription, plan),
  }
}

function deriveWebhookEventId(
  payload: Record<string, unknown>,
  eventType: string,
  payloadHash: string,
): string {
  const directId =
    typeof payload.id === 'string' || typeof payload.id === 'number'
      ? String(payload.id).trim()
      : ''
  if (directId) return directId

  const data = asRecord(payload.data)
  const entityRef =
    asNonEmptyString(data.reference) ||
    asNonEmptyString(data.subscription_code) ||
    asNonEmptyString(data.invoice_code) ||
    (typeof data.id === 'string' || typeof data.id === 'number'
      ? String(data.id).trim()
      : '') ||
    'event'

  return `${eventType}:${entityRef}:${payloadHash.slice(0, 24)}`
}

async function resolvePlanByCodeOrRefs(
  admin: AdminSupabaseClient,
  planCode: string | null,
): Promise<SubscriptionPlanRow | null> {
  if (!planCode) return null

  const { data } = await admin
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)

  const rows = (data ?? []) as SubscriptionPlanRow[]
  return (
    rows.find(
      (p) =>
        p.code === planCode || extractPaystackPlanRef(p) === planCode,
    ) ?? null
  )
}

export async function processPaystackWebhook(
  deps: BillingServiceDeps,
  input: {
    rawBody: string
    signature: string | null
  },
): Promise<WebhookProcessResult> {
  const { admin, provider } = deps

  // Always verify Paystack HMAC-SHA512 signature BEFORE recording or trusting payload IDs.
  if (!provider.verifyWebhookSignature(input.rawBody, input.signature)) {
    throw new BillingError(
      401,
      'INVALID_WEBHOOK_SIGNATURE',
      'Invalid Paystack webhook signature.',
    )
  }

  let parsedRaw: unknown
  try {
    parsedRaw = JSON.parse(input.rawBody)
  } catch {
    throw new BillingError(400, 'INVALID_JSON', 'Malformed JSON payload.')
  }

  const payload = asRecord(parsedRaw)
  const eventType = asNonEmptyString(payload.event)
  if (!eventType) {
    throw new BillingError(
      400,
      'MISSING_EVENT_TYPE',
      'Paystack webhook payload is missing event type.',
    )
  }

  const payloadHash = crypto
    .createHash('sha256')
    .update(input.rawBody, 'utf8')
    .digest('hex')
  const providerEventId = deriveWebhookEventId(payload, eventType, payloadHash)

  let webhookRowId: string | null = null
  let existingRetryCount = 0

  const { data: insertedEvent, error: eventInsertErr } = await admin
    .from('webhook_events')
    .insert({
      provider: provider.id,
      provider_event_id: providerEventId,
      event_type: eventType,
      signature_verified: true,
      payload_hash: payloadHash,
      payload: payload as Json,
      processing_status: 'received',
      retry_count: 0,
    })
    .select('*')
    .single()

  if (eventInsertErr) {
    if (eventInsertErr.code !== '23505') {
      throw new BillingError(
        500,
        'WEBHOOK_LOG_FAILED',
        `Unable to record webhook event: ${eventInsertErr.message}`,
      )
    }

    const { data: existingEvent, error: existingErr } = await admin
      .from('webhook_events')
      .select('*')
      .eq('provider', provider.id)
      .eq('provider_event_id', providerEventId)
      .single()

    if (existingErr || !existingEvent) {
      throw new BillingError(
        500,
        'WEBHOOK_LOOKUP_FAILED',
        'Unable to read existing webhook event.',
      )
    }

    if (
      existingEvent.processing_status === 'processed' ||
      existingEvent.processing_status === 'ignored'
    ) {
      return {
        received: true,
        deduplicated: true,
        eventType,
        processingStatus: existingEvent.processing_status,
      }
    }

    webhookRowId = existingEvent.id
    existingRetryCount = existingEvent.retry_count + 1
    await admin
      .from('webhook_events')
      .update({
        retry_count: existingRetryCount,
        processing_status: 'received',
        error_message: null,
      })
      .eq('id', webhookRowId)
  } else {
    webhookRowId = insertedEvent.id
  }

  const data = asRecord(payload.data)
  let outcome: 'processed' | 'ignored' = 'processed'

  try {
    if (eventType === 'charge.success') {
      const reference = asNonEmptyString(data.reference)
      const txId =
        typeof data.id === 'number' || typeof data.id === 'string'
          ? String(data.id).trim() || null
          : null
      const amountMinor =
        typeof data.amount === 'number' && Number.isInteger(data.amount)
          ? data.amount
          : -1
      const currency = asNonEmptyString(data.currency)?.toUpperCase() || ''
      const paidAt =
        asNonEmptyString(data.paid_at) || asNonEmptyString(data.paidAt)
      const channel = asNonEmptyString(data.channel)
      const customer = asRecord(data.customer)
      const customerCode = asNonEmptyString(customer.customer_code)
      const authorization = asRecord(data.authorization)
      const authorizationCode = asNonEmptyString(
        authorization.authorization_code,
      )
      const planObject = asRecord(data.plan)
      const planCodeFromWebhook =
        asNonEmptyString(data.plan) ||
        asNonEmptyString(planObject.plan_code) ||
        asNonEmptyString(asRecord(data.plan_object).plan_code)
      const subscriptionObject = asRecord(data.subscription)
      const subscriptionCode =
        asNonEmptyString(subscriptionObject.subscription_code) ||
        asNonEmptyString(data.subscription_code) ||
        asNonEmptyString(data.subscription)
      const metadata = asRecord(data.metadata)

      let existingTx: PaymentTransactionRow | null = null
      if (reference) {
        const { data: txByCheckout } = await admin
          .from('payment_transactions')
          .select('*')
          .eq('provider', provider.id)
          .eq('provider_checkout_ref', reference)
          .maybeSingle()
        existingTx = txByCheckout ?? null
      }
      if (!existingTx && txId) {
        const { data: txByProviderId } = await admin
          .from('payment_transactions')
          .select('*')
          .eq('provider', provider.id)
          .eq('provider_transaction_ref', txId)
          .maybeSingle()
        existingTx = txByProviderId ?? null
      }

      let matchedSub: SubscriptionRow | null = null
      if (subscriptionCode) {
        const { data: subByRef } = await admin
          .from('subscriptions')
          .select('*')
          .eq('provider', provider.id)
          .eq('provider_subscription_ref', subscriptionCode)
          .maybeSingle()
        matchedSub = subByRef ?? null
      }

      let userId: string | null =
        existingTx?.user_id ??
        matchedSub?.user_id ??
        asNonEmptyString(metadata.user_id)

      if (!userId && customerCode) {
        const { data: subByCustomer } = await admin
          .from('subscriptions')
          .select('*')
          .eq('provider', provider.id)
          .eq('provider_customer_ref', customerCode)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (subByCustomer) {
          userId = subByCustomer.user_id
          if (!matchedSub) matchedSub = subByCustomer
        }
      }

      let plan: SubscriptionPlanRow | null = null
      const candidatePlanId =
        existingTx?.plan_id ??
        matchedSub?.plan_id ??
        asNonEmptyString(metadata.plan_id)

      if (candidatePlanId) {
        const { data: pRow } = await admin
          .from('subscription_plans')
          .select('*')
          .eq('id', candidatePlanId)
          .maybeSingle()
        plan = pRow ?? null
      }
      if (!plan) {
        plan = await resolvePlanByCodeOrRefs(admin, planCodeFromWebhook)
      }

      if (!userId || !plan || plan.tier !== 'premium') {
        outcome = 'ignored'
      } else {
        const expectedAmount =
          existingTx?.expected_amount_minor ?? plan.amount_minor
        const expectedCurrency = (
          existingTx?.expected_currency ?? plan.currency
        )?.toUpperCase()

        if (
          expectedAmount === null ||
          expectedAmount <= 0 ||
          !expectedCurrency ||
          amountMinor !== expectedAmount ||
          currency !== expectedCurrency
        ) {
          if (existingTx) {
            await admin
              .from('payment_transactions')
              .update({
                status: 'failed',
                provider_transaction_ref: txId,
                metadata: toJson({
                  ...asRecord(existingTx.metadata),
                  webhook_mismatch: true,
                  verified_amount_minor: amountMinor,
                  verified_currency: currency,
                }),
              })
              .eq('id', existingTx.id)
              .in('status', ['pending', 'failed'])
          }
          throw new BillingError(
            409,
            'WEBHOOK_AMOUNT_MISMATCH',
            'Webhook charge amount or currency does not match expected plan.',
          )
        }

        await settleVerifiedCharge(admin, {
          txRow: existingTx,
          userId,
          plan,
          provider: provider.id,
          providerTransactionId: txId,
          reference,
          amountMinor,
          currency,
          paidAt,
          channel,
          customerCode,
          authorizationCode,
          subscriptionCode,
          isRenewal: Boolean(matchedSub && !existingTx),
          rawMetadata: { webhook_event: eventType },
        })
      }
    } else if (eventType === 'subscription.create') {
      const subscriptionCode = asNonEmptyString(data.subscription_code)
      const emailToken = asNonEmptyString(data.email_token)
      const nextPaymentDate = asIsoDateString(data.next_payment_date)
      const customer = asRecord(data.customer)
      const customerCode = asNonEmptyString(customer.customer_code)
      const authorization = asRecord(data.authorization)
      const authorizationCode = asNonEmptyString(
        authorization.authorization_code,
      )
      const planObject = asRecord(data.plan)
      const planCode = asNonEmptyString(planObject.plan_code)
      const mostRecentInvoice = asRecord(data.most_recent_invoice)
      const invoiceRef = asNonEmptyString(mostRecentInvoice.transaction_reference)

      let targetSub: SubscriptionRow | null = null
      if (subscriptionCode) {
        const { data: subByCode } = await admin
          .from('subscriptions')
          .select('*')
          .eq('provider', provider.id)
          .eq('provider_subscription_ref', subscriptionCode)
          .maybeSingle()
        targetSub = subByCode ?? null
      }

      let pendingCheckoutMatch = false
      if (!targetSub && invoiceRef) {
        const { data: txByRef } = await admin
          .from('payment_transactions')
          .select('*')
          .eq('provider', provider.id)
          .eq('provider_checkout_ref', invoiceRef)
          .maybeSingle()

        if (txByRef?.subscription_id) {
          const { data: subByTx } = await admin
            .from('subscriptions')
            .select('*')
            .eq('id', txByRef.subscription_id)
            .maybeSingle()
          targetSub = subByTx ?? null
        } else if (txByRef?.status === 'pending') {
          pendingCheckoutMatch = true
        }
      }

      if (!targetSub && pendingCheckoutMatch) {
        throw new BillingError(
          503,
          'AWAITING_CHARGE_SETTLEMENT',
          'Checkout payment has not settled yet; retry webhook delivery.',
        )
      }

      if (!targetSub && customerCode) {
        const { data: subByCustomer } = await admin
          .from('subscriptions')
          .select('*')
          .eq('provider', provider.id)
          .eq('provider_customer_ref', customerCode)
          .in('status', ['active', 'past_due', 'cancelled'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        targetSub = subByCustomer ?? null
      }

      if (!targetSub && customerCode) {
        const { data: profileMatch } = await admin
          .from('profiles')
          .select('id')
          .contains('provider_customer_ids', { paystack: customerCode })
          .limit(1)
          .maybeSingle()

        if (profileMatch) {
          const { data: subByProfile } = await admin
            .from('subscriptions')
            .select('*')
            .eq('user_id', profileMatch.id)
            .in('status', ['active', 'past_due', 'cancelled'])
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          targetSub = subByProfile ?? null
        }
      }

      if (targetSub) {
        const updates: Database['public']['Tables']['subscriptions']['Update'] = {
          provider_subscription_ref:
            subscriptionCode ?? targetSub.provider_subscription_ref,
          provider_customer_ref: customerCode ?? targetSub.provider_customer_ref,
        }
        if (nextPaymentDate) {
          const nextMs = Date.parse(nextPaymentDate)
          if (Number.isFinite(nextMs) && nextMs > Date.now()) {
            updates.current_period_end = nextPaymentDate
          }
        }

        await admin
          .from('subscriptions')
          .update(updates)
          .eq('id', targetSub.id)

        await upsertProviderTokens(admin, targetSub.id, provider.id, {
          emailToken: emailToken ?? undefined,
          authorizationCode: authorizationCode ?? undefined,
          tokenMetadata: planCode ? { plan_code: planCode } : undefined,
        })

        await mergeProfilePaystackCustomerId(
          admin,
          targetSub.user_id,
          customerCode,
        )

        // If the user requested cancellation before subscription.create delivered email_token,
        // execute the Paystack disable call immediately now that both tokens are available.
        const meta = asRecord(targetSub.metadata)
        if (
          targetSub.cancel_at_period_end &&
          meta.pending_provider_disable === true &&
          subscriptionCode &&
          emailToken
        ) {
          await provider.disableSubscription({
            subscriptionCode,
            emailToken,
          })
          await admin
            .from('subscriptions')
            .update({
              metadata: toJson({
                ...meta,
                pending_provider_disable: false,
              }),
            })
            .eq('id', targetSub.id)
        }
      } else {
        outcome = 'ignored'
      }
    } else if (
      eventType === 'invoice.payment_failed' ||
      (eventType === 'invoice.update' && data.paid === false)
    ) {
      const subscriptionObject = asRecord(data.subscription)
      const subscriptionCode =
        asNonEmptyString(subscriptionObject.subscription_code) ||
        asNonEmptyString(data.subscription_code) ||
        asNonEmptyString(data.subscription)
      const txObj = asRecord(data.transaction)
      const txRef = asNonEmptyString(txObj.reference)
      const txId =
        typeof txObj.id === 'number' || typeof txObj.id === 'string'
          ? String(txObj.id).trim() || null
          : null
      const invoiceCode = asNonEmptyString(data.invoice_code)
      const amountMinor =
        typeof data.amount === 'number' && Number.isInteger(data.amount)
          ? Math.max(0, data.amount)
          : 0
      const planObject = asRecord(data.plan)
      const currency =
        asNonEmptyString(planObject.currency)?.toUpperCase() || 'NGN'

      if (subscriptionCode) {
        const { data: sub } = await admin
          .from('subscriptions')
          .select('*')
          .eq('provider', provider.id)
          .eq('provider_subscription_ref', subscriptionCode)
          .maybeSingle()

        if (sub) {
          if (sub.status === 'active') {
            await admin
              .from('subscriptions')
              .update({ status: 'past_due' })
              .eq('id', sub.id)
          }

          if (txId || txRef || invoiceCode) {
            await admin.from('payment_transactions').insert({
              user_id: sub.user_id,
              subscription_id: sub.id,
              plan_id: sub.plan_id,
              provider: provider.id,
              provider_transaction_ref: txId,
              provider_checkout_ref: txRef ?? invoiceCode,
              provider_invoice_ref: invoiceCode,
              amount_minor: amountMinor,
              currency,
              status: 'failed',
              metadata: toJson({ webhook_event: eventType }),
            })
          }
        } else {
          outcome = 'ignored'
        }
      } else {
        outcome = 'ignored'
      }
    } else if (
      eventType === 'subscription.not_renew' ||
      eventType === 'subscription.disable'
    ) {
      const subscriptionCode = asNonEmptyString(data.subscription_code)
      if (subscriptionCode) {
        const { data: sub } = await admin
          .from('subscriptions')
          .select('*')
          .eq('provider', provider.id)
          .eq('provider_subscription_ref', subscriptionCode)
          .maybeSingle()

        if (sub) {
          const nowIso = new Date().toISOString()
          const periodEndMs = sub.current_period_end
            ? Date.parse(sub.current_period_end)
            : null
          const stillPaidThrough =
            periodEndMs !== null &&
            Number.isFinite(periodEndMs) &&
            periodEndMs > Date.now()

          if (
            stillPaidThrough &&
            (sub.status === 'active' || sub.status === 'cancelled')
          ) {
            await admin
              .from('subscriptions')
              .update({
                status: 'cancelled',
                cancel_at_period_end: true,
                cancelled_at: sub.cancelled_at ?? nowIso,
                ended_at: null,
              })
              .eq('id', sub.id)
          } else {
            await admin
              .from('subscriptions')
              .update({
                status: 'expired',
                cancel_at_period_end: true,
                cancelled_at: sub.cancelled_at ?? nowIso,
                ended_at: sub.ended_at ?? sub.current_period_end ?? nowIso,
              })
              .eq('id', sub.id)
          }
        } else {
          outcome = 'ignored'
        }
      } else {
        outcome = 'ignored'
      }
    } else if (eventType === 'refund.processed') {
      const txId =
        typeof data.transaction === 'number' ||
        typeof data.transaction === 'string'
          ? String(data.transaction).trim() || null
          : null
      const txRef = asNonEmptyString(data.transaction_reference)

      const { data: tx } = txId
        ? await admin
            .from('payment_transactions')
            .select('*')
            .eq('provider', provider.id)
            .eq('provider_transaction_ref', txId)
            .maybeSingle()
        : txRef
          ? await admin
              .from('payment_transactions')
              .select('*')
              .eq('provider', provider.id)
              .eq('provider_checkout_ref', txRef)
              .maybeSingle()
          : { data: null }

      if (tx) {
        await admin
          .from('payment_transactions')
          .update({ status: 'refunded' })
          .eq('id', tx.id)

        if (tx.subscription_id) {
          const nowIso = new Date().toISOString()
          await admin
            .from('subscriptions')
            .update({
              status: 'cancelled',
              cancel_at_period_end: true,
              cancelled_at: nowIso,
              ended_at: nowIso,
            })
            .eq('id', tx.subscription_id)
        }
      } else {
        outcome = 'ignored'
      }
    } else {
      outcome = 'ignored'
    }

    await admin
      .from('webhook_events')
      .update({
        processing_status: outcome,
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', webhookRowId)

    return {
      received: true,
      deduplicated: false,
      eventType,
      processingStatus: outcome,
    }
  } catch (err) {
    await admin
      .from('webhook_events')
      .update({
        processing_status: 'failed',
        error_message: err instanceof Error ? err.message : 'Webhook failed',
      })
      .eq('id', webhookRowId)

    throw err
  }
}

export async function getUserBillingOverview(
  admin: AdminSupabaseClient,
  userId: string,
): Promise<UserBillingOverview> {
  if (!userId) {
    throw new BillingError(401, 'UNAUTHENTICATED', 'Authentication required.')
  }

  const [hasActivePremium, profileRes, subsRes, txRes] = await Promise.all([
    hasActivePremiumAccess(admin, userId),
    admin
      .from('profiles')
      .select(
        'role, membership_tier, membership_status, subscription_expires_at',
      )
      .eq('id', userId)
      .maybeSingle(),
    admin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(5),
    admin
      .from('payment_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const subs = (subsRes.data ?? []) as SubscriptionRow[]
  let currentSubSummary: SubscriptionSummary | null = null

  if (subs.length > 0) {
    const planIds = Array.from(new Set(subs.map((s) => s.plan_id)))
    const { data: plansData } = await admin
      .from('subscription_plans')
      .select('id, code, name, tier')
      .in('id', planIds)

    const planMap = new Map(
      (plansData ?? []).map((p) => [p.id, p]),
    )

    const ranked = subs
      .map((s) => serializeSubscription(s, planMap.get(s.plan_id) ?? null))
      .sort((a, b) => {
        if (a.entitledNow !== b.entitledNow) return a.entitledNow ? -1 : 1
        return 0
      })

    currentSubSummary = ranked[0] ?? null
  }

  return {
    hasActivePremium,
    profile: profileRes.data
      ? {
          role: profileRes.data.role,
          membershipTier: profileRes.data.membership_tier,
          membershipStatus: profileRes.data.membership_status,
          subscriptionExpiresAt: profileRes.data.subscription_expires_at,
        }
      : null,
    subscription: currentSubSummary,
    recentTransactions: ((txRes.data ?? []) as PaymentTransactionRow[]).map(
      serializeTransaction,
    ),
  }
}

export async function cancelUserSubscription(
  deps: BillingServiceDeps,
  userId: string,
): Promise<{
  subscription: SubscriptionSummary
  hasActivePremium: boolean
}> {
  const { admin, provider } = deps
  if (!userId) {
    throw new BillingError(401, 'UNAUTHENTICATED', 'Authentication required.')
  }

  const { data: sub, error: subErr } = await admin
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (subErr) {
    throw new BillingError(
      500,
      'SUBSCRIPTION_LOOKUP_FAILED',
      'Unable to locate your subscription.',
    )
  }

  if (!sub) {
    throw new BillingError(
      404,
      'NO_ACTIVE_SUBSCRIPTION',
      'No active subscription was found to cancel.',
    )
  }

  const { data: tokenRow } = await admin
    .from('subscription_provider_tokens')
    .select('email_token')
    .eq('subscription_id', sub.id)
    .maybeSingle()

  let pendingProviderDisable = false

  if (sub.provider_subscription_ref && tokenRow?.email_token) {
    try {
      await provider.disableSubscription({
        subscriptionCode: sub.provider_subscription_ref,
        emailToken: tokenRow.email_token,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : ''
      if (!msg.includes('already') && !msg.includes('not active')) {
        throw new BillingError(
          502,
          'PROVIDER_CANCEL_FAILED',
          'Unable to cancel Paystack renewal right now.',
        )
      }
    }
  } else {
    pendingProviderDisable = true
  }

  const nowIso = new Date().toISOString()
  const periodEndMs = sub.current_period_end
    ? Date.parse(sub.current_period_end)
    : null
  const stillPaidThrough =
    sub.status === 'active' &&
    periodEndMs !== null &&
    Number.isFinite(periodEndMs) &&
    periodEndMs > Date.now()

  const { data: updatedSub, error: updateErr } = await admin
    .from('subscriptions')
    .update({
      status: stillPaidThrough ? 'cancelled' : 'expired',
      cancel_at_period_end: true,
      cancelled_at: sub.cancelled_at ?? nowIso,
      ended_at: stillPaidThrough ? null : (sub.current_period_end ?? nowIso),
      metadata: toJson({
        ...asRecord(sub.metadata),
        pending_provider_disable: pendingProviderDisable,
      }),
    })
    .eq('id', sub.id)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (updateErr || !updatedSub) {
    throw new BillingError(
      500,
      'CANCEL_UPDATE_FAILED',
      'Unable to save cancellation state.',
    )
  }

  const { data: plan } = await admin
    .from('subscription_plans')
    .select('code, name, tier')
    .eq('id', updatedSub.plan_id)
    .maybeSingle()

  return {
    subscription: serializeSubscription(updatedSub, plan ?? null),
    hasActivePremium: await hasActivePremiumAccess(admin, userId),
  }
}

export async function createUserManageLink(
  deps: BillingServiceDeps,
  userId: string,
): Promise<{ managementUrl: string }> {
  const { admin, provider } = deps
  if (!userId) {
    throw new BillingError(401, 'UNAUTHENTICATED', 'Authentication required.')
  }

  const { data: sub, error: subErr } = await admin
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due', 'cancelled'])
    .is('ended_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (subErr) {
    throw new BillingError(
      500,
      'SUBSCRIPTION_LOOKUP_FAILED',
      'Unable to locate your subscription.',
    )
  }

  if (!sub || !sub.provider_subscription_ref) {
    throw new BillingError(
      409,
      'MANAGE_LINK_UNAVAILABLE',
      'Paystack subscription management link is not yet available for this subscription.',
    )
  }

  let linkResult
  try {
    linkResult = await provider.generateManagementLink(
      sub.provider_subscription_ref,
    )
  } catch {
    throw new BillingError(
      502,
      'PROVIDER_MANAGE_LINK_FAILED',
      'Unable to generate Paystack management link right now.',
    )
  }

  await upsertProviderTokens(admin, sub.id, provider.id, {
    managementUrl: linkResult.managementUrl,
  })

  return { managementUrl: linkResult.managementUrl }
}

export async function runExpireOverdueSubscriptions(
  admin: AdminSupabaseClient,
  graceInterval: string = '0 seconds',
): Promise<{ expiredCount: number; graceInterval: string }> {
  const cleanGrace = graceInterval.trim() || '0 seconds'
  if (!ALLOWED_EXPIRY_GRACE_PATTERN.test(cleanGrace)) {
    throw new BillingError(
      400,
      'INVALID_GRACE_INTERVAL',
      'Unsupported expiry grace interval.',
    )
  }

  const { data, error } = await admin.rpc('expire_overdue_subscriptions', {
    p_grace_interval: cleanGrace,
  })

  if (error) {
    throw new BillingError(
      500,
      'EXPIRE_RPC_FAILED',
      `Failed to expire overdue subscriptions: ${error.message}`,
    )
  }

  return {
    expiredCount: typeof data === 'number' ? data : 0,
    graceInterval: cleanGrace,
  }
}
