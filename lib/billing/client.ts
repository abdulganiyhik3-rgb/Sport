import type {
  AccessTier,
  BillingInterval,
  Json,
  MembershipStatus,
  MembershipTier,
  StreamFormat,
  SubscriptionStatus,
  TransactionStatus,
  UserRole,
} from '@/lib/supabase/types'

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
  checkoutConfigured?: boolean
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

export interface MediaAccessGrantResponse {
  granted: true
  accessTier: AccessTier
  mediaUrl: string
  streamFormat: StreamFormat
  rightsHolder: string | null
  licenseExpiresAt: string | null
}

export interface MediaAccessDenialResponse {
  granted: false
  statusCode: number
  code: string
  error: string
  upgradeRequired: boolean
  reason?: 'no_active_subscription' | 'subscription_expired'
  licenseStartsAt?: string | null
  licenseExpiresAt?: string | null
}

export type MediaAccessClientResult =
  | MediaAccessGrantResponse
  | MediaAccessDenialResponse

export class BillingClientError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'BillingClientError'
    this.statusCode = statusCode
    this.code = code
  }
}

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

const THREE_DECIMAL_CURRENCIES = new Set([
  'BHD',
  'IQD',
  'JOD',
  'KWD',
  'LYD',
  'OMR',
  'TND',
])

export function getCurrencyMinorDecimals(currency: string): number {
  const code = currency.trim().toUpperCase()
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3
  return 2
}

export function formatMinorCurrency(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (
    typeof amountMinor !== 'number' ||
    !Number.isFinite(amountMinor) ||
    amountMinor < 0 ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/i.test(currency.trim())
  ) {
    return null
  }

  const code = currency.trim().toUpperCase()
  const decimals = getCurrencyMinorDecimals(code)
  const majorAmount = amountMinor / 10 ** decimals

  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: majorAmount % 1 === 0 ? 0 : decimals,
      maximumFractionDigits: decimals,
    }).format(majorAmount)
  } catch {
    return `${code} ${majorAmount.toFixed(decimals)}`
  }
}

export function formatBillingIntervalLabel(interval: BillingInterval): string {
  if (interval === 'month') return 'per month'
  if (interval === 'year') return 'per year'
  return ''
}

