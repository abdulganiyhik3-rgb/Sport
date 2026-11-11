'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import {
  resolveBillingCallbackState,
  type BillingCallbackState,
} from '@/lib/billing/client'
import { formatArticleDate } from '@/lib/sportivra/data'

export default function BillingCallbackPage() {
  const [state, setState] = useState<BillingCallbackState>({
    kind: 'verifying',
    reference: null,
  })

  const runVerification = useCallback(async () => {
    setState((prev) => ({
      kind: 'verifying',
      reference: 'reference' in prev ? prev.reference : null,
    }))
    const nextState = await resolveBillingCallbackState(window.location.search)
    setState(nextState)
  }, [])

  useEffect(() => {
    void runVerification()
  }, [runVerification])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fa] px-5 text-[#0b1220] dark:bg-[#0b1220] dark:text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg dark:border-white/15 dark:bg-[#0e1727] dark:shadow-none">
        <div className="mx-auto mb-6 flex items-center justify-center gap-2.5">
          <span className="brand-mark">S</span>
          <span className="text-[18px] font-black tracking-[0.18em] text-[#0b1220] dark:text-white">
            SPORTIVRA
          </span>
        </div>

        {state.kind === 'verifying' && (
          <div className="space-y-4">
            <Loader2
              size={30}
              className="mx-auto animate-spin text-[#0f7a06] dark:text-[#39ff14]"
            />
            <h1 className="text-xl font-bold">Verifying your payment</h1>
            <p className="text-sm text-slate-600 dark:text-white/60">
              Confirming payment status directly with Paystack...
            </p>
          </div>
        )}

        {state.kind === 'succeeded' && (
          <div className="space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-[#0f7a06] dark:bg-[#39ff14]/15 dark:text-[#39ff14]">
              <CheckCircle2 size={26} />
            </div>
            <h1 className="text-xl font-bold">
              SPORTIVRA Premium activated
            </h1>
            <p className="text-sm text-slate-600 dark:text-white/70">
              Your <span className="font-semibold">{state.planName}</span>{' '}
              subscription has been verified.
              {state.currentPeriodEnd
                ? ` Active until ${formatArticleDate(state.currentPeriodEnd)}.`
                : ''}
            </p>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500 dark:border-white/10 dark:bg-[#0b1220] dark:text-white/50">
              Ref: {state.reference}
            </p>
            <div className="flex flex-col gap-2.5 pt-2">
              <a
                href="/?billing=verified"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] transition hover:bg-[#5cff3d] dark:hover:bg-[#a8ff9d]"
              >
                Return to SPORTIVRA <ArrowRight size={15} />
              </a>
              <a
                href="/?account=subscription"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-6 text-xs font-bold text-[#0b1220] transition hover:border-[#0f7a06] dark:border-white/15 dark:text-white dark:hover:border-[#39ff14]"
              >
                Manage subscription
              </a>
            </div>
          </div>
        )}

        {state.kind === 'settled_inactive' && (
          <div className="space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <ShieldAlert size={24} />
            </div>
            <h1 className="text-xl font-bold">Subscription not active</h1>
            <p className="text-sm text-slate-600 dark:text-white/65">
              {state.message}
            </p>
            <div className="flex flex-col gap-2.5 pt-2">
              <a
                href="/?account=subscription"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] transition hover:bg-[#5cff3d]"
              >
                View account billing
              </a>
              <a
                href="/"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-6 text-xs font-bold text-[#0b1220] dark:border-white/15 dark:text-white"
              >
                Return to SPORTIVRA
              </a>
            </div>
          </div>
        )}

        {state.kind === 'pending' && (
          <div className="space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <Clock3 size={24} />
            </div>
            <h1 className="text-xl font-bold">Payment confirmation pending</h1>
            <p className="text-sm text-slate-600 dark:text-white/65">
              {state.message}
            </p>
            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => void runVerification()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] transition hover:bg-[#5cff3d]"
              >
                <RefreshCw size={15} /> Check status again
              </button>
              <a
                href="/"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-6 text-xs font-bold text-[#0b1220] dark:border-white/15 dark:text-white"
              >
                Return to SPORTIVRA
              </a>
            </div>
          </div>
        )}

        {state.kind === 'cancelled' && (
          <div className="space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/75">
              <XCircle size={24} />
            </div>
            <h1 className="text-xl font-bold">Payment cancelled</h1>
            <p className="text-sm text-slate-600 dark:text-white/65">
              {state.message}
            </p>
            <div className="flex flex-col gap-2.5 pt-2">
              <a
                href="/#pricing"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] transition hover:bg-[#5cff3d]"
              >
                Back to membership plans
              </a>
              <a
                href="/"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-6 text-xs font-bold text-[#0b1220] dark:border-white/15 dark:text-white"
              >
                Return to SPORTIVRA
              </a>
            </div>
          </div>
        )}

        {state.kind === 'unauthenticated' && (
          <div className="space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <ShieldAlert size={24} />
            </div>
            <h1 className="text-xl font-bold">Sign in to verify payment</h1>
            <p className="text-sm text-slate-600 dark:text-white/65">
              {state.message}
            </p>
            <div className="flex flex-col gap-2.5 pt-2">
              <a
                href={`/?verify_ref=${encodeURIComponent(state.reference)}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] transition hover:bg-[#5cff3d]"
              >
                Sign in &amp; verify <ArrowRight size={15} />
              </a>
              <a
                href="/"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-6 text-xs font-bold text-[#0b1220] dark:border-white/15 dark:text-white"
              >
                Return to SPORTIVRA
              </a>
            </div>
          </div>
        )}

        {state.kind === 'failed' && (
          <div className="space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#ff3b45]/15 text-[#c81e28] dark:text-[#ff8b91]">
              <ShieldAlert size={24} />
            </div>
            <h1 className="text-xl font-bold">
              Payment could not be verified
            </h1>
            <p className="text-sm text-slate-600 dark:text-white/65">
              {state.message}
            </p>
            <div className="flex flex-col gap-2.5 pt-2">
              {state.retryable && state.reference && (
                <button
                  type="button"
                  onClick={() => void runVerification()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] transition hover:bg-[#5cff3d]"
                >
                  <RefreshCw size={15} /> Retry verification
                </button>
              )}
              <a
                href="/#pricing"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-6 text-xs font-bold text-[#0b1220] hover:border-[#0f7a06] dark:border-white/15 dark:text-white dark:hover:border-[#39ff14]"
              >
                Back to membership plans
              </a>
              <a
                href="/"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-transparent px-6 text-xs font-semibold text-slate-600 hover:text-[#0b1220] dark:text-white/60 dark:hover:text-white"
              >
                Return to SPORTIVRA
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
