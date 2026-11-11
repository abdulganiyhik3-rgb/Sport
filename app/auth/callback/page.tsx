'use client'

import { useEffect, useState } from 'react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { Loader2, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function completeAuth() {
      const supabase = createClient()
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const tokenHash = params.get('token_hash')
      const type = params.get('type') as EmailOtpType | null
      const isRecoveryParam = params.get('recovery') === '1' || type === 'recovery'
      const urlError =
        params.get('error_description') || params.get('error')
      const nextParam = params.get('next') ?? '/'
      const safeNext = nextParam.startsWith('/') ? nextParam : '/'

      if (urlError) {
        if (!cancelled) setErrorMsg(urlError)
        return
      }

      let isRecovery = isRecoveryParam

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            if (!cancelled) setErrorMsg(error.message)
            return
          }
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash: tokenHash,
          })
          if (error) {
            if (!cancelled) setErrorMsg(error.message)
            return
          }
        } else if (window.location.hash) {
          const hashParams = new URLSearchParams(
            window.location.hash.slice(1),
          )
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')
          const hashType = hashParams.get('type')
          if (hashType === 'recovery') isRecovery = true
          const hashError =
            hashParams.get('error_description') || hashParams.get('error')

          if (hashError) {
            if (!cancelled) setErrorMsg(hashError)
            return
          }

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            if (error) {
              if (!cancelled) setErrorMsg(error.message)
              return
            }
          }
        }

        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          await supabase.from('profiles').upsert(
            {
              id: user.id,
              email: user.email ?? null,
              full_name:
                typeof user.user_metadata?.full_name === 'string' &&
                user.user_metadata.full_name.trim()
                  ? user.user_metadata.full_name.trim()
                  : null,
            },
            { onConflict: 'id', ignoreDuplicates: true },
          )
        }

        if (!cancelled) {
          const sep = safeNext.includes('?') ? '&' : '?'
          const query = isRecovery ? 'recovery=1' : 'confirmed=1'
          window.location.replace(`${safeNext}${sep}${query}`)
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Could not complete email verification.',
          )
        }
      }
    }

    void completeAuth()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fa] px-5 text-[#0b1220] dark:bg-[#0b1220] dark:text-white">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg dark:border-white/15 dark:bg-[#0e1727] dark:shadow-none">
        <div className="mx-auto mb-5 flex items-center justify-center gap-2.5">
          <span className="brand-mark">S</span>
          <span className="text-[18px] font-black tracking-[0.18em] text-[#0b1220] dark:text-white">
            SPORTIVRA
          </span>
        </div>

        {errorMsg ? (
          <div className="space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#ff3b45]/15 text-[#c81e28] dark:text-[#ff8b91]">
              <ShieldAlert size={22} />
            </div>
            <h1 className="text-xl font-bold">
              Verification could not be completed
            </h1>
            <p className="text-sm text-slate-600 dark:text-white/65">
              {errorMsg}
            </p>
            <a
              href="/"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] hover:bg-[#5cff3d]"
            >
              Return to SPORTIVRA
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <Loader2
              size={28}
              className="mx-auto animate-spin text-[#0f7a06] dark:text-[#39ff14]"
            />
            <h1 className="text-xl font-bold">Verifying your account</h1>
            <p className="text-sm text-slate-600 dark:text-white/60">
              Completing your account verification...
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
