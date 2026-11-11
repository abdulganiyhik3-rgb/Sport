import type { AdminSupabaseClient } from '@/lib/supabase/admin'
import type {
  AccessTier,
  BillingInterval,
  Json,
  SubscriptionPlanRow,
  SubscriptionStatus,
} from '@/lib/supabase/types'

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/billing/access.ts must only be imported in server-side modules.',
  )
}

export interface EntitlementSnapshot {
  status: SubscriptionStatus
  planTier: AccessTier
  currentPeriodEnd: string | null
  endedAt: string | null
}

function asJsonRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export function extractPaystackPlanRef(
  plan: Pick<SubscriptionPlanRow, 'provider' | 'provider_plan_refs'>,
): string | null {
  const refs = asJsonRecord(plan.provider_plan_refs)
  const candidates = [refs.paystack, refs.plan_code]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return null
}

export function isPlanCheckoutReady(
  plan: Pick<
    SubscriptionPlanRow,
    | 'is_active'
    | 'tier'
    | 'billing_interval'
    | 'amount_minor'
    | 'currency'
    | 'provider'
    | 'provider_plan_refs'
  >,
): boolean {
  if (!plan.is_active) return false
  if (plan.tier !== 'premium') return false
  if (plan.billing_interval !== 'month' && plan.billing_interval !== 'year') {
    return false
  }
  if (
    typeof plan.amount_minor !== 'number' ||
    !Number.isInteger(plan.amount_minor) ||
    plan.amount_minor <= 0
  ) {
    return false
  }
  if (
    typeof plan.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(plan.currency.trim())
  ) {
    return false
  }
  if (!extractPaystackPlanRef(plan)) {
    return false
  }
  return true
}

export function isSubscriptionEntitled(
  snapshot: EntitlementSnapshot,
  now: Date = new Date(),
): boolean {
  if (snapshot.planTier !== 'premium') return false

  const nowMs = now.getTime()
  const periodEndMs = snapshot.currentPeriodEnd
    ? Date.parse(snapshot.currentPeriodEnd)
    : null

  if (snapshot.status === 'active') {
    if (periodEndMs === null) return true
    return Number.isFinite(periodEndMs) && periodEndMs > nowMs
  }

  if (snapshot.status === 'cancelled') {
    if (snapshot.endedAt !== null) return false
    if (periodEndMs === null) return false
    return Number.isFinite(periodEndMs) && periodEndMs > nowMs
  }

  if (snapshot.status === 'past_due') {
    if (periodEndMs === null) return false
    return Number.isFinite(periodEndMs) && periodEndMs > nowMs
  }

  return false
}

export function calculatePeriodEnd(
  periodStart: Date,
  billingInterval: Exclude<BillingInterval, 'none'>,
): Date {
  const year = periodStart.getUTCFullYear()
  const month = periodStart.getUTCMonth()
  const day = periodStart.getUTCDate()
  const hours = periodStart.getUTCHours()
  const minutes = periodStart.getUTCMinutes()
  const seconds = periodStart.getUTCSeconds()
  const ms = periodStart.getUTCMilliseconds()

  const targetYear = billingInterval === 'year' ? year + 1 : year
  const targetMonth = billingInterval === 'month' ? month + 1 : month

  const normalized = new Date(Date.UTC(targetYear, targetMonth, 1))
  const lastDayOfTargetMonth = new Date(
    Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth() + 1, 0),
  ).getUTCDate()

  const clampedDay = Math.min(day, lastDayOfTargetMonth)

  return new Date(
    Date.UTC(
      normalized.getUTCFullYear(),
      normalized.getUTCMonth(),
      clampedDay,
      hours,
      minutes,
      seconds,
      ms,
    ),
  )
}

export async function hasActivePremiumAccess(
  admin: AdminSupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!userId) return false

  const { data, error } = await admin.rpc('has_active_premium_access', {
    p_user_id: userId,
  })

  if (error) {
    throw new Error(
      `Failed to verify premium entitlement: ${error.message}`,
    )
  }

  return data === true
}