export function extractPlanFeatures(features: Json): string[] {
  if (!Array.isArray(features)) return []
  return features
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

export interface AnnualPlanSavings {
  monthlyPlanCode: string
  yearlyPlanCode: string
  currency: string
  monthlyAmountMinor: number
  annualizedMonthlyMinor: number
  yearlyAmountMinor: number
  savingsMinor: number
  savingsPercent: number
  equivalentMonthlyMinor: number
  monthsFree: number | null
}

export function calculateAnnualPlanSavings(
  plans: PublicPlanSummary[],
): AnnualPlanSavings | null {
  const monthly = plans.find(
    (plan) =>
      plan.tier === 'premium' &&
      plan.billingInterval === 'month' &&
      typeof plan.amountMinor === 'number' &&
      plan.amountMinor > 0 &&
      typeof plan.currency === 'string' &&
      /^[A-Z]{3}$/i.test(plan.currency.trim()),
  )
  if (!monthly || !monthly.amountMinor || !monthly.currency) return null

  const monthlyCurrency = monthly.currency.trim().toUpperCase()
  const yearly = plans.find(
    (plan) =>
      plan.tier === 'premium' &&
      plan.billingInterval === 'year' &&
      typeof plan.amountMinor === 'number' &&
      plan.amountMinor > 0 &&
      typeof plan.currency === 'string' &&
      plan.currency.trim().toUpperCase() === monthlyCurrency,
  )
  if (!yearly || !yearly.amountMinor) return null

  const annualizedMonthlyMinor = monthly.amountMinor * 12
  const savingsMinor = annualizedMonthlyMinor - yearly.amountMinor
  if (savingsMinor <= 0) return null

  const savingsPercent = Math.round((savingsMinor / annualizedMonthlyMinor) * 100)
  const equivalentMonthlyMinor = Math.round(yearly.amountMinor / 12)
  const exactMonthsFree = savingsMinor / monthly.amountMinor
  const monthsFree =
    Number.isInteger(exactMonthsFree) && exactMonthsFree >= 1
      ? exactMonthsFree
      : null

  return {
    monthlyPlanCode: monthly.code,
    yearlyPlanCode: yearly.code,
    currency: monthlyCurrency,
    monthlyAmountMinor: monthly.amountMinor,
    annualizedMonthlyMinor,
    yearlyAmountMinor: yearly.amountMinor,
    savingsMinor,
    savingsPercent,
    equivalentMonthlyMinor,
    monthsFree,
  }
}

export interface MembershipDisplayModel {
  freePlan: PublicPlanSummary | null
  premiumPlans: PublicPlanSummary[]
  paidPlansConfigured: boolean
  checkoutEnabled: boolean
  annualSavings: AnnualPlanSavings | null
  comingSoonMessage: string | null
}

export function getMembershipDisplayModel(
  response: PublicPlansResponse | null,
): MembershipDisplayModel {
  const plans = response?.plans ?? []
  const freePlan = plans.find((plan) => plan.tier === 'free') ?? null
  const premiumPlans = plans.filter(
    (plan) =>
      plan.tier === 'premium' &&
      typeof plan.amountMinor === 'number' &&
      plan.amountMinor > 0 &&
      typeof plan.currency === 'string' &&
      /^[A-Z]{3}$/i.test(plan.currency.trim()),
  )
  const paidPlansConfigured =
    Boolean(response?.paidPlansConfigured) && premiumPlans.length > 0
  const checkoutEnabled =
    paidPlansConfigured &&
    response?.checkoutConfigured !== false &&
    premiumPlans.some((plan) => plan.checkoutReady)

  return {
    freePlan,
    premiumPlans,
    paidPlansConfigured,
    checkoutEnabled,
    annualSavings: calculateAnnualPlanSavings(premiumPlans),
    comingSoonMessage: paidPlansConfigured
      ? null
      : 'Premium plans coming soon',
  }
}

export type AccountPlansDisplayState =
  | { kind: 'loading'; display: MembershipDisplayModel }
  | { kind: 'error'; errorMessage: string; display: MembershipDisplayModel }
  | { kind: 'empty'; display: MembershipDisplayModel }
  | { kind: 'ready'; display: MembershipDisplayModel }

export function describeAccountPlansState(
  response: PublicPlansResponse | null,
  options: { loading?: boolean; error?: string | null } = {},
): AccountPlansDisplayState {
  const display = getMembershipDisplayModel(response)

  if (display.paidPlansConfigured) {
    return { kind: 'ready', display }
  }

  if (options.loading) {
    return { kind: 'loading', display }
  }

  const cleanError = options.error?.trim() || ''
  if (cleanError) {
    return { kind: 'error', errorMessage: cleanError, display }
  }

  return { kind: 'empty', display }
}

export function isSafePaystackRedirectUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export interface ParsedBillingCallback {
  reference: string | null
  cancelled: boolean
  errorDescription: string | null
}

export function parseBillingCallbackSearch(search: string): ParsedBillingCallback {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  )
  const rawRef =
    params.get('reference')?.trim() || params.get('trxref')?.trim() || null

  const statusParam = params.get('status')?.trim().toLowerCase() || ''
  const cancelledParam = params.get('cancelled')?.trim().toLowerCase() || ''
  const errorParam = params.get('error')?.trim().toLowerCase() || ''

  const cancelled =
    cancelledParam === '1' ||
    cancelledParam === 'true' ||
    statusParam === 'cancelled' ||
    statusParam === 'canceled' ||
    errorParam === 'cancelled' ||
    errorParam === 'canceled'

  const errorDescription =
    params.get('error_description')?.trim() ||
    (errorParam && !cancelled ? params.get('error')?.trim() || null : null)

  return {
    reference: rawRef,
    cancelled,
    errorDescription,
  }
}

