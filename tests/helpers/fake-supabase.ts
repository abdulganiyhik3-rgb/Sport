import crypto from 'node:crypto'
import type { AdminSupabaseClient } from '@/lib/supabase/admin'
import type { MembershipStatus, MembershipTier } from '@/lib/supabase/types'
import type {
  PaymentTransactionRow,
  ProfileRow,
  SubscriptionPlanRow,
  SubscriptionProviderTokenRowPlaceholder,
  SubscriptionRow,
  WebhookEventRow,
} from './types-shim'

type TableName =
  | 'profiles'
  | 'subscription_plans'
  | 'subscriptions'
  | 'subscription_provider_tokens'
  | 'payment_transactions'
  | 'webhook_events'

export interface FakeDbState {
  profiles: ProfileRow[]
  subscription_plans: SubscriptionPlanRow[]
  subscriptions: SubscriptionRow[]
  subscription_provider_tokens: SubscriptionProviderTokenRowPlaceholder[]
  payment_transactions: PaymentTransactionRow[]
  webhook_events: WebhookEventRow[]
}

function parseGraceMs(graceInterval: string): number {
  const clean = graceInterval.trim().toLowerCase()
  if (clean === '0 seconds' || clean === '0s') return 0
  const m = /^(\d+)\s+(hour|hours|day|days|second|seconds)$/.exec(clean)
  if (!m) throw new Error(`Invalid grace interval: ${graceInterval}`)
  const qty = Number(m[1])
  const unit = m[2]
  if (unit.startsWith('second')) return qty * 1000
  if (unit.startsWith('hour')) return qty * 3600 * 1000
  if (unit.startsWith('day')) return qty * 86400 * 1000
  return 0
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createFakeAdminClient(initial?: Partial<FakeDbState>): {
  admin: AdminSupabaseClient
  state: FakeDbState
} {
  const state: FakeDbState = {
    profiles: clone(initial?.profiles ?? []),
    subscription_plans: clone(initial?.subscription_plans ?? []),
    subscriptions: clone(initial?.subscriptions ?? []),
    subscription_provider_tokens: clone(
      initial?.subscription_provider_tokens ?? [],
    ),
    payment_transactions: clone(initial?.payment_transactions ?? []),
    webhook_events: clone(initial?.webhook_events ?? []),
  }

  function syncProfilesForUser(userId: string) {
    const profile = state.profiles.find((p) => p.id === userId)
    if (!profile) return

    const userSubs = state.subscriptions.filter((s) => s.user_id === userId)
    if (userSubs.length === 0) {
      profile.membership_tier = 'free'
      profile.membership_status = 'active'
      profile.subscription_expires_at = null
      return
    }

    const nowMs = Date.now()
    const rank = (s: SubscriptionRow) => {
      const endMs = s.current_period_end ? Date.parse(s.current_period_end) : null
      if (s.status === 'active' && (endMs === null || endMs > nowMs)) return 0
      if (
        s.status === 'cancelled' &&
        s.ended_at === null &&
        endMs !== null &&
        endMs > nowMs
      ) {
        return 1
      }
      if (s.status === 'past_due' && endMs !== null && endMs > nowMs) return 2
      if (s.status === 'active') return 3
      if (s.status === 'past_due') return 4
      if (s.status === 'cancelled') return 5
      if (s.status === 'incomplete') return 6
      return 7
    }

    const sorted = [...userSubs].sort((a, b) => {
      const ra = rank(a)
      const rb = rank(b)
      if (ra !== rb) return ra - rb
      const ea = a.current_period_end ? Date.parse(a.current_period_end) : 0
      const eb = b.current_period_end ? Date.parse(b.current_period_end) : 0
      if (ea !== eb) return eb - ea
      return Date.parse(b.updated_at) - Date.parse(a.updated_at)
    })

    const sub = sorted[0]
    const plan = state.subscription_plans.find((p) => p.id === sub.plan_id)
    const planTier: MembershipTier = plan?.tier ?? 'free'
    const endMs = sub.current_period_end ? Date.parse(sub.current_period_end) : null

    let nextTier: MembershipTier = 'free'
    let nextStatus: MembershipStatus = 'active'
    let nextExpires: string | null = null

    if (sub.status === 'active') {
      if (endMs === null || endMs > nowMs) {
        nextTier = planTier
        nextStatus = 'active'
        nextExpires = sub.current_period_end
      } else {
        nextTier = 'free'
        nextStatus = 'expired'
        nextExpires = sub.current_period_end
      }
    } else if (sub.status === 'past_due') {
      nextStatus = 'past_due'
      nextExpires = sub.current_period_end
      nextTier = endMs !== null && endMs > nowMs ? planTier : 'free'
    } else if (sub.status === 'cancelled') {
      nextStatus = 'cancelled'
      if (sub.ended_at === null && endMs !== null && endMs > nowMs) {
        nextTier = planTier
        nextExpires = sub.current_period_end
      } else {
        nextTier = 'free'
        nextExpires = sub.ended_at ?? sub.current_period_end
      }
    } else if (sub.status === 'expired') {
      nextTier = 'free'
      nextStatus = 'expired'
      nextExpires = sub.ended_at ?? sub.current_period_end
    } else {
      nextTier = 'free'
      nextStatus = sub.status
      nextExpires = null
    }

    profile.membership_tier = nextTier
    profile.membership_status = nextStatus
    profile.subscription_expires_at = nextExpires
    profile.updated_at = new Date().toISOString()
  }

  function validateAndInsert(table: TableName, rawRow: Record<string, unknown>) {
    const nowIso = new Date().toISOString()
    const row = {
      id: rawRow.id ?? crypto.randomUUID(),
      created_at: rawRow.created_at ?? nowIso,
      updated_at: rawRow.updated_at ?? nowIso,
      ...clone(rawRow),
    } as Record<string, unknown>

    if (table === 'payment_transactions') {
      const txRef =
        typeof row.provider_transaction_ref === 'string'
          ? row.provider_transaction_ref.trim()
          : ''
      const chkRef =
        typeof row.provider_checkout_ref === 'string'
          ? row.provider_checkout_ref.trim()
          : ''
      if (!txRef && !chkRef) {
        return {
          error: {
            code: '23514',
            message: 'violates check constraint payment_transactions_ref_present_check',
          },
          row: null,
        }
      }
      if (
        row.provider_transaction_ref !== null &&
        row.provider_transaction_ref !== undefined &&
        state.payment_transactions.some(
          (t) =>
            t.provider === row.provider &&
            t.provider_transaction_ref === row.provider_transaction_ref,
        )
      ) {
        return {
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint idx_payment_transactions_provider_ref_unique',
          },
          row: null,
        }
      }
      if (
        row.provider_checkout_ref !== null &&
        row.provider_checkout_ref !== undefined &&
        state.payment_transactions.some(
          (t) =>
            t.provider === row.provider &&
            t.provider_checkout_ref === row.provider_checkout_ref,
        )
      ) {
        return {
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint idx_payment_transactions_provider_checkout_ref_unique',
          },
          row: null,
        }
      }
      const fullTx: PaymentTransactionRow = {
        subscription_id: null,
        plan_id: null,
        provider_transaction_ref: null,
        provider_checkout_ref: null,
        provider_invoice_ref: null,
        expected_amount_minor: null,
        expected_currency: null,
        payment_channel: null,
        paid_at: null,
        metadata: {},
        ...row,
      } as PaymentTransactionRow
      state.payment_transactions.push(fullTx)
      return { error: null, row: clone(fullTx) }
    }

    if (table === 'subscriptions') {
      if (
        (row.status === 'active' || row.status === 'past_due') &&
        state.subscriptions.some(
          (s) =>
            s.user_id === row.user_id &&
            (s.status === 'active' || s.status === 'past_due'),
        )
      ) {
        return {
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint idx_subscriptions_one_open_per_user',
          },
          row: null,
        }
      }
      if (
        row.provider_subscription_ref !== null &&
        row.provider_subscription_ref !== undefined &&
        state.subscriptions.some(
          (s) =>
            s.provider === row.provider &&
            s.provider_subscription_ref === row.provider_subscription_ref,
        )
      ) {
        return {
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint idx_subscriptions_provider_sub_ref_unique',
          },
          row: null,
        }
      }
      const fullSub: SubscriptionRow = {
        provider_customer_ref: null,
        provider_subscription_ref: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        cancelled_at: null,
        ended_at: null,
        metadata: {},
        ...row,
      } as SubscriptionRow
      state.subscriptions.push(fullSub)
      syncProfilesForUser(fullSub.user_id)
      return { error: null, row: clone(fullSub) }
    }

    if (table === 'webhook_events') {
      if (
        row.signature_verified !== true &&
        row.processing_status !== 'received' &&
        row.processing_status !== 'failed'
      ) {
        return {
          error: {
            code: '23514',
            message:
              'violates check constraint webhook_events_verified_before_processing_check',
          },
          row: null,
        }
      }
      if (
        state.webhook_events.some(
          (w) =>
            w.provider === row.provider &&
            w.provider_event_id === row.provider_event_id,
        )
      ) {
        return {
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint idx_webhook_events_provider_event_unique',
          },
          row: null,
        }
      }
      const fullWebhook: WebhookEventRow = {
        signature_verified: false,
        payload_hash: null,
        processing_status: 'received',
        retry_count: 0,
        error_message: null,
        received_at: nowIso,
        processed_at: null,
        ...row,
      } as WebhookEventRow
      state.webhook_events.push(fullWebhook)
      return { error: null, row: clone(fullWebhook) }
    }

    if (table === 'subscription_provider_tokens') {
      const idx = state.subscription_provider_tokens.findIndex(
        (t) => t.subscription_id === row.subscription_id,
      )
      const fullToken: SubscriptionProviderTokenRowPlaceholder = {
        email_token: null,
        authorization_code: null,
        management_url: null,
        token_metadata: {},
        created_at: nowIso,
        updated_at: nowIso,
        ...row,
      } as SubscriptionProviderTokenRowPlaceholder
      if (idx >= 0) {
        state.subscription_provider_tokens[idx] = fullToken
      } else {
        state.subscription_provider_tokens.push(fullToken)
      }
      return { error: null, row: clone(fullToken) }
    }

    return { error: null, row }
  }

  function makeQueryBuilder(table: TableName) {
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
    let payload: Record<string, unknown> = {}
    const filters: Array<(row: Record<string, unknown>) => boolean> = []
    let sortCol: string | null = null
    let sortAsc = true
    let limitNum: number | null = null
    let expectSingle: 'none' | 'single' | 'maybeSingle' = 'none'
    let returnSelected = false

    const builder: Record<string, unknown> = {
      select(_cols?: string) {
        returnSelected = true
        return builder
      },
      insert(values: Record<string, unknown>) {
        op = 'insert'
        payload = values
        return builder
      },
      update(values: Record<string, unknown>) {
        op = 'update'
        payload = values
        return builder
      },
      upsert(values: Record<string, unknown>) {
        op = 'upsert'
        payload = values
        return builder
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val)
        return builder
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]))
        return builder
      },
      is(col: string, val: unknown) {
        filters.push((r) => (r[col] ?? null) === val)
        return builder
      },
      contains(col: string, obj: Record<string, unknown>) {
        filters.push((r) => {
          const v = r[col] as Record<string, unknown> | null
          if (!v || typeof v !== 'object') return false
          return Object.entries(obj).every(([k, expected]) => v[k] === expected)
        })
        return builder
      },
      order(col: string, opts?: { ascending?: boolean }) {
        sortCol = col
        sortAsc = opts?.ascending ?? true
        return builder
      },
      limit(n: number) {
        limitNum = n
        return builder
      },
      single() {
        expectSingle = 'single'
        return execute()
      },
      maybeSingle() {
        expectSingle = 'maybeSingle'
        return execute()
      },
      then(
        onFulfilled?: (val: unknown) => unknown,
        onRejected?: (err: unknown) => unknown,
      ) {
        return execute().then(onFulfilled, onRejected)
      },
    }

    async function execute(): Promise<{
      data: unknown
      error: { code?: string; message: string } | null
    }> {
      const list = state[table] as unknown as Array<Record<string, unknown>>

      if (op === 'insert' || op === 'upsert') {
        const res = validateAndInsert(table, payload)
        if (res.error) {
          return { data: null, error: res.error }
        }
        if (expectSingle === 'single' || expectSingle === 'maybeSingle') {
          return { data: res.row, error: null }
        }
        return { data: returnSelected ? [res.row] : null, error: null }
      }

      const matched = list.filter((r) => filters.every((fn) => fn(r)))

      if (op === 'update') {
        const updatedRows: Array<Record<string, unknown>> = []
        for (const row of matched) {
          if (table === 'payment_transactions') {
            const nextTxRef =
              payload.provider_transaction_ref !== undefined
                ? payload.provider_transaction_ref
                : row.provider_transaction_ref
            if (
              nextTxRef !== null &&
              nextTxRef !== undefined &&
              state.payment_transactions.some(
                (other) =>
                  other.id !== row.id &&
                  other.provider === row.provider &&
                  other.provider_transaction_ref === nextTxRef,
              )
            ) {
              return {
                data: null,
                error: {
                  code: '23505',
                  message:
                    'duplicate key value violates unique constraint idx_payment_transactions_provider_ref_unique',
                },
              }
            }
          }
          if (table === 'webhook_events') {
            const nextSig =
              payload.signature_verified !== undefined
                ? payload.signature_verified
                : row.signature_verified
            const nextStatus =
              payload.processing_status !== undefined
                ? payload.processing_status
                : row.processing_status
            if (
              nextSig !== true &&
              nextStatus !== 'received' &&
              nextStatus !== 'failed'
            ) {
              return {
                data: null,
                error: {
                  code: '23514',
                  message:
                    'violates check constraint webhook_events_verified_before_processing_check',
                },
              }
            }
          }

          Object.assign(row, clone(payload), {
            updated_at: new Date().toISOString(),
          })
          if (table === 'subscriptions') {
            syncProfilesForUser(String(row.user_id))
          }
          updatedRows.push(clone(row))
        }

        if (expectSingle === 'single') {
          if (updatedRows.length !== 1) {
            return {
              data: null,
              error: { code: 'PGRST116', message: 'Row not found' },
            }
          }
          return { data: updatedRows[0], error: null }
        }
        if (expectSingle === 'maybeSingle') {
          return { data: updatedRows[0] ?? null, error: null }
        }
        return { data: returnSelected ? updatedRows : null, error: null }
      }

      // SELECT
      let rows = matched.map((r) => clone(r))
      if (sortCol) {
        const col = sortCol
        rows.sort((a, b) => {
          const av = a[col]
          const bv = b[col]
          if (av === bv) return 0
          if (av === undefined || av === null) return sortAsc ? 1 : -1
          if (bv === undefined || bv === null) return sortAsc ? -1 : 1
          return av < bv ? (sortAsc ? -1 : 1) : sortAsc ? 1 : -1
        })
      }
      if (limitNum !== null) {
        rows = rows.slice(0, limitNum)
      }

      if (expectSingle === 'single') {
        if (rows.length !== 1) {
          return {
            data: null,
            error: { code: 'PGRST116', message: 'Expected single row' },
          }
        }
        return { data: rows[0], error: null }
      }
      if (expectSingle === 'maybeSingle') {
        return { data: rows[0] ?? null, error: null }
      }
      return { data: rows, error: null }
    }

    return builder
  }

  const fakeAdmin = {
    from(table: TableName) {
      return makeQueryBuilder(table)
    },
    async rpc(fnName: string, args: Record<string, unknown> = {}) {
      if (fnName === 'has_active_premium_access') {
        const userId = String(args.p_user_id || '')
        const nowMs = Date.now()
        const active = state.subscriptions.some((s) => {
          if (s.user_id !== userId) return false
          const plan = state.subscription_plans.find((p) => p.id === s.plan_id)
          if (!plan || plan.tier !== 'premium') return false
          const endMs = s.current_period_end
            ? Date.parse(s.current_period_end)
            : null
          if (s.status === 'active') {
            return endMs === null || endMs > nowMs
          }
          if (s.status === 'cancelled') {
            return s.ended_at === null && endMs !== null && endMs > nowMs
          }
          if (s.status === 'past_due') {
            return endMs !== null && endMs > nowMs
          }
          return false
        })
        return { data: active, error: null }
      }

      if (fnName === 'expire_overdue_subscriptions') {
        const graceMs = parseGraceMs(
          String(args.p_grace_interval || '0 seconds'),
        )
        const nowMs = Date.now()
        let count = 0
        for (const sub of state.subscriptions) {
          if (!sub.current_period_end) continue
          const endMs = Date.parse(sub.current_period_end)
          const shouldExpire =
            (sub.status === 'active' &&
              sub.cancel_at_period_end === true &&
              endMs <= nowMs) ||
            (sub.status === 'active' &&
              sub.cancel_at_period_end === false &&
              endMs + graceMs <= nowMs) ||
            (sub.status === 'past_due' && endMs + graceMs <= nowMs) ||
            (sub.status === 'cancelled' &&
              sub.ended_at === null &&
              endMs <= nowMs)

          if (shouldExpire) {
            sub.status = 'expired'
            sub.ended_at =
              sub.ended_at ?? sub.current_period_end ?? new Date().toISOString()
            sub.updated_at = new Date().toISOString()
            syncProfilesForUser(sub.user_id)
            count += 1
          }
        }
        return { data: count, error: null }
      }

      return {
        data: null,
        error: { message: `Unknown RPC ${fnName}` },
      }
    },
  }

  return {
    admin: fakeAdmin as unknown as AdminSupabaseClient,
    state,
  }
}
