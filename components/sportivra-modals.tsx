'use client'

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import {
  AlertCircle,
  Bell,
  Check,
  ChevronRight,
  CirclePlay,
  Clock3,
  Film,
  KeyRound,
  LogOut,
  MailCheck,
  Play,
  ShieldCheck,
  Trophy,
  User as UserIcon,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type {
  HighlightRow,
  MatchRow,
  NewsArticleRow,
  ProfileRow,
  SportRow,
} from '@/lib/supabase/types'
import {
  formatArticleDate,
  formatMatchDayLabel,
  formatUtcTime,
} from '@/lib/sportivra/data'

function formatAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Email sending rate limit reached (Supabase built-in mail allows 2 emails/hour without custom SMTP). Please wait a few minutes or configure custom SMTP in Supabase.'
  }
  return message
}

function ModalShell({
  onClose,
  title,
  eyebrow,
  maxWidth = 'max-w-2xl',
  children,
}: {
  onClose: () => void
  title: string
  eyebrow?: string
  maxWidth?: string
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`relative max-h-[90vh] w-full ${maxWidth} overflow-y-auto rounded-2xl border border-white/15 bg-[#0e1727] p-6 text-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            {eyebrow && (
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#39ff14]">
                {eyebrow}
              </p>
            )}
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/8 text-white/75 transition hover:bg-white/15 hover:text-white"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function AuthAccountModal({
  initialMode,
  user,
  profile,
  sports,
  remindedMatches,
  pendingReminderMessage,
  onClose,
  onAuthSuccess,
  onProfileUpdated,
  onRemoveReminder,
  onSignedOut,
}: {
  initialMode: 'signin' | 'signup' | 'account' | 'forgot' | 'recovery'
  user: { id: string; email: string | null } | null
  profile: ProfileRow | null
  sports: SportRow[]
  remindedMatches: MatchRow[]
  pendingReminderMessage?: string | null
  onClose: () => void
  onAuthSuccess: () => Promise<void>
  onProfileUpdated: (profile: ProfileRow) => void
  onRemoveReminder: (matchId: string) => Promise<void>
  onSignedOut: () => void
}) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'recovery'>(
    initialMode === 'signup'
      ? 'signup'
      : initialMode === 'forgot'
        ? 'forgot'
        : initialMode === 'recovery'
          ? 'recovery'
          : 'signin',
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [signupTier, setSignupTier] = useState<'free' | 'pro'>('free')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [infoMsg, setInfoMsg] = useState<string | null>(null)
  const [needsConfirmationEmail, setNeedsConfirmationEmail] = useState<
    string | null
  >(null)

  // Account edit states
  const [editName, setEditName] = useState(profile?.full_name ?? '')
  const [editFavSport, setEditFavSport] = useState(
    profile?.favorite_sport_id ?? '',
  )
  const [editTier, setEditTier] = useState<'free' | 'pro'>(
    profile?.membership_tier ?? 'free',
  )

  useEffect(() => {
    setEditName(profile?.full_name ?? '')
    setEditFavSport(profile?.favorite_sport_id ?? '')
    setEditTier(profile?.membership_tier ?? 'free')
  }, [profile])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setInfoMsg(null)
    setNeedsConfirmationEmail(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setNeedsConfirmationEmail(email.trim())
          setErrorMsg(
            'Your email address has not been confirmed yet. Please check your inbox and click the verification link.',
          )
        } else {
          setErrorMsg(formatAuthError(error.message))
        }
        return
      }

      await onAuthSuccess()
      onClose()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setInfoMsg(null)
    setNeedsConfirmationEmail(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const cleanEmail = email.trim()
      const redirectTo = `${window.location.origin}/auth/callback`

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            full_name: fullName.trim() || null,
            membership_tier: signupTier,
          },
        },
      })

      if (error) {
        setErrorMsg(formatAuthError(error.message))
        return
      }

      if (
        data.user &&
        data.user.identities &&
        data.user.identities.length === 0
      ) {
        setErrorMsg(
          'An account with this email already exists. Please sign in instead.',
        )
        return
      }

      if (data.session) {
        await onAuthSuccess()
        onClose()
      } else {
        setNeedsConfirmationEmail(cleanEmail)
        setInfoMsg(
          `Confirmation email sent to ${cleanEmail}. Please open the confirmation link in your inbox before signing in.`,
        )
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to create account.',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setInfoMsg(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const cleanEmail = email.trim()
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/auth/callback?recovery=1`,
      })

      if (error) {
        setErrorMsg(formatAuthError(error.message))
        return
      }

      setInfoMsg(
        `Password reset instructions sent to ${cleanEmail}. Please check your inbox.`,
      )
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to send reset email.',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setInfoMsg(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        setErrorMsg(formatAuthError(error.message))
        return
      }

      setInfoMsg('Your password has been updated.')
      setNewPassword('')
      await onAuthSuccess()
      setTimeout(onClose, 1200)
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to update password.',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleResendConfirmation = async () => {
    const targetEmail = needsConfirmationEmail || email.trim()
    if (!targetEmail) return
    setLoading(true)
    setErrorMsg(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setErrorMsg(formatAuthError(error.message))
      } else {
        setInfoMsg(
          `A new confirmation link was sent to ${targetEmail}. Please check your inbox.`,
        )
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not resend confirmation email.',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setLoading(true)
    setErrorMsg(null)
    setInfoMsg(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            email: user.email,
            full_name: editName.trim() || null,
            favorite_sport_id: editFavSport || null,
            membership_tier: editTier,
            membership_status: 'active',
          },
          { onConflict: 'id' },
        )
        .select('*')
        .single()

      if (error) {
        setErrorMsg(error.message)
        return
      }

      if (data) {
        onProfileUpdated(data)
        setInfoMsg('Your SPORTIVRA profile has been saved.')
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save profile.',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      onSignedOut()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'recovery' && user) {
    return (
      <ModalShell
        onClose={onClose}
        eyebrow="Security"
        title="Set a new password"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-[#ff3b45]/40 bg-[#ff3b45]/10 px-4 py-3 text-xs text-[#ff8b91]">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="rounded-xl border border-[#39ff14]/40 bg-[#39ff14]/10 px-4 py-3 text-xs text-[#a8ff9d]">
              {infoMsg}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-white/70">
              New password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="h-11 w-full rounded-xl border border-white/12 bg-[#0b1220] px-3.5 text-sm text-white outline-none focus:border-[#39ff14]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] transition hover:bg-[#a8ff9d] disabled:opacity-60"
          >
            <KeyRound size={15} />
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </ModalShell>
    )
  }

  if (user) {
    return (
      <ModalShell
        onClose={onClose}
        eyebrow="Member account"
        title={profile?.full_name || user.email || 'SPORTIVRA Member'}
      >
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#39ff14]/15 text-[#39ff14]">
                <UserIcon size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{user.email}</p>
                <p className="text-xs text-white/55">
                  Plan:{' '}
                  <span className="font-bold uppercase text-[#39ff14]">
                    {profile?.membership_tier ?? 'free'}
                  </span>{' '}
                  • Status: {profile?.membership_status ?? 'active'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={loading}
              className="flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs font-semibold text-white/80 transition hover:bg-white/10"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-[#ff3b45]/40 bg-[#ff3b45]/10 px-4 py-3 text-xs text-[#ff8b91]">
              {errorMsg}
            </div>
          )}
          {infoMsg && (
            <div className="rounded-xl border border-[#39ff14]/40 bg-[#39ff14]/10 px-4 py-3 text-xs text-[#a8ff9d]">
              {infoMsg}
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-white/70">
                  Full name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your name"
                  className="h-11 w-full rounded-xl border border-white/12 bg-[#0b1220] px-3.5 text-sm text-white outline-none focus:border-[#39ff14]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-white/70">
                  Favourite sport
                </label>
                <select
                  value={editFavSport}
                  onChange={(e) => setEditFavSport(e.target.value)}
                  className="h-11 w-full rounded-xl border border-white/12 bg-[#0b1220] px-3.5 text-sm text-white outline-none focus:border-[#39ff14]"
                >
                  <option value="">All sports</option>
                  {sports.map((sport) => (
                    <option key={sport.id} value={sport.id}>
                      {sport.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/70">
                Membership tier
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(['free', 'pro'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setEditTier(tier)}
                    className={`rounded-xl border p-3.5 text-left transition ${
                      editTier === tier
                        ? 'border-[#39ff14] bg-[#39ff14]/10'
                        : 'border-white/12 bg-[#0b1220] hover:border-white/25'
                    }`}
                  >
                    <p className="text-sm font-bold uppercase text-white">
                      SPORTIVRA {tier}
                    </p>
                    <p className="mt-1 text-xs text-white/55">
                      {tier === 'free'
                        ? 'Scores, schedule, reminders & news'
                        : 'Full access readiness & ad-free profile'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-11 items-center justify-center rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] transition hover:bg-[#a8ff9d] disabled:opacity-60"
            >
              {loading ? 'Saving...' : 'Save profile'}
            </button>
          </form>

          <div className="border-t border-white/10 pt-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <Bell size={15} className="text-[#39ff14]" /> Your saved match
              reminders ({remindedMatches.length})
            </h3>
            {remindedMatches.length === 0 ? (
              <p className="text-xs text-white/50">
                No match reminders saved yet. Click &ldquo;Remind&rdquo; on any
                upcoming match to save it here.
              </p>
            ) : (
              <div className="space-y-2">
                {remindedMatches.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {m.home_team} vs {m.away_team}
                      </p>
                      <p className="text-xs text-white/50">
                        {m.league} • {formatUtcTime(m.kickoff_at)} UTC
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveReminder(m.id)}
                      className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/75 hover:border-[#ff3b45]/50 hover:text-[#ff8b91]"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell
      onClose={onClose}
      eyebrow="SPORTIVRA Account"
      title={
        mode === 'signin'
          ? 'Sign in to SPORTIVRA'
          : mode === 'signup'
            ? 'Join SPORTIVRA'
            : 'Reset your password'
      }
      maxWidth="max-w-md"
    >
      <div className="space-y-5">
        {pendingReminderMessage && (
          <div className="rounded-xl border border-[#39ff14]/30 bg-[#39ff14]/10 px-4 py-3 text-xs text-[#a8ff9d]">
            {pendingReminderMessage}
          </div>
        )}

        {mode !== 'forgot' && (
          <div className="grid grid-cols-2 rounded-full border border-white/10 bg-[#0b1220] p-1">
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setErrorMsg(null)
                setInfoMsg(null)
              }}
              className={`min-h-10 rounded-full text-xs font-bold transition ${
                mode === 'signin'
                  ? 'bg-[#39ff14] text-[#0b1220]'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup')
                setErrorMsg(null)
                setInfoMsg(null)
              }}
              className={`min-h-10 rounded-full text-xs font-bold transition ${
                mode === 'signup'
                  ? 'bg-[#39ff14] text-[#0b1220]'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              Join now
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl border border-[#ff3b45]/40 bg-[#ff3b45]/10 px-4 py-3 text-xs text-[#ff8b91]">
            <p>{errorMsg}</p>
            {needsConfirmationEmail && (
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={loading}
                className="mt-2 font-bold text-[#39ff14] underline underline-offset-2"
              >
                Resend confirmation email
              </button>
            )}
          </div>
        )}

        {infoMsg && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#39ff14]/40 bg-[#39ff14]/10 px-4 py-3 text-xs text-[#a8ff9d]">
            <MailCheck size={16} className="mt-0.5 shrink-0 text-[#39ff14]" />
            <div>
              <p>{infoMsg}</p>
              {needsConfirmationEmail && (
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={loading}
                  className="mt-2 font-bold text-white underline underline-offset-2"
                >
                  Resend email
                </button>
              )}
            </div>
          </div>
        )}

        {mode === 'forgot' ? (
          <form onSubmit={handleResetRequest} className="space-y-4">
            <p className="text-xs leading-relaxed text-white/60">
              Enter your registered email address and we&apos;ll send a link to
              reset your password.
            </p>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/70">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 w-full rounded-xl border border-white/12 bg-[#0b1220] px-3.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#39ff14]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex min-h-12 w-full items-center justify-center rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] transition hover:bg-[#a8ff9d] disabled:opacity-60"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setErrorMsg(null)
                setInfoMsg(null)
              }}
              className="w-full text-center text-xs font-semibold text-white/60 hover:text-white"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <form
            onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}
            className="space-y-4"
          >
            {mode === 'signup' && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-white/70">
                  Full name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Morgan"
                  className="h-11 w-full rounded-xl border border-white/12 bg-[#0b1220] px-3.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#39ff14]"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/70">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 w-full rounded-xl border border-white/12 bg-[#0b1220] px-3.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#39ff14]"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs font-semibold text-white/70">
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot')
                      setErrorMsg(null)
                      setInfoMsg(null)
                    }}
                    className="text-[11px] font-semibold text-[#39ff14] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="h-11 w-full rounded-xl border border-white/12 bg-[#0b1220] px-3.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#39ff14]"
              />
            </div>

            {mode === 'signup' && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-white/70">
                  Choose plan
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['free', 'pro'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setSignupTier(tier)}
                      className={`rounded-xl border p-3 text-left transition ${
                        signupTier === tier
                          ? 'border-[#39ff14] bg-[#39ff14]/10'
                          : 'border-white/12 bg-[#0b1220]'
                      }`}
                    >
                      <p className="text-xs font-bold uppercase text-white">
                        {tier === 'free' ? 'Free Pass' : 'Pro Access'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/50">
                        {tier === 'free'
                          ? 'Schedule & reminders'
                          : 'Full member profile'}
                      </p>
                    </button>
                  ))}
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/50">
                  <ShieldCheck size={13} className="text-[#39ff14]" />
                  Email confirmation is required before your first sign-in.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-12 w-full items-center justify-center rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] transition hover:bg-[#a8ff9d] disabled:opacity-60"
            >
              {loading
                ? mode === 'signin'
                  ? 'Signing in...'
                  : 'Creating account...'
                : mode === 'signin'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </ModalShell>
  )
}

function StreamPlayer({
  mediaUrl,
  posterUrl,
}: {
  mediaUrl: string
  posterUrl?: string | null
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playbackError, setPlaybackError] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setPlaybackError(null)

    const isHls = /\.m3u8(\?|$)/i.test(mediaUrl)

    if (isHls) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = mediaUrl
        return
      }
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true })
        hls.loadSource(mediaUrl)
        hls.attachMedia(video)
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setPlaybackError(
              'Unable to load this stream URL. Verify CORS and stream availability.',
            )
          }
        })
        return () => {
          hls.destroy()
        }
      }
      setPlaybackError('HLS playback is not supported in this browser.')
      return
    }

    video.src = mediaUrl
  }, [mediaUrl])

  if (playbackError) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0b1220] p-6 text-center">
        <AlertCircle size={28} className="mb-2 text-[#ff8b91]" />
        <p className="text-sm font-bold text-white">Stream playback error</p>
        <p className="mt-1 max-w-md text-xs text-white/60">{playbackError}</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
      <video
        ref={videoRef}
        poster={posterUrl ?? undefined}
        controls
        playsInline
        onError={() =>
          setPlaybackError(
            'Unable to play the configured media source in this browser.',
          )
        }
        className="aspect-video w-full object-contain"
      />
    </div>
  )
}