export interface SubscriptionDisplaySummary {
  hasActivePremium: boolean
  badgeLabel: string
  planTitle: string
  periodSummary: string
  canCancel: boolean
  canManage: boolean
}

export interface AccountMembershipSummary {
  tierLabel: 'Premium' | 'Free' | 'Checking' | 'Unavailable'
  statusLabel: string
  periodDateIso: string | null
  periodDateVerb: 'Renews' | 'Ends' | 'Ended' | null
  subscription: SubscriptionDisplaySummary
}

export function describeUserSubscription(
  overview: UserBillingOverview | null,
): SubscriptionDisplaySummary {
  if (!overview || !overview.subscription) {
    const hasPremium = Boolean(overview?.hasActivePremium)
    return {
      hasActivePremium: hasPremium,
      badgeLabel: hasPremium ? 'Premium' : 'Free',
      planTitle: hasPremium ? 'SPORTIVRA Premium' : 'SPORTIVRA Free',
      periodSummary: hasPremium
        ? 'Your Premium access is active.'
        : 'Live scores, match reminders, highlights, and news.',
      canCancel: false,
      canManage: false,
    }
  }

  const sub = overview.subscription
  const planTitle = sub.planName || 'SPORTIVRA Premium'
  const isEntitledNow = Boolean(overview.hasActivePremium) && sub.entitledNow
  const endDate = sub.endedAt ?? sub.currentPeriodEnd

  if (sub.status === 'active') {
    if (isEntitledNow) {
      return {
        hasActivePremium: true,
        badgeLabel: sub.cancelAtPeriodEnd ? 'Cancels at period end' : 'Active',
        planTitle,
        periodSummary: sub.currentPeriodEnd
          ? sub.cancelAtPeriodEnd
            ? `Access active until ${formatUtcDateShort(sub.currentPeriodEnd)}`
            : `Renews on ${formatUtcDateShort(sub.currentPeriodEnd)}`
          : 'Subscription active',
        canCancel: !sub.cancelAtPeriodEnd,
        canManage: true,
      }
    }

    return {
      hasActivePremium: false,
      badgeLabel: 'Expired',
      planTitle,
      periodSummary: endDate
        ? `Ended on ${formatUtcDateShort(endDate)}`
        : 'Subscription has expired.',
      canCancel: false,
      canManage: false,
    }
  }

  if (sub.status === 'cancelled') {
    if (isEntitledNow) {
      return {
        hasActivePremium: true,
        badgeLabel: 'Cancelled',
        planTitle,
        periodSummary: sub.currentPeriodEnd
          ? `Auto-renew disabled • Access active until ${formatUtcDateShort(sub.currentPeriodEnd)}`
          : 'Auto-renew disabled • Access active through current period',
        canCancel: false,
        canManage: sub.endedAt === null,
      }
    }

    return {
      hasActivePremium: false,
      badgeLabel: 'Ended',
      planTitle,
      periodSummary: endDate
        ? `Ended on ${formatUtcDateShort(endDate)}`
        : 'Subscription is no longer active.',
      canCancel: false,
      canManage: false,
    }
  }

  if (sub.status === 'past_due') {
    if (isEntitledNow) {
      return {
        hasActivePremium: true,
        badgeLabel: 'Past due',
        planTitle,
        periodSummary: sub.currentPeriodEnd
          ? `Payment retry needed • Period ends ${formatUtcDateShort(sub.currentPeriodEnd)}`
          : 'Payment retry needed — please update your payment method.',
        canCancel: true,
        canManage: true,
      }
    }

    return {
      hasActivePremium: false,
      badgeLabel: 'Expired',
      planTitle,
      periodSummary: endDate
        ? `Ended on ${formatUtcDateShort(endDate)}`
        : 'Subscription has expired.',
      canCancel: false,
      canManage: false,
    }
  }

  if (sub.status === 'expired') {
    return {
      hasActivePremium: false,
      badgeLabel: 'Expired',
      planTitle,
      periodSummary: endDate
        ? `Ended on ${formatUtcDateShort(endDate)}`
        : 'Subscription is no longer active.',
      canCancel: false,
      canManage: false,
    }
  }

  return {
    hasActivePremium: false,
    badgeLabel: 'Incomplete',
    planTitle,
    periodSummary: 'Checkout has not completed yet.',
    canCancel: false,
    canManage: false,
  }
}

export function describeAccountMembershipSummary(
  overview: UserBillingOverview | null,
  options: { loading?: boolean; error?: string | null } = {},
): AccountMembershipSummary {
  if (!overview && options.loading) {
    return {
      tierLabel: 'Checking',
      statusLabel: 'Checking',
      periodDateIso: null,
      periodDateVerb: null,
      subscription: {
        hasActivePremium: false,
        badgeLabel: 'Checking',
        planTitle: 'Checking membership...',
        periodSummary: 'Verifying live subscription status...',
        canCancel: false,
        canManage: false,
      },
    }
  }

  if (!overview && options.error) {
    return {
      tierLabel: 'Unavailable',
      statusLabel: 'Unavailable',
      periodDateIso: null,
      periodDateVerb: null,
      subscription: {
        hasActivePremium: false,
        badgeLabel: 'Unavailable',
        planTitle: 'Membership status unavailable',
        periodSummary: 'Could not verify live subscription status right now.',
        canCancel: false,
        canManage: false,
      },
    }
  }

  const subscription = describeUserSubscription(overview)
  const sub = overview?.subscription ?? null

  let periodDateIso: string | null = null
  let periodDateVerb: 'Renews' | 'Ends' | 'Ended' | null = null

  if (subscription.hasActivePremium && sub?.currentPeriodEnd) {
    periodDateIso = sub.currentPeriodEnd
    periodDateVerb =
      sub.cancelAtPeriodEnd || sub.status === 'cancelled' ? 'Ends' : 'Renews'
  } else if (
    !subscription.hasActivePremium &&
    sub &&
    sub.status !== 'incomplete'
  ) {
    const endIso = sub.endedAt ?? sub.currentPeriodEnd
    if (endIso) {
      periodDateIso = endIso
      periodDateVerb = 'Ended'
    }
  }

  return {
    tierLabel: subscription.hasActivePremium ? 'Premium' : 'Free',
    statusLabel: subscription.badgeLabel,
    periodDateIso,
    periodDateVerb,
    subscription,
  }
}

export type StreamPlaybackStrategy = 'hls' | 'native' | 'unsupported_dash'

export function getStreamPlaybackStrategy(
  mediaUrl: string,
  streamFormat?: StreamFormat,
): StreamPlaybackStrategy {
  if (streamFormat === 'hls' || /\.m3u8(\?|$)/i.test(mediaUrl)) {
    return 'hls'
  }
  if (streamFormat === 'dash' || /\.mpd(\?|$)/i.test(mediaUrl)) {
    return 'unsupported_dash'
  }
  return 'native'
}

function formatUtcDateShort(isoString: string): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return isoString
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    if (!res.ok) {
      throw new BillingClientError(
        res.status,
        'HTTP_ERROR',
        `Request failed with status ${res.status}.`,
      )
    }
    throw new BillingClientError(
      500,
      'INVALID_RESPONSE',
      'Unexpected non-JSON response from server.',
    )
  }

  if (!res.ok) {
    const errRecord =
      parsed && typeof parsed === 'object'
        ? (parsed as { error?: unknown; code?: unknown })
        : {}
    const message =
      typeof errRecord.error === 'string' && errRecord.error.trim()
        ? errRecord.error.trim()
        : `Request failed with status ${res.status}.`
    const code =
      typeof errRecord.code === 'string' && errRecord.code.trim()
        ? errRecord.code.trim()
        : 'BILLING_ERROR'

    throw new BillingClientError(res.status, code, message)
  }

  return parsed as T
}