export function MediaViewerModal({
  item,
  remindedIds,
  serverDateUtc,
  onToggleReminder,
  onClose,
}: {
  item:
    | { kind: 'match'; match: MatchRow }
    | { kind: 'highlight'; highlight: HighlightRow }
  remindedIds: Set<string>
  serverDateUtc: string
  onToggleReminder: (matchId: string) => Promise<void>
  onClose: () => void
}) {
  const isMatch = item.kind === 'match'
  const mediaUrl = isMatch ? item.match.stream_url : item.highlight.video_url
  const posterUrl = isMatch ? item.match.image_url : item.highlight.image_url
  const hasPlayableUrl = Boolean(mediaUrl && /^https?:\/\//i.test(mediaUrl))

  const title = isMatch
    ? item.match.headline || `${item.match.home_team} vs ${item.match.away_team}`
    : item.highlight.title

  const eyebrow = isMatch
    ? `${item.match.sport?.name ?? 'Sport'} • ${item.match.league}`
    : `${item.highlight.badge}${item.highlight.duration ? ` • ${item.highlight.duration}` : ''}`

  return (
    <ModalShell
      onClose={onClose}
      eyebrow={eyebrow}
      title={title}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5">
        {hasPlayableUrl && mediaUrl ? (
          <StreamPlayer mediaUrl={mediaUrl} posterUrl={posterUrl} />
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]">
            {posterUrl ? (
              <img
                src={posterUrl}
                alt={
                  isMatch
                    ? item.match.image_alt ?? title
                    : item.highlight.image_alt ?? title
                }
                className="aspect-video w-full object-cover opacity-55"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center bg-[#1f2937]/40">
                <Film size={44} className="text-white/25" />
              </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b1220]/70 p-6 text-center backdrop-blur-[2px]">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[#39ff14]">
                {isMatch ? <Play size={22} /> : <CirclePlay size={24} />}
              </div>
              <p className="text-sm font-bold text-white">
                {isMatch
                  ? 'Broadcast Stream Unavailable'
                  : 'Highlight Video Unavailable'}
              </p>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-white/65">
                {isMatch
                  ? 'A licensed broadcast URL has not been attached to this event yet. When a legitimate MP4 or HLS stream URL is configured, playback starts automatically in this player.'
                  : 'A licensed video URL has not been attached to this highlight yet. When a legitimate MP4 or HLS video URL is configured, playback starts automatically in this player.'}
              </p>
            </div>
          </div>
        )}

        {isMatch ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#0b1220] p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/60">
                {item.match.status === 'live' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff3b45] px-2.5 py-0.5 text-[10px] text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" /> Live{' '}
                    {item.match.match_clock ? `• ${item.match.match_clock}` : ''}
                  </span>
                ) : item.match.status === 'finished' ? (
                  <span className="inline-flex items-center gap-1.5 rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/80">
                    FINAL SCORE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[#39ff14]">
                    <Clock3 size={13} />{' '}
                    {formatMatchDayLabel(item.match.kickoff_at, serverDateUtc)}{' '}
                    • {formatUtcTime(item.match.kickoff_at)} UTC
                  </span>
                )}
              </div>
              <p className="text-lg font-bold text-white">
                {item.match.home_team}{' '}
                {item.match.status !== 'upcoming' ? (
                  <span className="mx-2 text-[#39ff14]">
                    {item.match.home_score} — {item.match.away_score}
                  </span>
                ) : (
                  <span className="mx-2 text-white/40">vs</span>
                )}
                {item.match.away_team}
              </p>
            </div>

            {item.match.status === 'upcoming' && (
              <button
                type="button"
                onClick={() => onToggleReminder(item.match.id)}
                className={`flex min-h-11 items-center gap-2 rounded-full px-5 text-xs font-bold transition ${
                  remindedIds.has(item.match.id)
                    ? 'bg-[#39ff14] text-[#0b1220]'
                    : 'border border-white/20 bg-white/5 text-white hover:border-[#39ff14]/60'
                }`}
              >
                {remindedIds.has(item.match.id) ? (
                  <>
                    <Check size={14} /> Reminder saved
                  </>
                ) : (
                  <>
                    <Bell size={14} /> Remind me
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          item.highlight.description && (
            <p className="text-sm leading-relaxed text-white/75">
              {item.highlight.description}
            </p>
          )
        )}
      </div>
    </ModalShell>
  )
}

export function ArticleReaderModal({
  article,
  onClose,
}: {
  article: NewsArticleRow
  onClose: () => void
}) {
  return (
    <ModalShell
      onClose={onClose}
      eyebrow={`${article.category} • ${article.read_time} • ${formatArticleDate(article.published_at)}`}
      title={article.title}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="overflow-hidden rounded-xl border border-white/10">
          <img
            src={article.image_url}
            alt={article.image_alt ?? article.title}
            className="aspect-[16/9] w-full object-cover"
          />
        </div>
        {article.summary && (
          <p className="text-base font-medium leading-relaxed text-white/90">
            {article.summary}
          </p>
        )}
        <div className="space-y-3 border-t border-white/10 pt-4 text-sm leading-7 text-white/70">
          <p>
            {article.content ||
              article.summary ||
              'Full editorial coverage from SPORTIVRA.'}
          </p>
        </div>
      </div>
    </ModalShell>
  )
}

export function MatchCenterModal({
  initialTab,
  matches,
  remindedIds,
  serverDateUtc,
  onToggleReminder,
  onWatchMatch,
  onClose,
}: {
  initialTab: 'live' | 'upcoming' | 'finished' | 'all'
  matches: MatchRow[]
  remindedIds: Set<string>
  serverDateUtc: string
  onToggleReminder: (matchId: string) => Promise<void>
  onWatchMatch: (match: MatchRow) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'live' | 'upcoming' | 'finished' | 'all'>(
    initialTab,
  )

  const filtered = matches.filter((m) =>
    tab === 'all' ? true : m.status === tab,
  )

  return (
    <ModalShell
      onClose={onClose}
      eyebrow="Match Center"
      title="Live, Schedule & Final Scores"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['live', 'Live now'],
              ['upcoming', 'Upcoming schedule'],
              ['finished', 'Final scores'],
              ['all', 'All matches'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-10 rounded-full px-4 text-xs font-bold transition ${
                tab === key
                  ? 'bg-[#39ff14] text-[#0b1220]'
                  : 'border border-white/12 bg-[#0b1220] text-white/70 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#0b1220] p-6 text-center text-sm text-white/55">
            No matches currently listed in this view.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((match) => {
              const isReminded = remindedIds.has(match.id)
              return (
                <div
                  key={match.id}
                  className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#0b1220] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/50">
                      <span>
                        {match.sport?.icon} {match.sport?.name}
                      </span>
                      <span>•</span>
                      <span>{match.league}</span>
                      {match.status === 'live' && (
                        <span className="rounded-full bg-[#ff3b45] px-2 py-0.5 text-[10px] text-white">
                          LIVE {match.match_clock ?? ''}
                        </span>
                      )}
                      {match.status === 'upcoming' && (
                        <span className="text-[#39ff14]">
                          {formatMatchDayLabel(match.kickoff_at, serverDateUtc)}{' '}
                          • {formatUtcTime(match.kickoff_at)} UTC
                        </span>
                      )}
                      {match.status === 'finished' && (
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/80">
                          FINAL
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-base font-bold text-white">
                      {match.headline ? `${match.headline}: ` : ''}
                      {match.home_team}{' '}
                      <span className="mx-1.5 text-[#39ff14]">
                        {match.status === 'upcoming'
                          ? 'vs'
                          : `${match.home_score} — ${match.away_score}`}
                      </span>{' '}
                      {match.away_team}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {match.status === 'upcoming' ? (
                      <button
                        type="button"
                        onClick={() => onToggleReminder(match.id)}
                        className={`flex min-h-10 items-center gap-1.5 rounded-full px-4 text-xs font-bold transition ${
                          isReminded
                            ? 'bg-[#39ff14] text-[#0b1220]'
                            : 'border border-white/15 text-white hover:border-[#39ff14]'
                        }`}
                      >
                        {isReminded ? <Check size={14} /> : <Bell size={14} />}
                        {isReminded ? 'Reminded' : 'Remind'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onWatchMatch(match)}
                        className="flex min-h-10 items-center gap-1.5 rounded-full bg-[#39ff14] px-4 text-xs font-bold text-[#0b1220] transition hover:bg-[#a8ff9d]"
                      >
                        <Play size={13} fill="currentColor" /> Open viewer
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </ModalShell>
  )
}

export function CatalogArchiveModal({
  mode,
  highlights,
  newsArticles,
  onSelectHighlight,
  onSelectArticle,
  onClose,
}: {
  mode: 'highlights' | 'news'
  highlights: HighlightRow[]
  newsArticles: NewsArticleRow[]
  onSelectHighlight: (h: HighlightRow) => void
  onSelectArticle: (a: NewsArticleRow) => void
  onClose: () => void
}) {
  return (
    <ModalShell
      onClose={onClose}
      eyebrow={mode === 'highlights' ? 'On Demand' : 'Editorial'}
      title={mode === 'highlights' ? 'All Highlights' : 'All Sports News'}
      maxWidth="max-w-3xl"
    >
      {mode === 'highlights' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {highlights.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onSelectHighlight(h)}
              className="group overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] text-left transition hover:border-[#39ff14]/50"
            >
              <div className="relative aspect-video overflow-hidden">
                <img
                  src={h.image_url}
                  alt={h.image_alt ?? h.title}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] to-transparent" />
                <span className="absolute left-3 top-3 rounded-full bg-[#0b1220]/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#39ff14]">
                  {h.badge}
                </span>
                {h.duration && (
                  <span className="absolute bottom-3 right-3 rounded bg-black/70 px-2 py-0.5 text-[11px] font-semibold">
                    {h.duration}
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-white group-hover:text-[#39ff14]">
                  {h.title}
                </h3>
                {h.description && (
                  <p className="mt-1.5 line-clamp-2 text-xs text-white/55">
                    {h.description}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {newsArticles.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => onSelectArticle(article)}
              className="group flex w-full flex-col gap-4 rounded-xl border border-white/10 bg-[#0b1220] p-4 text-left transition hover:border-[#39ff14]/50 sm:flex-row sm:items-center"
            >
              <img
                src={article.image_url}
                alt={article.image_alt ?? article.title}
                className="h-24 w-full shrink-0 rounded-lg object-cover sm:w-36"
              />
              <div className="flex-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#39ff14]">
                  {article.category}
                </span>
                <h3 className="mt-1 font-bold text-white group-hover:text-[#39ff14]">
                  {article.title}
                </h3>
                {article.summary && (
                  <p className="mt-1 line-clamp-2 text-xs text-white/55">
                    {article.summary}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-white/40">
                  {article.read_time} • {formatArticleDate(article.published_at)}
                </p>
              </div>
              <ChevronRight
                size={16}
                className="hidden shrink-0 text-white/40 group-hover:text-[#39ff14] sm:block"
              />
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  )
}

export function InfoPageModal({
  topic,
  onClose,
}: {
  topic: 'About us' | 'Careers' | 'Help centre' | 'Privacy' | 'Terms'
  onClose: () => void
}) {
  const copyMap: Record<typeof topic, { subtitle: string; body: string }> = {
    'About us': {
      subtitle: 'Every sport. Every moment.',
      body: 'SPORTIVRA brings live scores, upcoming match schedules, curated highlights, and editorial coverage into a single international sports platform powered by Supabase.',
    },
    Careers: {
      subtitle: 'Build the future of sports entertainment',
      body: 'We collaborate with engineers, sports editors, and data specialists focused on fast real-time match experiences and clean cross-device design.',
    },
    'Help centre': {
      subtitle: 'Account, reminders & email verification',
      body: 'Sign up with email and password, verify your email confirmation link, and use Match Reminders to save upcoming fixtures directly to your SPORTIVRA account.',
    },
    Privacy: {
      subtitle: 'Row-level security & data protection',
      body: 'Your account profile and match reminders are stored in Supabase PostgreSQL with Row Level Security policies restricting read and write access strictly to your authenticated user ID.',
    },
    Terms: {
      subtitle: 'Platform usage & broadcast rights',
      body: 'SPORTIVRA displays live metadata and licensed stream placeholders. Video and stream players activate only when legitimate media URLs are configured.',
    },
  }

  return (
    <ModalShell
      onClose={onClose}
      eyebrow="SPORTIVRA"
      title={topic}
      maxWidth="max-w-lg"
    >
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-bold text-[#39ff14]">
          <Trophy size={15} /> {copyMap[topic].subtitle}
        </p>
        <p className="text-sm leading-relaxed text-white/75">
          {copyMap[topic].body}
        </p>
      </div>
    </ModalShell>
  )
}