export async function fetchPublicPlans(
  fetchImpl: typeof fetch = fetch,
): Promise<PublicPlansResponse> {
  const res = await fetchImpl('/api/billing/plans', {
    method: 'GET',
    cache: 'no-store',
  })
  return parseJsonResponse<PublicPlansResponse>(res)
}

export async function fetchBillingOverview(
  fetchImpl: typeof fetch = fetch,
): Promise<UserBillingOverview> {
  const res = await fetchImpl('/api/billing/subscription', {
    method: 'GET',
    cache: 'no-store',
  })
  return parseJsonResponse<UserBillingOverview>(res)
}

export async function initializeCheckoutSession(
  planCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutResponse> {
  const res = await fetchImpl('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planCode }),
    cache: 'no-store',
  })
  const data = await parseJsonResponse<CheckoutResponse>(res)
  if (!isSafePaystackRedirectUrl(data.authorizationUrl)) {
    throw new BillingClientError(
      502,
      'INVALID_CHECKOUT_URL',
      'Received an invalid Paystack authorization URL.',
    )
  }
  return data
}

export async function verifyCheckoutPayment(
  reference: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyCheckoutResponse> {
  const res = await fetchImpl(
    `/api/billing/verify?reference=${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  )
  return parseJsonResponse<VerifyCheckoutResponse>(res)
}

export async function cancelUserSubscriptionRequest(
  fetchImpl: typeof fetch = fetch,
): Promise<{
  subscription: SubscriptionSummary
  hasActivePremium: boolean
}> {
  const res = await fetchImpl('/api/billing/subscription/cancel', {
    method: 'POST',
    cache: 'no-store',
  })
  return parseJsonResponse<{
    subscription: SubscriptionSummary
    hasActivePremium: boolean
  }>(res)
}

export async function createManageSubscriptionLinkRequest(
  fetchImpl: typeof fetch = fetch,
): Promise<{ managementUrl: string }> {
  const res = await fetchImpl('/api/billing/subscription/manage-link', {
    method: 'POST',
    cache: 'no-store',
  })
  const data = await parseJsonResponse<{ managementUrl: string }>(res)
  if (!isSafePaystackRedirectUrl(data.managementUrl)) {
    throw new BillingClientError(
      502,
      'INVALID_MANAGE_URL',
      'Received an invalid Paystack management link.',
    )
  }
  return data
}

export async function fetchProtectedMediaAccess(
  target: { matchId: string } | { highlightId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<MediaAccessClientResult> {
  const res = await fetchImpl('/api/media/access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(target),
    cache: 'no-store',
  })

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    return {
      granted: false,
      statusCode: res.status || 500,
      code: 'INVALID_RESPONSE',
      error: 'Unable to parse media access response.',
      upgradeRequired: false,
    }
  }

  if (
    res.ok &&
    body &&
    typeof body === 'object' &&
    (body as { granted?: unknown }).granted === true
  ) {
    return body as MediaAccessGrantResponse
  }

  const record =
    body && typeof body === 'object'
      ? (body as Partial<MediaAccessDenialResponse>)
      : {}

  return {
    granted: false,
    statusCode: res.status || 500,
    code: typeof record.code === 'string' ? record.code : 'ACCESS_DENIED',
    error:
      typeof record.error === 'string'
        ? record.error
        : 'Premium media access could not be verified.',
    upgradeRequired: Boolean(record.upgradeRequired),
    reason: record.reason,
    licenseStartsAt: record.licenseStartsAt ?? null,
    licenseExpiresAt: record.licenseExpiresAt ?? null,
  }
}

export type BillingCallbackState =
  | {
      kind: 'verifying'
      reference: string | null
    }
  | {
      kind: 'succeeded'
      reference: string
      planName: string | null
      currentPeriodEnd: string | null
      alreadyProcessed: boolean
    }
  | {
      kind: 'settled_inactive'
      reference: string
      message: string
    }
  | {
      kind: 'cancelled'
      reference: string | null
      message: string
    }
  | {
      kind: 'pending'
      reference: string
      message: string
    }
  | {
      kind: 'unauthenticated'
      reference: string
      message: string
    }
  | {
      kind: 'failed'
      reference: string | null
      message: string
      retryable: boolean
    }

export async function resolveBillingCallbackState(
  search: string,
  verifyFn: (reference: string) => Promise<VerifyCheckoutResponse> = (ref) =>
    verifyCheckoutPayment(ref),
): Promise<BillingCallbackState> {
  const parsed = parseBillingCallbackSearch(search)

  if (!parsed.reference) {
    if (parsed.cancelled) {
      return {
        kind: 'cancelled',
        reference: null,
        message:
          'Your checkout was cancelled before payment was completed. No subscription charge was confirmed.',
      }
    }

    return {
      kind: 'failed',
      reference: null,
      message:
        parsed.errorDescription ||
        'No payment reference was found in this callback URL.',
      retryable: false,
    }
  }

  try {
    const result = await verifyFn(parsed.reference)

    if (result.status === 'succeeded') {
      if (result.hasActivePremium) {
        return {
          kind: 'succeeded',
          reference: result.reference,
          planName: result.subscription?.planName ?? 'SPORTIVRA Premium',
          currentPeriodEnd: result.subscription?.currentPeriodEnd ?? null,
          alreadyProcessed: result.alreadyProcessed,
        }
      }

      return {
        kind: 'settled_inactive',
        reference: result.reference,
        message:
          'Payment was recorded, but your subscription is not currently active. Check your account billing history for details.',
      }
    }

    if (result.status === 'pending') {
      if (parsed.cancelled) {
        return {
          kind: 'cancelled',
          reference: result.reference,
          message:
            'Checkout was cancelled before payment completed. No Premium access was granted.',
        }
      }

      return {
        kind: 'pending',
        reference: result.reference,
        message:
          'Paystack has not finalized confirmation yet. Click "Check status again" shortly — Premium access activates automatically once verified.',
      }
    }

    if (result.status === 'refunded') {
      return {
        kind: 'failed',
        reference: result.reference,
        message:
          'This payment has been refunded and does not grant Premium access.',
        retryable: false,
      }
    }

    if (parsed.cancelled) {
      return {
        kind: 'cancelled',
        reference: result.reference,
        message:
          'Checkout was cancelled or abandoned before completion. You have not been subscribed.',
      }
    }

    return {
      kind: 'failed',
      reference: result.reference,
      message:
        'Paystack reported that this payment did not succeed. No Premium access was granted.',
      retryable: false,
    }
  } catch (err) {
    if (err instanceof BillingClientError) {
      if (err.statusCode === 401 || err.code === 'UNAUTHENTICATED') {
        return {
          kind: 'unauthenticated',
          reference: parsed.reference,
          message:
            'Sign in to your SPORTIVRA account to verify and link this payment.',
        }
      }

      if (parsed.cancelled) {
        return {
          kind: 'cancelled',
          reference: parsed.reference,
          message:
            'Checkout was cancelled before completion. No Premium access was granted.',
        }
      }

      return {
        kind: 'failed',
        reference: parsed.reference,
        message: err.message,
        retryable: err.statusCode >= 500 || err.statusCode === 502,
      }
    }

    return {
      kind: 'failed',
      reference: parsed.reference,
      message:
        err instanceof Error
          ? err.message
          : 'Unable to verify your payment right now.',
      retryable: true,
    }
  }
}
