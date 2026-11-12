'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Globe,
  Heart,
  Loader2,
  Lock,
  Menu,
  Monitor,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
  Trophy,
  Tv,
  User as UserIcon,
  Users,
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
  BillingClientError,
  extractPlanFeatures,
  fetchBillingOverview,
  fetchPublicPlans,
  formatBillingIntervalLabel,
  formatMinorCurrency,
  getMembershipDisplayModel,
  initializeCheckoutSession,
  isSafePaystackRedirectUrl,
  type PublicPlanSummary,
  type UserBillingOverview,
} from '@/lib/billing/client'
import {
  fetchInitialCatalog,
  fetchMatchesFromSupabase,
  formatArticleDate,
  formatEventCount,
  formatMatchDayLabel,
  formatUtcTime,
  resolveActiveNavSectionId,
  searchCatalog,
  type InitialCatalogData,
  type SearchResults,
} from '@/lib/sportivra/data'
import {
  GUEST_PREFS_STORAGE_KEY,
  clearGuestPreferences,
  extractPreferencesFromProfile,
  extractTeamsFromMatches,
  mergePreferences,
  persistUserPreferences,
  prioritiseBySports,
  readGuestPreferences,
  writeGuestPreferences,
  type UserPreferences,
} from '@/lib/sportivra/personalisation'
import {
  THEME_STORAGE_KEY,
  applyTheme,
  readCurrentTheme,
  type ThemeMode,
} from '@/lib/sportivra/theme'
import {
  ArticleReaderModal,
  AuthAccountModal,
  CatalogArchiveModal,
  InfoPageModal,
  MatchCenterModal,
  MediaViewerModal,
} from '@/components/sportivra-modals'

const navItems = [
  { label: 'Home', href: '#top', id: 'top' },
  { label: 'Live', href: '#live', id: 'live' },
  { label: 'Sports', href: '#sports', id: 'sports' },
  { label: 'My Teams', href: '#my-teams', id: 'my-teams' },
  { label: 'Schedule', href: '#schedule', id: 'schedule' },
  { label: 'Scores', href: '#scores', id: 'scores' },
  { label: 'Highlights', href: '#highlights', id: 'highlights' },
  { label: 'News', href: '#news', id: 'news' },
  { label: 'Membership', href: '#pricing', id: 'pricing' },
] as const

const sportSubtitles: Record<string, string> = {
  football: 'Matches, leagues & cups',
  basketball: 'NBA, EuroLeague & more',
  tennis: 'Grand Slams & ATP/WTA',
  cricket: 'T20, ODI & internationals',
  boxing: 'World title bouts & PPV',
  motorsport: 'Grand Prix & trackside',
}

function getSportSubtitle(slug: string): string {
  return sportSubtitles[slug] ?? 'Live matches & highlights'
}

function SportLineIcon({
  slug,
  fallback,
}: {
  slug: string
  fallback: string
}) {
  const strokeProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'h-6 w-6 text-[#39ff14]',
    'aria-hidden': true,
  }

  switch (slug) {
    case 'football':
      return (
        <svg {...strokeProps}>
          <circle cx="12" cy="12" r="9" />
          <polygon points="12 7.5 15.8 10.3 14.3 14.8 9.7 14.8 8.2 10.3" />
          <path d="M12 3v4.5M19.8 8.2l-4 2.1M17.2 19.3l-2.9-4.5M6.8 19.3l2.9-4.5M4.2 8.2l4 2.1" />
        </svg>
      )
    case 'basketball':
      return (
        <svg {...strokeProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3v18M5.8 5.8c3.6 3.5 3.6 8.9 0 12.4M18.2 5.8c-3.6 3.5-3.6 8.9 0 12.4" />
        </svg>
      )
    case 'tennis':
      return (
        <svg {...strokeProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M6.2 5.2c3.2 2.4 3.2 11.2 0 13.6M17.8 5.2c-3.2 2.4-3.2 11.2 0 13.6" />
        </svg>
      )
    case 'cricket':
      return (
        <svg {...strokeProps}>
          <path d="M6 18 14.5 9.5M13.5 6.5l4 4-6.5 6.5-4-4Z" />
          <circle cx="17.5" cy="17.5" r="2.2" />
          <path d="M4 20l2-2" />
        </svg>
      )
    case 'boxing':
      return (
        <svg {...strokeProps}>
          <path d="M7 14V9.5A4.5 4.5 0 0 1 11.5 5h3A3.5 3.5 0 0 1 18 8.5v4a4.5 4.5 0 0 1-4.5 4.5H9.5A2.5 2.5 0 0 1 7 14Z" />
          <path d="M7 11.5H5.5A1.5 1.5 0 0 0 4 13v1.5A2.5 2.5 0 0 0 6.5 17H9" />
          <path d="M8 17v2.5h8V17" />
        </svg>
      )
    case 'motorsport':
      return (
        <svg {...strokeProps}>
          <path d="M4 14a8 8 0 0 1 15.6-2.4l.4 2.4v3H5.5A1.5 1.5 0 0 1 4 15.5Z" />
          <path d="M12.5 10.5H19l.7 2.5H12.5a1.25 1.25 0 0 1 0-2.5Z" />
          <path d="M6.5 17h11" />
        </svg>
      )
    default:
      return (
        <span className="text-lg leading-none text-[#39ff14]" aria-hidden="true">
          {fallback}
        </span>
      )
  }
}

function Brand() {
  return (
    <a
      href="#top"
      className="flex items-center gap-2.5"
      aria-label="SPORTIVRA home"
    >
      <span className="brand-mark">S</span>
      <span className="text-[18px] font-black tracking-[0.18em] text-[#0b1220] dark:text-white">
        SPORTIVRA
      </span>
    </a>
  )
}

function SectionHeading({
  eyebrow,
  title,
  badge,
  action,
  onAction,
}: {
  eyebrow: string
  title: string
  badge?: React.ReactNode
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.26em] text-[#0f7a06] dark:text-[#39ff14]">
          {eyebrow}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[#0b1220] sm:text-3xl dark:text-white">
            {title}
          </h2>
          {badge}
        </div>
      </div>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-slate-600 transition hover:text-[#0f7a06] sm:text-sm dark:text-white/65 dark:hover:text-[#39ff14]"
        >
          {action}
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}

function MatchCard({
  match,
  isReminded,
  isSaving,
  favoriteTeams,
  serverDateUtc,
  onToggleReminder,
  onToggleFollowTeam,
  onOpenMatch,
}: {
  match: MatchRow
  isReminded: boolean
  isSaving: boolean
  favoriteTeams: Set<string>
  serverDateUtc: string
  onToggleReminder: (matchId: string) => void
  onToggleFollowTeam: (teamName: string) => void
  onOpenMatch: (match: MatchRow) => void
}) {
  const dayLabel = formatMatchDayLabel(match.kickoff_at, serverDateUtc)
  const timeLabel = formatUtcTime(match.kickoff_at)
  const homeFollowed = favoriteTeams.has(match.home_team)
  const awayFollowed = favoriteTeams.has(match.away_team)

  return (
    <article className="match-card group flex flex-col justify-between">
      <div>
        <div className="mb-4 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-white/50">
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <span className="text-sm">{match.sport?.icon ?? '⚽'}</span>
            <span className="truncate">{match.league}</span>
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {match.access_tier === 'premium' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800 dark:border-[#39ff14]/45 dark:bg-[#39ff14]/15 dark:text-[#39ff14]">
                <Lock size={9} /> Premium
              </span>
            )}
            <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-[#0f7a06] dark:border-white/10 dark:bg-white/5 dark:text-[#39ff14]">
              {dayLabel}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenMatch(match)}
          className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 py-3 text-center"
        >
          <div className="flex flex-col items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-black text-[#0b1220] transition group-hover:border-[#0f7a06]/45 dark:border-white/15 dark:bg-white/8 dark:text-white dark:group-hover:border-[#39ff14]/45">
              {match.home_team[0]}
            </span>
            <span className="line-clamp-2 text-xs font-bold leading-snug text-[#0b1220] sm:text-sm dark:text-white/95">
              {match.home_team}
            </span>
          </div>

          <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-white/5 dark:text-white/45">
            vs
          </span>

          <div className="flex flex-col items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-black text-[#0b1220] transition group-hover:border-[#0f7a06]/45 dark:border-white/15 dark:bg-white/8 dark:text-white dark:group-hover:border-[#39ff14]/45">
              {match.away_team[0]}
            </span>
            <span className="line-clamp-2 text-xs font-bold leading-snug text-[#0b1220] sm:text-sm dark:text-white/95">
              {match.away_team}
            </span>
          </div>
        </button>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { name: match.home_team, followed: homeFollowed },
            { name: match.away_team, followed: awayFollowed },
          ].map(({ name, followed }) => (
            <button
              key={name}
              type="button"
              title={followed ? `Unfollow ${name}` : `Follow ${name}`}
              onClick={() => onToggleFollowTeam(name)}
              aria-pressed={followed}
              aria-label={followed ? `Unfollow ${name}` : `Follow ${name}`}
              className={`flex min-h-8 items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                followed
                  ? 'border-[#0f7a06] bg-[#39ff14] text-[#0b1220] dark:border-[#39ff14]'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0f7a06]/50 hover:text-[#0b1220] dark:border-white/12 dark:bg-white/5 dark:text-white/75 dark:hover:border-[#39ff14]/50 dark:hover:text-white'
              }`}
            >
              {followed ? (
                <Check size={11} className="shrink-0" />
              ) : (
                <Plus size={11} className="shrink-0" />
              )}
              <span className="truncate">
                {followed ? 'Following' : 'Follow'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-white/8">
        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600 dark:text-white/55">
          <Clock3 size={13} className="text-[#0f7a06] dark:text-[#39ff14]" />
          <span>
            {dayLabel} • {timeLabel} UTC
          </span>
        </div>

        <button
          type="button"
          disabled={isSaving}
          onClick={() => onToggleReminder(match.id)}
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-xs font-bold transition ${
            isReminded
              ? 'border-[#0f7a06] bg-[#39ff14] text-[#0b1220] dark:border-[#39ff14]'
              : 'border-[#0f7a06]/35 bg-[#39ff14]/15 text-[#0b1220] hover:border-[#0f7a06] hover:bg-[#39ff14]/30 dark:border-[#39ff14]/40 dark:bg-[#39ff14]/10 dark:text-[#39ff14] dark:hover:border-[#39ff14] dark:hover:bg-[#39ff14]/20'
          } disabled:opacity-60`}
          aria-label={
            isReminded
              ? `Remove reminder for ${match.home_team} versus ${match.away_team}`
              : `Set reminder for ${match.home_team} versus ${match.away_team}`
          }
        >
          {isSaving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isReminded ? (
            <>
              <Check size={14} /> Reminded
            </>
          ) : (
            <>
              <Bell size={14} /> Remind me <ArrowRight size={13} />
            </>
          )}
        </button>
      </div>
    </article>
  )
}

export function SportivraApp({
  initialData,
}: {
  initialData: InitialCatalogData
}) {
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [sports, setSports] = useState<SportRow[]>(initialData.sports)
  const [matches, setMatches] = useState<MatchRow[]>(initialData.matches)
  const [highlights, setHighlights] = useState<HighlightRow[]>(
    initialData.highlights,
  )
  const [newsArticles, setNewsArticles] = useState<NewsArticleRow[]>(
    initialData.newsArticles,
  )
  const [serverDateUtc, setServerDateUtc] = useState<string>(
    initialData.serverDateUtc,
  )
  const [catalogLoading, setCatalogLoading] = useState<boolean>(
    !initialData.serverHydrated,
  )
  const [catalogError, setCatalogError] = useState<string | null>(
    initialData.serverHydrated ? initialData.loadError : null,
  )
  const [activeNavId, setActiveNavId] = useState<string>('top')

  const initialAccountPrefs = extractPreferencesFromProfile(
    initialData.user ? initialData.profile : null,
  )

  const [user, setUser] = useState<{ id: string; email: string | null } | null>(
    initialData.user,
  )
  const [profile, setProfile] = useState<ProfileRow | null>(initialData.profile)
  const [favoriteSportIds, setFavoriteSportIds] = useState<string[]>(
    initialAccountPrefs.favoriteSportIds,
  )
  const [favoriteTeams, setFavoriteTeams] = useState<string[]>(
    initialAccountPrefs.favoriteTeams,
  )
  const prefsRef = useRef<UserPreferences>(initialAccountPrefs)
  const prefsSaveSeqRef = useRef(0)
  const lastSyncedUserIdRef = useRef<string | null>(null)
  const syncingGuestUserIdRef = useRef<string | null>(null)
  const guestHydratedRef = useRef(false)

  const [teamBrowserOpen, setTeamBrowserOpen] = useState(false)
  const [teamSearchQuery, setTeamSearchQuery] = useState('')
  const [teamSportFilter, setTeamSportFilter] = useState<string>('all')

  const [remindedIds, setRemindedIds] = useState<Set<string>>(
    () => new Set(initialData.reminderMatchIds),
  )
  const [savingReminderId, setSavingReminderId] = useState<string | null>(null)
  const [pendingReminderMatchId, setPendingReminderMatchId] = useState<
    string | null
  >(null)

  const [publicPlans, setPublicPlans] = useState<PublicPlanSummary[]>([])
  const [paidPlansConfigured, setPaidPlansConfigured] = useState(false)
  const [paidCheckoutConfigured, setPaidCheckoutConfigured] = useState(false)
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)

  const [billingOverview, setBillingOverview] =
    useState<UserBillingOverview | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)

  const [checkoutPlanCode, setCheckoutPlanCode] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [pendingCheckoutPlanCode, setPendingCheckoutPlanCode] = useState<
    string | null
  >(null)
  const [pendingVerifyRef, setPendingVerifyRef] = useState<string | null>(null)
  const [pendingMediaAuthNotice, setPendingMediaAuthNotice] = useState<
    string | null
  >(null)

  const [mobileNav, setMobileNav] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null)

  const [selectedSportSlug, setSelectedSportSlug] = useState<string | null>(null)

  const [authModalMode, setAuthModalMode] = useState<
    'signin' | 'signup' | 'account' | 'forgot' | 'recovery' | null
  >(null)
  const [mediaViewer, setMediaViewer] = useState<
    | { kind: 'match'; match: MatchRow }
    | { kind: 'highlight'; highlight: HighlightRow }
    | null
  >(null)
  const [activeArticle, setActiveArticle] = useState<NewsArticleRow | null>(null)
  const [matchCenterTab, setMatchCenterTab] = useState<
    'live' | 'upcoming' | 'finished' | 'all' | null
  >(null)
  const [archiveMode, setArchiveMode] = useState<'highlights' | 'news' | null>(
    null,
  )
  const [infoTopic, setInfoTopic] = useState<
    'About us' | 'Careers' | 'Help centre' | 'Privacy' | 'Terms' | null
  >(null)

  const [toast, setToast] = useState<{
    message: string
    tone: 'success' | 'error'
  } | null>(null)

  // Synchronise React theme state with the pre-paint <head> script & cross-tab storage changes
  useEffect(() => {
    const initial = readCurrentTheme()
    setTheme(initial)
    applyTheme(initial)

    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        const next: ThemeMode = e.newValue === 'light' ? 'light' : 'dark'
        setTheme(next)
        applyTheme(next)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return next
    })
  }, [])

  const showToast = useCallback(
    (message: string, tone: 'success' | 'error' = 'success') => {
      setToast({ message, tone })
    },
    [],
  )

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(timer)
  }, [toast])

  // Check URL query params after auth or billing redirects
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const confirmed = params.get('confirmed')
    const recovery = params.get('recovery')
    const authError = params.get('auth_error')
    const billingStatus = params.get('billing')
    const accountTab = params.get('account')
    const verifyRef = params.get('verify_ref')

    if (recovery === '1') {
      setAuthModalMode('recovery')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (confirmed === '1') {
      showToast('Email confirmed — welcome to SPORTIVRA!', 'success')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (authError) {
      showToast(authError, 'error')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (billingStatus === 'verified') {
      showToast('SPORTIVRA Premium payment verified and active!', 'success')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (accountTab === 'subscription') {
      setAuthModalMode('account')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (verifyRef) {
      setPendingVerifyRef(verifyRef)
      setAuthModalMode('signin')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [showToast])

  const loadPublicPlans = useCallback(async () => {
    setPlansLoading(true)
    setPlansError(null)
    try {
      const data = await fetchPublicPlans()
      setPublicPlans(data.plans)
      setPaidPlansConfigured(data.paidPlansConfigured)
      setPaidCheckoutConfigured(
        data.checkoutConfigured ??
          data.plans.some(
            (plan) => plan.tier === 'premium' && plan.checkoutReady,
          ),
      )
    } catch (err) {
      setPlansError(
        err instanceof Error
          ? err.message
          : 'Unable to load membership plans right now.',
      )
    } finally {
      setPlansLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPublicPlans()
  }, [loadPublicPlans])

  const loadBillingOverview = useCallback(async () => {
    setBillingLoading(true)
    setBillingError(null)
    try {
      const overview = await fetchBillingOverview()
      setBillingOverview(overview)
    } catch (err) {
      if (err instanceof BillingClientError && err.statusCode === 401) {
        setBillingOverview(null)
        return
      }
      setBillingError(
        err instanceof Error
          ? err.message
          : 'Unable to load subscription details right now.',
      )
    } finally {
      setBillingLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setBillingOverview(null)
      setBillingError(null)
      return
    }
    void loadBillingOverview()
  }, [loadBillingOverview, user])

  const startPlanCheckout = useCallback(
    async (planCode: string) => {
      setCheckoutError(null)
      const supabase = createClient()
      const {
        data: { user: activeUser },
      } = await supabase.auth.getUser()

      if (!activeUser) {
        setPendingCheckoutPlanCode(planCode)
        setAuthModalMode('signin')
        return
      }

      setCheckoutPlanCode(planCode)
      try {
        const result = await initializeCheckoutSession(planCode)
        if (!isSafePaystackRedirectUrl(result.authorizationUrl)) {
          throw new Error(
            'Received an unexpected payment redirect URL from the server.',
          )
        }
        window.location.assign(result.authorizationUrl)
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to start Paystack checkout right now.'
        setCheckoutError(msg)
        showToast(msg, 'error')
      } finally {
        setCheckoutPlanCode(null)
      }
    },
    [showToast],
  )

  const validSportIds = useMemo(
    () => new Set(sports.map((s) => s.id)),
    [sports],
  )

  const teamCatalog = useMemo(
    () => extractTeamsFromMatches(matches, sports),
    [matches, sports],
  )

  const validTeamNames = useMemo(
    () => new Set(teamCatalog.map((t) => t.name)),
    [teamCatalog],
  )

  const applyPreferencesState = useCallback((next: UserPreferences) => {
    prefsRef.current = next
    setFavoriteSportIds(next.favoriteSportIds)
    setFavoriteTeams(next.favoriteTeams)
  }, [])

  const syncAccountPreferences = useCallback(
    async (
      authUserId: string,
      authEmail: string | null,
      serverProfile: ProfileRow | null,
    ) => {
      const sportSet = validSportIds.size > 0 ? validSportIds : undefined
      const teamSet = validTeamNames.size > 0 ? validTeamNames : undefined

      const serverPrefs = extractPreferencesFromProfile(
        serverProfile,
        sportSet,
        teamSet,
      )
      const guestPrefs = readGuestPreferences(sportSet, teamSet)
      const hasGuestPrefs =
        guestPrefs.favoriteSportIds.length > 0 ||
        guestPrefs.favoriteTeams.length > 0

      if (!hasGuestPrefs) {
        applyPreferencesState(serverPrefs)
        return
      }

      if (syncingGuestUserIdRef.current === authUserId) {
        return
      }
      syncingGuestUserIdRef.current = authUserId

      try {
        const merged = mergePreferences(serverPrefs, guestPrefs)
        const supabase = createClient()
        const { profile: savedProfile, error } = await persistUserPreferences(
          supabase,
          authUserId,
          authEmail,
          merged,
        )

        if (error) {
          applyPreferencesState(serverPrefs)
          showToast(
            `Could not sync local preferences to your profile: ${error}`,
            'error',
          )
          return
        }

        clearGuestPreferences()
        if (savedProfile) {
          setProfile(savedProfile)
        }
        applyPreferencesState(merged)
        showToast('Saved your personalised teams and sports to your account.')
      } finally {
        syncingGuestUserIdRef.current = null
      }
    },
    [applyPreferencesState, showToast, validSportIds, validTeamNames],
  )

  // Hydrate guest preferences locally when signed out; sync any local picks once per signed-in user
  useEffect(() => {
    if (catalogLoading) return

    if (user) {
      guestHydratedRef.current = false
      if (lastSyncedUserIdRef.current !== user.id) {
        lastSyncedUserIdRef.current = user.id
        void syncAccountPreferences(user.id, user.email, profile)
      }
      return
    }

    lastSyncedUserIdRef.current = null
    if (!guestHydratedRef.current) {
      guestHydratedRef.current = true
      const guest = readGuestPreferences(
        validSportIds.size > 0 ? validSportIds : undefined,
        validTeamNames.size > 0 ? validTeamNames : undefined,
      )
      applyPreferencesState(guest)
    }
  }, [
    applyPreferencesState,
    catalogLoading,
    profile,
    syncAccountPreferences,
    user,
    validSportIds,
    validTeamNames,
  ])

  // Cross-tab guest preference sync
  useEffect(() => {
    if (user) return
    const onStorage = (e: StorageEvent) => {
      if (e.key === GUEST_PREFS_STORAGE_KEY) {
        const next = readGuestPreferences(
          validSportIds.size > 0 ? validSportIds : undefined,
          validTeamNames.size > 0 ? validTeamNames : undefined,
        )
        applyPreferencesState(next)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [applyPreferencesState, user, validSportIds, validTeamNames])

  const retryCatalogLoad = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError(null)
    const supabase = createClient()
    const fresh = await fetchInitialCatalog(supabase)

    setSports(fresh.sports)
    setMatches(fresh.matches)
    setHighlights(fresh.highlights)
    setNewsArticles(fresh.newsArticles)
    setUser(fresh.user)
    setProfile(fresh.profile)
    setRemindedIds(new Set(fresh.reminderMatchIds))
    setServerDateUtc(fresh.serverDateUtc)
    setCatalogLoading(false)

    if (fresh.loadError) {
      setCatalogError(fresh.loadError)
      showToast(`Could not load SPORTIVRA data: ${fresh.loadError}`, 'error')
    } else {
      showToast('SPORTIVRA live catalogue updated.')
    }
  }, [showToast])

  // If SSR ran in an environment where server-side egress was restricted,
  // hydrate directly from Supabase in the browser without fallback mock data.
  useEffect(() => {
    if (initialData.serverHydrated) return
    let cancelled = false

    async function hydrateFromBrowser() {
      setCatalogLoading(true)
      setCatalogError(null)
      const supabase = createClient()
      const fresh = await fetchInitialCatalog(supabase)
      if (cancelled) return

      setSports(fresh.sports)
      setMatches(fresh.matches)
      setHighlights(fresh.highlights)
      setNewsArticles(fresh.newsArticles)
      setUser(fresh.user)
      setProfile(fresh.profile)
      setRemindedIds(new Set(fresh.reminderMatchIds))
      setServerDateUtc(fresh.serverDateUtc)
      setCatalogLoading(false)

      if (fresh.loadError) {
        setCatalogError(fresh.loadError)
        showToast(`Could not load SPORTIVRA data: ${fresh.loadError}`, 'error')
      }
    }

    void hydrateFromBrowser()
    return () => {
      cancelled = true
    }
  }, [initialData.serverHydrated, showToast])

  // Close search overlay & mobile navigation on Escape key
  useEffect(() => {
    if (!searchOpen && !mobileNav) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setMobileNav(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileNav, searchOpen])

  // Keep desktop & mobile navigation highlight synced to scroll position
  useEffect(() => {
    const trackedIds = [
      'pricing',
      'news',
      'highlights',
      'schedule',
      'my-teams',
      'sports',
      'live',
    ]
    const onScroll = () => {
      const sections = trackedIds
        .map((id) => {
          const el = document.getElementById(id)
          return el ? { id, offsetTop: el.offsetTop } : null
        })
        .filter((entry): entry is { id: string; offsetTop: number } =>
          Boolean(entry),
        )

      setActiveNavId(
        resolveActiveNavSectionId({
          scrollY: window.scrollY,
          innerHeight: window.innerHeight,
          scrollHeight: document.documentElement.scrollHeight,
          sections,
        }),
      )
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const loadUserAccountState = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      setUser(null)
      setProfile(null)
      setRemindedIds(new Set())
      applyPreferencesState(
        readGuestPreferences(
          validSportIds.size > 0 ? validSportIds : undefined,
          validTeamNames.size > 0 ? validTeamNames : undefined,
        ),
      )
      return null
    }

    setUser({ id: authUser.id, email: authUser.email ?? null })

    const [profileRes, remindersRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle(),
      supabase
        .from('match_reminders')
        .select('match_id')
        .eq('user_id', authUser.id),
    ])

    const serverProfile = profileRes.data ?? null
    setProfile(serverProfile)
    const nextReminders = new Set(
      (remindersRes.data ?? []).map((r) => r.match_id),
    )
    setRemindedIds(nextReminders)

    await syncAccountPreferences(
      authUser.id,
      authUser.email ?? null,
      serverProfile,
    )

    return authUser.id
  }, [
    applyPreferencesState,
    syncAccountPreferences,
    validSportIds,
    validTeamNames,
  ])

  // Subscribe to auth state changes & live match updates via Supabase Realtime
  useEffect(() => {
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        void loadUserAccountState()
        setAuthModalMode('recovery')
      } else if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        void loadUserAccountState()
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        setRemindedIds(new Set())
        syncingGuestUserIdRef.current = null
        lastSyncedUserIdRef.current = null
        applyPreferencesState({ favoriteSportIds: [], favoriteTeams: [] })
      }
    })

    const channel = supabase
      .channel('sportivra-matches-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        async () => {
          const updatedMatches = await fetchMatchesFromSupabase(supabase)
          if (updatedMatches.length > 0) {
            setMatches(updatedMatches)
          }
        },
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [loadUserAccountState])

  // Debounced live Supabase search
  const runSearch = useCallback(async (queryText: string) => {
    const trimmed = queryText.trim()
    if (!trimmed) {
      setSearchResults(null)
      setSearchError(null)
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    setSearchError(null)
    try {
      const supabase = createClient()
      const results = await searchCatalog(supabase, trimmed)
      setSearchResults(results)
    } catch {
      setSearchError('Search could not reach SPORTIVRA right now.')
    } finally {
      setSearchLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!searchOpen) return
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSearchResults(null)
      setSearchError(null)
      setSearchLoading(false)
      return
    }

    let cancelled = false
    setSearchLoading(true)
    setSearchError(null)
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient()
        const results = await searchCatalog(supabase, trimmed)
        if (!cancelled) {
          setSearchResults(results)
        }
      } catch {
        if (!cancelled) {
          setSearchError('Search could not reach SPORTIVRA right now.')
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false)
        }
      }
    }, 220)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchOpen, searchQuery])

  const toggleReminder = useCallback(
    async (matchId: string) => {
      const supabase = createClient()
      const {
        data: { user: activeUser },
      } = await supabase.auth.getUser()

      if (!activeUser) {
        setPendingReminderMatchId(matchId)
        setAuthModalMode('signin')
        return
      }

      setSavingReminderId(matchId)
      try {
        if (remindedIds.has(matchId)) {
          const { error } = await supabase
            .from('match_reminders')
            .delete()
            .eq('user_id', activeUser.id)
            .eq('match_id', matchId)

          if (error) {
            showToast(error.message, 'error')
            return
          }

          setRemindedIds((prev) => {
            const next = new Set(prev)
            next.delete(matchId)
            return next
          })
          showToast('Match reminder removed.')
        } else {
          const { error } = await supabase.from('match_reminders').insert({
            user_id: activeUser.id,
            match_id: matchId,
          })

          if (error) {
            showToast(error.message, 'error')
            return
          }

          setRemindedIds((prev) => new Set(prev).add(matchId))
          showToast('Match reminder saved to your account.')
        }
      } finally {
        setSavingReminderId(null)
      }
    },
    [remindedIds, showToast],
  )

  const handleAuthSuccess = useCallback(async () => {
    const activeUserId = await loadUserAccountState()
    await loadBillingOverview()

    if (activeUserId && pendingVerifyRef) {
      const refToVerify = pendingVerifyRef
      setPendingVerifyRef(null)
      window.location.assign(
        `/billing/callback?reference=${encodeURIComponent(refToVerify)}`,
      )
      return
    }

    if (activeUserId && pendingCheckoutPlanCode) {
      const planToStart = pendingCheckoutPlanCode
      setPendingCheckoutPlanCode(null)
      setAuthModalMode(null)
      await startPlanCheckout(planToStart)
      return
    }

    if (activeUserId && pendingReminderMatchId) {
      const supabase = createClient()
      const { error } = await supabase.from('match_reminders').upsert(
        {
          user_id: activeUserId,
          match_id: pendingReminderMatchId,
        },
        { onConflict: 'user_id,match_id', ignoreDuplicates: true },
      )
      if (!error) {
        setRemindedIds((prev) => new Set(prev).add(pendingReminderMatchId))
        showToast('Signed in and saved your match reminder!')
      }
      setPendingReminderMatchId(null)
      return
    }

    if (pendingMediaAuthNotice) {
      setPendingMediaAuthNotice(null)
      setAuthModalMode(null)
      showToast('Signed in — verifying Premium playback.')
      return
    }

    showToast('Signed in to SPORTIVRA.')
  }, [
    loadBillingOverview,
    loadUserAccountState,
    pendingCheckoutPlanCode,
    pendingMediaAuthNotice,
    pendingReminderMatchId,
    pendingVerifyRef,
    showToast,
    startPlanCheckout,
  ])

  const handleRemoveReminderFromAccount = useCallback(
    async (matchId: string) => {
      if (!user) return
      const supabase = createClient()
      const { error } = await supabase
        .from('match_reminders')
        .delete()
        .eq('user_id', user.id)
        .eq('match_id', matchId)

      if (error) {
        showToast(error.message, 'error')
        return
      }
      setRemindedIds((prev) => {
        const next = new Set(prev)
        next.delete(matchId)
        return next
      })
      showToast('Match reminder removed.')
    },
    [showToast, user],
  )

  const updatePreferences = useCallback(
    async (
      updater: (prev: UserPreferences) => UserPreferences,
      feedbackMessage?: string,
    ) => {
      const next = updater(prefsRef.current)
      applyPreferencesState(next)

      if (!user) {
        writeGuestPreferences(next)
        if (feedbackMessage) {
          showToast(feedbackMessage)
        }
        return
      }

      const seq = ++prefsSaveSeqRef.current
      const supabase = createClient()
      const { profile: savedProfile, error } = await persistUserPreferences(
        supabase,
        user.id,
        user.email,
        next,
      )

      if (seq !== prefsSaveSeqRef.current) return

      if (error) {
        showToast(`Could not save preferences: ${error}`, 'error')
        await loadUserAccountState()
        return
      }

      if (savedProfile) {
        setProfile(savedProfile)
      }
      if (feedbackMessage) {
        showToast(feedbackMessage)
      }
    },
    [applyPreferencesState, loadUserAccountState, showToast, user],
  )

  const toggleFavoriteSport = useCallback(
    (sportId: string) => {
      const sportName =
        sports.find((s) => s.id === sportId)?.name ?? 'Sport'
      const wasSelected = prefsRef.current.favoriteSportIds.includes(sportId)

      void updatePreferences(
        (prev) => ({
          ...prev,
          favoriteSportIds: wasSelected
            ? prev.favoriteSportIds.filter((id) => id !== sportId)
            : [...prev.favoriteSportIds, sportId],
        }),
        wasSelected
          ? `Removed ${sportName} from your favourite sports.`
          : `Added ${sportName} to your favourite sports.`,
      )
    },
    [sports, updatePreferences],
  )

  const clearFavoriteSports = useCallback(() => {
    if (prefsRef.current.favoriteSportIds.length === 0) return
    void updatePreferences(
      (prev) => ({ ...prev, favoriteSportIds: [] }),
      'Cleared favourite sports selection.',
    )
  }, [updatePreferences])

  const toggleFollowTeam = useCallback(
    (teamName: string) => {
      const cleanName = teamName.trim()
      if (!cleanName) return
      const wasFollowing = prefsRef.current.favoriteTeams.includes(cleanName)

      void updatePreferences(
        (prev) => ({
          ...prev,
          favoriteTeams: wasFollowing
            ? prev.favoriteTeams.filter((t) => t !== cleanName)
            : [...prev.favoriteTeams, cleanName],
        }),
        wasFollowing
          ? `Unfollowed ${cleanName}.`
          : `Following ${cleanName}.`,
      )
    },
    [updatePreferences],
  )

  const selectedSport = useMemo(
    () => sports.find((s) => s.slug === selectedSportSlug) ?? null,
    [sports, selectedSportSlug],
  )

  const favoriteSportIdSet = useMemo(
    () => new Set(favoriteSportIds),
    [favoriteSportIds],
  )

  const favoriteTeamSet = useMemo(
    () => new Set(favoriteTeams),
    [favoriteTeams],
  )

  const favoriteSportsList = useMemo(
    () =>
      favoriteSportIds
        .map((id) => sports.find((s) => s.id === id))
        .filter((s): s is SportRow => Boolean(s)),
    [favoriteSportIds, sports],
  )

  const prioritisedMatches = useMemo(
    () => prioritiseBySports(matches, favoriteSportIds),
    [matches, favoriteSportIds],
  )

  const globalLiveMatches = useMemo(
    () => prioritisedMatches.filter((m) => m.status === 'live'),
    [prioritisedMatches],
  )

  const matchesBySport = useMemo(() => {
    if (!selectedSport) return prioritisedMatches
    return prioritisedMatches.filter((m) => m.sport_id === selectedSport.id)
  }, [prioritisedMatches, selectedSport])

  const liveMatches = useMemo(
    () => matchesBySport.filter((m) => m.status === 'live'),
    [matchesBySport],
  )
  const featuredLive = liveMatches[0] ?? null
  const secondaryLive = liveMatches.slice(1, 3)

  const finishedMatches = useMemo(
    () => matchesBySport.filter((m) => m.status === 'finished').slice(0, 3),
    [matchesBySport],
  )

  const upcomingMatches = useMemo(
    () => matchesBySport.filter((m) => m.status === 'upcoming').slice(0, 3),
    [matchesBySport],
  )

  const filteredHighlights = useMemo(() => {
    if (!selectedSport) {
      return prioritiseBySports(highlights, favoriteSportIds)
    }
    return highlights.filter((h) => h.sport_id === selectedSport.id)
  }, [highlights, selectedSport, favoriteSportIds])

  const showcaseHighlights = useMemo(
    () => filteredHighlights.slice(0, 2),
    [filteredHighlights],
  )

  const filteredNews = useMemo(() => {
    if (!selectedSport) {
      return prioritiseBySports(newsArticles, favoriteSportIds).slice(0, 3)
    }
    return newsArticles
      .filter((a) => a.sport_id === selectedSport.id)
      .slice(0, 3)
  }, [newsArticles, selectedSport, favoriteSportIds])

  const allArchiveNews = useMemo(() => {
    if (selectedSport) {
      return newsArticles.filter((a) => a.sport_id === selectedSport.id)
    }
    return prioritiseBySports(newsArticles, favoriteSportIds)
  }, [newsArticles, selectedSport, favoriteSportIds])

  const followedTeamCatalog = useMemo(() => {
    const map = new Map(teamCatalog.map((t) => [t.name, t]))
    return favoriteTeams
      .map((name) => map.get(name))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
  }, [favoriteTeams, teamCatalog])

  const followedTeamUpcomingMatches = useMemo(
    () =>
      prioritisedMatches.filter(
        (m) =>
          m.status === 'upcoming' &&
          (favoriteTeamSet.has(m.home_team) ||
            favoriteTeamSet.has(m.away_team)),
      ),
    [favoriteTeamSet, prioritisedMatches],
  )

  const followedTeamResultMatches = useMemo(
    () =>
      prioritisedMatches.filter(
        (m) =>
          (m.status === 'live' || m.status === 'finished') &&
          (favoriteTeamSet.has(m.home_team) ||
            favoriteTeamSet.has(m.away_team)),
      ),
    [favoriteTeamSet, prioritisedMatches],
  )

  const filteredDiscoveryTeams = useMemo(() => {
    const q = teamSearchQuery.trim().toLowerCase()
    return teamCatalog.filter((team) => {
      if (teamSportFilter !== 'all' && team.sportId !== teamSportFilter) {
        return false
      }
      if (!q) return true
      return (
        team.name.toLowerCase().includes(q) ||
        team.sportName.toLowerCase().includes(q) ||
        team.league.toLowerCase().includes(q)
      )
    })
  }, [teamCatalog, teamSearchQuery, teamSportFilter])

  const remindedMatches = useMemo(
    () => matches.filter((m) => remindedIds.has(m.id)),
    [matches, remindedIds],
  )

  const firstLiveMatchGlobal = useMemo(
    () => globalLiveMatches[0] ?? matches[0] ?? null,
    [globalLiveMatches, matches],
  )

  const handleOpenMatchCenter = useCallback(
    async (tab: 'live' | 'upcoming' | 'finished' | 'all') => {
      setMatchCenterTab(tab)
      try {
        const supabase = createClient()
        const latest = await fetchMatchesFromSupabase(supabase)
        if (latest.length > 0) {
          setMatches(latest)
        }
      } catch {
        // Keep current loaded matches if refresh fails
      }
    },
    [],
  )

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    item: (typeof navItems)[number],
  ) => {
    if (item.id === 'scores') {
      e.preventDefault()
      void handleOpenMatchCenter('finished')
    } else if (item.id === 'pricing') {
      e.preventDefault()
      setActiveNavId('pricing')
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setActiveNavId(item.id)
    }
    setMobileNav(false)
  }

  return (
    <main
      id="top"
      className="min-h-screen overflow-x-clip bg-[#f5f7fa] text-[#0b1220] transition-colors duration-200 dark:bg-[#0b1220] dark:text-white"
    >
      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl transition-colors duration-200 dark:border-white/10 dark:bg-[#0b1220]/85">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-5 lg:px-8">
          <Brand />

          <nav
            className="hidden items-center gap-4 xl:gap-6 lg:flex"
            aria-label="Primary navigation"
          >
            {navItems.map((item) => {
              const isActive = activeNavId === item.id
              return (
                <a
                  key={item.id}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold transition hover:text-[#0f7a06] dark:hover:text-[#39ff14] ${
                    isActive
                      ? 'text-[#0f7a06] dark:text-[#39ff14]'
                      : 'text-slate-600 dark:text-white/70'
                  }`}
                >
                  {item.label}
                  {item.id === 'live' && globalLiveMatches.length > 0 && (
                    <span
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0f7a06] dark:bg-[#39ff14]"
                      aria-hidden="true"
                    />
                  )}
                  {item.id === 'my-teams' && favoriteTeams.length > 0 && (
                    <span className="rounded-full bg-[#39ff14]/25 px-1.5 py-0.5 text-[10px] font-black text-[#0f7a06] dark:bg-[#39ff14]/20 dark:text-[#39ff14]">
                      {favoriteTeams.length}
                    </span>
                  )}
                </a>
              )
            })}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen((prev) => !prev)}
              aria-expanded={searchOpen}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition sm:h-11 sm:w-11 ${
                searchOpen
                  ? 'bg-[#39ff14]/20 text-[#0f7a06] dark:text-[#39ff14]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-[#0b1220] dark:text-white/75 dark:hover:bg-white/10 dark:hover:text-white'
              }`}
              aria-label="Search SPORTIVRA"
            >
              <Search size={19} />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                theme === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
              title={
                theme === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100/80 text-slate-700 transition hover:border-[#0f7a06]/50 hover:bg-slate-200/80 hover:text-[#0b1220] sm:h-11 sm:w-11 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:border-[#39ff14]/45 dark:hover:bg-white/10 dark:hover:text-[#39ff14]"
            >
              <Sun size={18} className="hidden dark:block" />
              <Moon size={18} className="block dark:hidden" />
            </button>

            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => setAuthModalMode('account')}
                  aria-label="Open account"
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#0f7a06]/40 bg-[#39ff14]/20 text-[#0b1220] sm:hidden dark:border-[#39ff14]/40 dark:bg-[#39ff14]/15 dark:text-white"
                >
                  <UserIcon
                    size={16}
                    className="text-[#0f7a06] dark:text-[#39ff14]"
                  />
                  {remindedIds.size > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#39ff14] px-1 text-[9px] font-black text-[#0b1220]">
                      {remindedIds.size}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthModalMode('account')}
                  className="hidden min-h-11 items-center gap-2 rounded-full border border-[#0f7a06]/40 bg-[#39ff14]/20 px-4 text-sm font-semibold text-[#0b1220] transition hover:bg-[#39ff14]/30 sm:flex dark:border-[#39ff14]/40 dark:bg-[#39ff14]/10 dark:text-white dark:hover:bg-[#39ff14]/20"
                >
                  <UserIcon
                    size={15}
                    className="text-[#0f7a06] dark:text-[#39ff14]"
                  />
                  <span className="max-w-[140px] truncate">
                    {profile?.full_name || user.email || 'Account'}
                  </span>
                  {remindedIds.size > 0 && (
                    <span className="rounded-full bg-[#39ff14] px-1.5 py-0.5 text-[10px] font-black text-[#0b1220]">
                      {remindedIds.size}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPendingReminderMatchId(null)
                    setAuthModalMode('signin')
                  }}
                  className="flex min-h-10 items-center rounded-full border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-[#0b1220] sm:hidden dark:border-white/12 dark:bg-white/5 dark:text-white"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingReminderMatchId(null)
                    setAuthModalMode('signin')
                  }}
                  className="hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-[#0b1220] sm:flex dark:text-white/75 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingReminderMatchId(null)
                    setAuthModalMode('signup')
                  }}
                  className="hidden min-h-11 items-center gap-1.5 rounded-full bg-[#39ff14] px-5 text-sm font-bold text-[#0b1220] transition hover:bg-[#5cff3d] sm:flex dark:hover:bg-[#a8ff9d]"
                >
                  Join now <ArrowRight size={14} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setMobileNav((prev) => !prev)}
              aria-expanded={mobileNav}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-[#0b1220] sm:h-11 sm:w-11 lg:hidden dark:bg-white/8 dark:text-white"
              aria-label={mobileNav ? 'Close menu' : 'Open menu'}
            >
              {mobileNav ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-5 dark:border-white/10 dark:bg-[#0b1220]/95">
            <div className="mx-auto max-w-7xl">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 sm:px-4 dark:border-white/10 dark:bg-white/5">
                <Search
                  size={18}
                  className="shrink-0 text-slate-400 dark:text-white/40"
                />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sports, teams, players, or news..."
                  className="h-12 w-full bg-transparent text-base text-[#0b1220] outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/35"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setSearchResults(null)
                      setSearchError(null)
                    }}
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-200/70 hover:text-[#0b1220] dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  aria-label="Close search"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200/70 hover:text-[#0b1220] dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              {!searchQuery.trim() && sports.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-500 dark:text-white/50">
                    Quick filter:
                  </span>
                  {sports.slice(0, 6).map((sport) => (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => {
                        setSelectedSportSlug(sport.slug)
                        setSearchOpen(false)
                        document
                          .getElementById('live')
                          ?.scrollIntoView({ behavior: 'smooth' })
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-[#0b1220] transition hover:border-[#0f7a06] dark:border-white/12 dark:bg-white/5 dark:text-white/80 dark:hover:border-[#39ff14]"
                    >
                      <span>{sport.icon}</span>
                      <span>{sport.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.trim() && (
                <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none">
                  {searchLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-white/60">
                      <Loader2
                        size={14}
                        className="animate-spin text-[#0f7a06] dark:text-[#39ff14]"
                      />
                      Searching SPORTIVRA...
                    </div>
                  ) : searchError ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-[#ff3b45]/35 dark:bg-[#ff3b45]/10 dark:text-[#ff8b91]">
                      <span>{searchError}</span>
                      <button
                        type="button"
                        onClick={() => void runSearch(searchQuery)}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 font-bold text-[#0b1220] shadow-sm dark:bg-[#0b1220] dark:text-white"
                      >
                        <RefreshCw size={12} /> Retry
                      </button>
                    </div>
                  ) : searchResults &&
                    searchResults.sports.length === 0 &&
                    searchResults.matches.length === 0 &&
                    searchResults.highlights.length === 0 &&
                    searchResults.newsArticles.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-white/55">
                      No matching sports, matches, highlights, or articles were
                      found for &ldquo;{searchQuery.trim()}&rdquo;.
                    </p>
                  ) : (
                    searchResults && (
                      <div className="space-y-4">
                        {searchResults.sports.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#0f7a06] dark:text-[#39ff14]">
                              Sports
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {searchResults.sports.map((sport) => (
                                <button
                                  key={sport.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedSportSlug(sport.slug)
                                    setSearchOpen(false)
                                    document
                                      .getElementById('live')
                                      ?.scrollIntoView({ behavior: 'smooth' })
                                  }}
                                  className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-[#0b1220] hover:border-[#0f7a06] dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-[#39ff14]"
                                >
                                  {sport.icon} {sport.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {searchResults.matches.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#0f7a06] dark:text-[#39ff14]">
                              Matches
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {searchResults.matches.map((match) => (
                                <button
                                  key={match.id}
                                  type="button"
                                  onClick={() => {
                                    setMediaViewer({ kind: 'match', match })
                                    setSearchOpen(false)
                                  }}
                                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left hover:border-[#0f7a06]/60 dark:border-white/10 dark:bg-[#0b1220] dark:hover:border-[#39ff14]/60"
                                >
                                  <div>
                                    <p className="text-xs font-bold text-[#0b1220] dark:text-white">
                                      {match.headline
                                        ? `${match.headline} • `
                                        : ''}
                                      {match.home_team} vs {match.away_team}
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-white/50">
                                      {match.league}
                                    </p>
                                  </div>
                                  <span className="text-[10px] font-bold uppercase text-[#0f7a06] dark:text-[#39ff14]">
                                    {match.status}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {searchResults.highlights.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#0f7a06] dark:text-[#39ff14]">
                              Highlights
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {searchResults.highlights.map((h) => (
                                <button
                                  key={h.id}
                                  type="button"
                                  onClick={() => {
                                    setMediaViewer({
                                      kind: 'highlight',
                                      highlight: h,
                                    })
                                    setSearchOpen(false)
                                  }}
                                  className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left hover:border-[#0f7a06]/60 dark:border-white/10 dark:bg-[#0b1220] dark:hover:border-[#39ff14]/60"
                                >
                                  <p className="text-xs font-bold text-[#0b1220] dark:text-white">
                                    {h.title}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-white/50">
                                    {h.badge}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {searchResults.newsArticles.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#0f7a06] dark:text-[#39ff14]">
                              News
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {searchResults.newsArticles.map((article) => (
                                <button
                                  key={article.id}
                                  type="button"
                                  onClick={() => {
                                    setActiveArticle(article)
                                    setSearchOpen(false)
                                  }}
                                  className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left hover:border-[#0f7a06]/60 dark:border-white/10 dark:bg-[#0b1220] dark:hover:border-[#39ff14]/60"
                                >
                                  <p className="text-xs font-bold text-[#0b1220] dark:text-white">
                                    {article.title}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-white/50">
                                    {article.category} • {article.read_time}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {mobileNav && (
          <nav
            aria-label="Mobile navigation"
            className="border-t border-slate-200 bg-white px-5 py-4 lg:hidden dark:border-white/10 dark:bg-[#0b1220]"
          >
            {navItems.map((item) => {
              const isActive = activeNavId === item.id
              return (
                <a
                  key={item.id}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item)}
                  className={`flex min-h-11 items-center justify-between border-b border-slate-200 text-sm font-semibold last:border-0 dark:border-white/8 ${
                    isActive
                      ? 'text-[#0f7a06] dark:text-[#39ff14]'
                      : 'text-slate-700 dark:text-white/80'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === 'live' && globalLiveMatches.length > 0 && (
                    <span className="rounded-full bg-[#ff3b45] px-2 py-0.5 text-[10px] font-black uppercase text-white">
                      {globalLiveMatches.length} Live
                    </span>
                  )}
                  {item.id === 'my-teams' && favoriteTeams.length > 0 && (
                    <span className="rounded-full bg-[#39ff14]/25 px-2 py-0.5 text-[10px] font-black text-[#0f7a06] dark:bg-[#39ff14]/20 dark:text-[#39ff14]">
                      {favoriteTeams.length} following
                    </span>
                  )}
                </a>
              )
            })}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-white/10">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-4 text-xs font-semibold text-[#0b1220] dark:border-white/15 dark:bg-white/5 dark:text-white"
              >
                <Sun size={14} className="hidden text-[#39ff14] dark:block" />
                <Moon size={14} className="block text-[#0b1220] dark:hidden" />
                <span className="hidden dark:inline">Light mode</span>
                <span className="inline dark:hidden">Dark mode</span>
              </button>

              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileNav(false)
                    setAuthModalMode('account')
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-[#39ff14] px-5 text-xs font-bold text-[#0b1220]"
                >
                  <UserIcon size={14} /> Account ({remindedIds.size}{' '}
                  {remindedIds.size === 1 ? 'reminder' : 'reminders'})
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNav(false)
                      setAuthModalMode('signin')
                    }}
                    className="flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-xs font-semibold text-[#0b1220] dark:border-white/15 dark:text-white"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNav(false)
                      setAuthModalMode('signup')
                    }}
                    className="flex min-h-11 items-center rounded-full bg-[#39ff14] px-5 text-xs font-bold text-[#0b1220]"
                  >
                    Join now
                  </button>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* SECTION 1: Hero + Integrated Live Scoreboard Ticker Strip */}
      <section className="hero relative flex flex-col justify-between overflow-hidden">
        <picture className="pointer-events-none absolute inset-0 block h-full w-full">
          <source
            media="(max-width: 767px)"
            srcSet="/images/hero-multi-sport-mobile.webp"
            type="image/webp"
          />
          <source srcSet="/images/hero-multi-sport.webp" type="image/webp" />
          <img
            src="/images/hero-multi-sport.jpg"
            alt="Multi-sport international stadium featuring football in the centre, basketball on the left, and tennis and cricket on the right"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-[46%_22%] sm:object-[50%_22%] lg:object-[54%_20%]"
          />
        </picture>
        <div className="hero-scrim-light" aria-hidden="true" />
        <div className="hero-scrim-dark" aria-hidden="true" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-5 pb-8 pt-16 sm:pb-10 sm:pt-20 lg:px-8">
          <div className="max-w-2xl">
            <div className="mb-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.25em] text-[#0f7a06] dark:text-[#39ff14]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#0f7a06] dark:bg-[#39ff14]" />{' '}
              The world of sport, in one place
            </div>
            <h1 className="max-w-xl text-4xl font-black leading-[0.98] tracking-[-0.04em] text-[#0b1220] sm:text-6xl lg:text-7xl dark:text-white">
              ALL SPORTS.
              <br />
              <span className="text-[#0f7a06] dark:text-[#39ff14]">LIVE</span>{' '}
              AND
              <br />
              ON DEMAND.
            </h1>
            <p className="mt-4 max-w-lg text-sm font-medium leading-6 text-slate-700 sm:mt-5 sm:text-base sm:leading-7 dark:font-normal dark:text-white/85">
              Watch live sports, check final scores, set kick-off reminders, and
              follow your favourite teams and sports — all in one place.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  if (firstLiveMatchGlobal) {
                    setMediaViewer({ kind: 'match', match: firstLiveMatchGlobal })
                  } else {
                    void handleOpenMatchCenter('live')
                  }
                }}
                className="flex min-h-12 items-center gap-2 rounded-full bg-[#128a07] px-6 text-sm font-bold text-white shadow-md shadow-emerald-950/15 transition hover:scale-[1.02] hover:bg-[#0f7a06] dark:bg-[#39ff14] dark:text-[#0b1220] dark:shadow-none dark:hover:bg-[#a8ff9d]"
              >
                <Play size={16} fill="currentColor" /> Watch now
              </button>
              <a
                href="#sports"
                className="flex min-h-12 items-center gap-2 rounded-full border border-[#0f7a06]/40 bg-white/90 px-6 text-sm font-bold text-[#0f7a06] shadow-sm backdrop-blur transition hover:border-[#0f7a06] hover:bg-emerald-50 dark:border-white/25 dark:bg-white/10 dark:text-white dark:shadow-none dark:hover:border-[#39ff14]/60 dark:hover:bg-white/15"
              >
                Explore sports <ArrowRight size={16} />
              </a>
              <a
                href="#my-teams"
                className="flex min-h-12 items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-5 text-sm font-bold text-[#0b1220] shadow-sm backdrop-blur transition hover:border-[#0f7a06] dark:border-white/25 dark:bg-[#0b1220]/60 dark:text-white dark:shadow-none dark:hover:border-[#39ff14]/60 dark:hover:bg-[#0b1220]/80"
              >
                <Heart
                  size={15}
                  className="text-[#0f7a06] dark:text-[#39ff14]"
                />
                My Teams
                {favoriteTeams.length > 0 && (
                  <span className="rounded-full bg-[#128a07] px-2 py-0.5 text-[10px] font-black text-white dark:bg-[#39ff14] dark:text-[#0b1220]">
                    {favoriteTeams.length}
                  </span>
                )}
              </a>
            </div>
          </div>

          {/* Integrated Live Scoreboard Ticker Strip */}
          <div className="mt-10">
            {catalogLoading ? (
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4 dark:border-white/10 dark:bg-[#0e1727]/80 dark:shadow-none">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-[72px] animate-pulse rounded-xl bg-slate-200 dark:bg-white/5"
                  />
                ))}
              </div>
            ) : globalLiveMatches.length > 0 ? (
              <div className="grid gap-2 rounded-2xl border border-slate-200/90 bg-white/95 p-2.5 shadow-xl backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] dark:border-white/12 dark:bg-[#0e1727]/85 dark:shadow-2xl">
                {globalLiveMatches.slice(0, 3).map((match) => (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => setMediaViewer({ kind: 'match', match })}
                    className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/90 px-3.5 py-2.5 text-left transition hover:border-[#0f7a06]/50 hover:bg-white dark:border-white/8 dark:bg-[#0b1220]/70 dark:hover:border-[#39ff14]/50 dark:hover:bg-[#1f2937]/70"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider">
                      <span className="flex items-center gap-1.5 text-[#c81e28] dark:text-[#ff5c64]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b45]" />
                        LIVE
                      </span>
                      <span className="truncate text-slate-500 dark:text-white/45">
                        {match.sport?.name ?? 'Sport'} • {match.league}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 space-y-0.5 text-xs font-semibold text-[#0b1220] dark:text-white">
                        <p className="truncate">{match.home_team}</p>
                        <p className="truncate text-slate-600 dark:text-white/75">
                          {match.away_team}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-black tracking-tight text-[#0f7a06] dark:text-[#39ff14]">
                          {match.home_score} - {match.away_score}
                        </p>
                        {match.match_clock && (
                          <p className="text-[10px] font-bold text-[#c81e28] dark:text-[#ff8b91]">
                            {match.match_clock}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void handleOpenMatchCenter('all')}
                  className="flex min-h-[60px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 text-xs font-bold text-[#0b1220] transition hover:border-[#0f7a06]/50 hover:text-[#0f7a06] sm:col-span-2 lg:col-span-1 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-[#39ff14]/50 dark:hover:text-[#39ff14]"
                >
                  View all scores <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#0e1727]/85 dark:shadow-none">
                <p className="text-xs font-semibold text-slate-700 dark:text-white/70">
                  No live matches are active at the moment — check upcoming
                  kick-offs or final scores.
                </p>
                <button
                  type="button"
                  onClick={() => void handleOpenMatchCenter('all')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0f7a06] hover:underline dark:text-[#39ff14] dark:hover:text-[#a8ff9d]"
                >
                  Open match centre <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* First-Time Visitor Quick-Orientation & Section Jump Bar */}
      <div className="border-b border-slate-200 bg-white/95 px-4 py-3 lg:px-8 dark:border-white/8 dark:bg-[#0e1727]">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto pb-0.5">
          <span className="hidden shrink-0 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 sm:inline dark:text-white/40">
            Jump to
          </span>
          <a
            href="#live"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-[#0b1220] transition hover:border-[#0f7a06]/60 dark:border-white/12 dark:bg-white/5 dark:text-white/85 dark:hover:border-[#39ff14]/60"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b45]" />
            Live Sports ({globalLiveMatches.length})
          </a>
          <a
            href="#my-sports"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-[#0b1220] transition hover:border-[#0f7a06]/60 dark:border-white/12 dark:bg-white/5 dark:text-white/85 dark:hover:border-[#39ff14]/60"
          >
            <Sparkles size={12} className="text-[#0f7a06] dark:text-[#39ff14]" />
            Favourite Sports ({favoriteSportIds.length})
          </a>
          <a
            href="#my-teams"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-[#0b1220] transition hover:border-[#0f7a06]/60 dark:border-white/12 dark:bg-white/5 dark:text-white/85 dark:hover:border-[#39ff14]/60"
          >
            <Heart size={12} className="text-[#0f7a06] dark:text-[#39ff14]" />
            My Teams ({favoriteTeams.length})
          </a>
          <a
            href="#schedule"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-[#0b1220] transition hover:border-[#0f7a06]/60 dark:border-white/12 dark:bg-white/5 dark:text-white/85 dark:hover:border-[#39ff14]/60"
          >
            <Clock3 size={12} className="text-[#0f7a06] dark:text-[#39ff14]" />
            Upcoming ({matches.filter((m) => m.status === 'upcoming').length})
          </a>
          <button
            type="button"
            onClick={() => void handleOpenMatchCenter('finished')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-[#0b1220] transition hover:border-[#0f7a06]/60 dark:border-white/12 dark:bg-white/5 dark:text-white/85 dark:hover:border-[#39ff14]/60"
          >
            <Trophy size={12} className="text-[#0f7a06] dark:text-[#39ff14]" />
            Final Scores ({matches.filter((m) => m.status === 'finished').length})
          </button>
          <a
            href="#highlights"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-[#0b1220] transition hover:border-[#0f7a06]/60 dark:border-white/12 dark:bg-white/5 dark:text-white/85 dark:hover:border-[#39ff14]/60"
          >
            Highlights ({highlights.length})
          </a>
          <a
            href="#news"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-[#0b1220] transition hover:border-[#0f7a06]/60 dark:border-white/12 dark:bg-white/5 dark:text-white/85 dark:hover:border-[#39ff14]/60"
          >
            News ({newsArticles.length})
          </a>
        </div>
      </div>

      {catalogError && !catalogLoading && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-3 lg:px-8 dark:border-[#ff3b45]/30 dark:bg-[#ff3b45]/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-red-700 dark:text-[#ff8b91]">
              Some live sports data could not be loaded: {catalogError}
            </p>
            <button
              type="button"
              onClick={() => void retryCatalogLoad()}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#0b1220] shadow-sm transition hover:bg-slate-100 dark:bg-[#0b1220] dark:text-white dark:hover:bg-white/10"
            >
              <RefreshCw size={12} /> Retry loading
            </button>
          </div>
        </div>
      )}

      {selectedSport && (
        <div className="border-y border-slate-200 bg-white px-5 py-3 lg:px-8 dark:border-white/10 dark:bg-[#0e1727]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-700 dark:text-white/80">
              Filtering by {selectedSport.icon}{' '}
              <span className="font-bold text-[#0f7a06] dark:text-[#39ff14]">
                {selectedSport.name}
              </span>{' '}
              across live matches, final scores, schedule, highlights, and news.
            </p>
            <button
              type="button"
              onClick={() => setSelectedSportSlug(null)}
              className="flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-bold text-slate-700 transition hover:border-[#0f7a06] hover:text-[#0b1220] dark:border-white/15 dark:text-white/75 dark:hover:border-[#39ff14] dark:hover:text-white"
            >
              Show all <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* SECTION 2: Live on SPORTIVRA — Asymmetric Bento + Final Scores Ribbon */}
      <section
        id="live"
        className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 lg:px-8"
      >
        <SectionHeading
          eyebrow="Happening now"
          title="Live on SPORTIVRA"
          badge={
            <div className="flex flex-wrap items-center gap-2">
              {liveMatches.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff3b45] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  Live
                </span>
              )}
              {favoriteSportIds.length > 0 && !selectedSport && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0f7a06] dark:border-[#39ff14]/35 dark:bg-[#39ff14]/10 dark:text-[#39ff14]">
                  <Sparkles size={11} /> Prioritised for your sports
                </span>
              )}
            </div>
          }
          action="View all live"
          onAction={() => void handleOpenMatchCenter('live')}
        />

        {catalogLoading ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-h-[300px] animate-pulse rounded-2xl border border-slate-200 bg-slate-200/70 lg:col-span-2 dark:border-white/10 dark:bg-[#1f2937]/40" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="min-h-[142px] animate-pulse rounded-2xl border border-slate-200 bg-slate-200/70 dark:border-white/10 dark:bg-[#1f2937]/40" />
              <div className="min-h-[142px] animate-pulse rounded-2xl border border-slate-200 bg-slate-200/70 dark:border-white/10 dark:bg-[#1f2937]/40" />
            </div>
          </div>
        ) : liveMatches.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-[#1f2937]/40 dark:shadow-none">
            <p className="text-sm text-slate-600 dark:text-white/65">
              No live {selectedSport ? `${selectedSport.name} ` : ''}events are
              currently active.
            </p>
            {selectedSport && (
              <button
                type="button"
                onClick={() => setSelectedSportSlug(null)}
                className="mt-4 rounded-full bg-[#39ff14] px-5 py-2 text-xs font-bold text-[#0b1220]"
              >
                View all sports
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {featuredLive && (
              <article className="live-feature group relative min-h-[320px] overflow-hidden rounded-2xl bg-[#0b1220] text-white lg:col-span-2">
                {featuredLive.image_url && (
                  <img
                    src={featuredLive.image_url}
                    alt={
                      featuredLive.image_alt ??
                      `${featuredLive.home_team} vs ${featuredLive.away_team}`
                    }
                    className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/55 to-[#0b1220]/20" />
                <div className="relative flex h-full min-h-[320px] flex-col justify-between p-5 sm:p-7">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex w-fit items-center gap-2 rounded-full bg-[#ff3b45] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        Live{featuredLive.match_clock ? ` • ${featuredLive.match_clock}` : ''}
                      </span>
                      {featuredLive.access_tier === 'premium' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#39ff14]/45 bg-[#0b1220]/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#39ff14] backdrop-blur">
                          <Lock size={10} /> Premium
                        </span>
                      )}
                    </div>
                    <span className="rounded-full border border-white/15 bg-[#0b1220]/70 px-3 py-1 text-[11px] font-semibold text-white/85 backdrop-blur">
                      {featuredLive.league}
                    </span>
                  </div>

                  <div>
                    {featuredLive.headline ? (
                      <h3 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                        {featuredLive.headline}
                      </h3>
                    ) : (
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-[#0b1220]/80 text-sm font-black text-white">
                            {featuredLive.home_team[0]}
                          </span>
                          <span className="truncate text-base font-bold text-white sm:text-xl">
                            {featuredLive.home_team}
                          </span>
                        </div>
                        <span className="rounded-xl bg-[#0b1220]/80 px-3.5 py-1.5 text-2xl font-black tracking-tight text-white backdrop-blur sm:text-3xl">
                          {featuredLive.home_score} — {featuredLive.away_score}
                        </span>
                        <div className="flex items-center justify-end gap-2.5 text-right">
                          <span className="truncate text-base font-bold text-white sm:text-xl">
                            {featuredLive.away_team}
                          </span>
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-[#0b1220]/80 text-sm font-black text-white">
                            {featuredLive.away_team[0]}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-white/15 pt-4">
                      <div className="flex items-center gap-3">
                        <span className="h-1 w-20 rounded-full bg-[#39ff14]" />
                        <span className="text-xs font-semibold text-white/80">
                          {featuredLive.sport?.name ?? 'Live broadcast'}
                          {featuredLive.headline
                            ? ` • ${featuredLive.home_score} — ${featuredLive.away_score}`
                            : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setMediaViewer({ kind: 'match', match: featuredLive })
                        }
                        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#39ff14] px-5 text-xs font-bold text-[#0b1220] transition hover:bg-[#a8ff9d]"
                      >
                        <Play size={14} fill="currentColor" /> Watch live
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {secondaryLive.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {secondaryLive.map((match) => (
                  <article
                    key={match.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setMediaViewer({ kind: 'match', match })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setMediaViewer({ kind: 'match', match })
                      }
                    }}
                    className="group flex min-h-[152px] cursor-pointer flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#0f7a06]/50 dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none dark:hover:border-[#39ff14]/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff3b45] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          Live
                        </span>
                        {match.access_tier === 'premium' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800 dark:border-[#39ff14]/45 dark:bg-[#39ff14]/15 dark:text-[#39ff14]">
                            <Lock size={9} /> Premium
                          </span>
                        )}
                      </div>
                      <span className="truncate text-[11px] font-semibold text-slate-500 dark:text-white/55">
                        {match.match_clock ? `${match.match_clock} • ` : ''}
                        {match.league}
                      </span>
                    </div>

                    <div className="my-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-[#0b1220] transition group-hover:text-[#0f7a06] dark:text-white dark:group-hover:text-[#39ff14]">
                          {match.headline ||
                            `${match.home_team} vs ${match.away_team}`}
                        </h3>
                        <p className="mt-1 text-xl font-black tracking-tight text-[#0b1220] dark:text-white">
                          {match.home_score} — {match.away_score}
                        </p>
                      </div>

                      {match.image_url ? (
                        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-[#0b1220]">
                          <img
                            src={match.image_url}
                            alt={
                              match.image_alt ??
                              `${match.home_team} vs ${match.away_team}`
                            }
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-xl dark:border-white/10 dark:bg-[#0b1220]">
                          {match.sport?.icon ?? '◉'}
                        </div>
                      )}
                    </div>

                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0f7a06] dark:text-[#39ff14]">
                      Watch live <ArrowRight size={13} />
                    </span>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Final Scores Ribbon */}
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between dark:border-white/10 dark:bg-[#0e1727]/90 dark:shadow-none">
          <button
            type="button"
            onClick={() => void handleOpenMatchCenter('finished')}
            className="inline-flex shrink-0 items-center gap-2 text-xs font-bold text-[#0b1220] transition hover:text-[#0f7a06] dark:text-white dark:hover:text-[#39ff14]"
          >
            <span className="h-2 w-2 rounded-full bg-[#39ff14]" />
            Final scores{' '}
            <ArrowRight
              size={13}
              className="text-[#0f7a06] dark:text-[#39ff14]"
            />
          </button>

          {catalogLoading ? (
            <div className="h-7 flex-1 animate-pulse rounded-lg bg-slate-200 dark:bg-white/5" />
          ) : finishedMatches.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-white/55">
              No recent final scores are available for{' '}
              {selectedSport ? selectedSport.name : 'this view'}.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {finishedMatches.map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => setMediaViewer({ kind: 'match', match })}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs transition hover:border-[#0f7a06]/50 dark:border-white/10 dark:bg-[#0b1220] dark:hover:border-[#39ff14]/50"
                >
                  <span className="text-slate-500 dark:text-white/50">
                    {match.sport?.name ?? 'Sport'}
                  </span>
                  <span className="font-semibold text-[#0b1220] dark:text-white">
                    {match.home_team}{' '}
                    <span className="mx-1 font-black text-[#0f7a06] dark:text-[#39ff14]">
                      {match.home_score} - {match.away_score}
                    </span>{' '}
                    {match.away_team}
                  </span>
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-white/75">
                    {match.match_clock ?? 'FT'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3: Explore Sports */}
      <section
        id="sports"
        className="scroll-mt-20 border-y border-slate-200 bg-white px-5 py-16 lg:px-8 dark:border-white/6 dark:bg-[#0e1727]"
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Find your game"
            title="Explore sports"
            badge={
              <span className="text-xs font-medium text-slate-500 dark:text-white/50">
                Select a sport to filter the page, or save your favourites below.
              </span>
            }
            action={selectedSport ? 'Show all sports' : 'All sports'}
            onAction={() => {
              if (selectedSport) {
                setSelectedSportSlug(null)
              } else {
                void handleOpenMatchCenter('all')
              }
            }}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {catalogLoading
              ? Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="min-h-[172px] animate-pulse rounded-2xl border border-slate-200 bg-slate-200/70 dark:border-white/10 dark:bg-[#1f2937]/40"
                  />
                ))
              : sports.map((sport) => {
                  const isSelected = selectedSportSlug === sport.slug
                  const isFav = favoriteSportIdSet.has(sport.id)
                  return (
                    <button
                      type="button"
                      key={sport.id}
                      aria-pressed={isSelected}
                      onClick={() =>
                        setSelectedSportSlug((prev) =>
                          prev === sport.slug ? null : sport.slug,
                        )
                      }
                      className={`sport-tile flex flex-col justify-between bg-gradient-to-br text-left ${sport.gradient_class} ${
                        isSelected
                          ? 'ring-2 ring-[#0f7a06] dark:ring-[#39ff14]'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#0b1220]/10 bg-[#0b1220] dark:border-[#39ff14]/25 dark:bg-[#0b1220]/70">
                          <SportLineIcon
                            slug={sport.slug}
                            fallback={sport.icon}
                          />
                        </span>
                        <div className="flex items-center gap-1">
                          {isFav && (
                            <span className="rounded-full bg-[#39ff14] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#0b1220]">
                              Saved
                            </span>
                          )}
                          <ChevronRight
                            size={15}
                            className={
                              isSelected
                                ? 'text-[#0f7a06] dark:text-[#39ff14]'
                                : 'text-slate-400 dark:text-white/40'
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-6">
                        <h3 className="font-bold text-[#0b1220] dark:text-white">
                          {sport.name}
                        </h3>
                        <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-white/60">
                          {getSportSubtitle(sport.slug)}
                        </p>
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-[#0f7a06] dark:text-[#39ff14]/85">
                          {formatEventCount(sport.event_count)}
                        </p>
                      </div>
                    </button>
                  )
                })}
          </div>

          {/* Personalised Sports Selector & Spotlight */}
          <div
            id="my-sports"
            className="mt-12 scroll-mt-24 rounded-2xl border border-slate-200 bg-[#f5f7fa] p-5 sm:p-6 dark:border-white/10 dark:bg-[#0b1220]/75"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0f7a06] dark:text-[#39ff14]">
                    Personalise your feed
                  </p>
                  <span className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/65">
                    {user
                      ? 'Saved to your account'
                      : 'Saved locally • Sign in to sync'}
                  </span>
                </div>
                <h3 className="mt-1.5 text-xl font-bold tracking-tight text-[#0b1220] sm:text-2xl dark:text-white">
                  Your favourite sports
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-white/60">
                  Select one or more sports to prioritise their live matches,
                  upcoming schedule, highlights, and news across SPORTIVRA.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {favoriteSportIds.length > 0 && (
                  <button
                    type="button"
                    onClick={clearFavoriteSports}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:border-red-300 hover:text-red-700 dark:border-white/15 dark:bg-white/5 dark:text-white/75 dark:hover:border-[#ff3b45]/50 dark:hover:text-[#ff8b91]"
                  >
                    <X size={13} /> Clear selection
                  </button>
                )}
                {!user && (
                  <button
                    type="button"
                    onClick={() => setAuthModalMode('signin')}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#39ff14] px-4 text-xs font-bold text-[#0b1220] transition hover:bg-[#5cff3d] dark:hover:bg-[#a8ff9d]"
                  >
                    Sign in to sync
                  </button>
                )}
              </div>
            </div>

            {catalogLoading ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-10 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-white/10"
                  />
                ))}
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap gap-2.5">
                {sports.map((sport) => {
                  const isFav = favoriteSportIdSet.has(sport.id)
                  return (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => toggleFavoriteSport(sport.id)}
                      aria-pressed={isFav}
                      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition ${
                        isFav
                          ? 'border-[#0f7a06] bg-[#39ff14] text-[#0b1220] shadow-sm dark:border-[#39ff14]'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-[#0f7a06]/60 hover:text-[#0b1220] dark:border-white/15 dark:bg-[#0e1727] dark:text-white/80 dark:hover:border-[#39ff14]/55 dark:hover:text-white'
                      }`}
                    >
                      <span>{sport.icon}</span>
                      <span>{sport.name}</span>
                      {isFav ? <Check size={13} /> : <Plus size={13} />}
                    </button>
                  )
                })}
              </div>
            )}

            {favoriteSportsList.length > 0 && (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {favoriteSportsList.map((sport) => {
                  const liveCount = matches.filter(
                    (m) => m.sport_id === sport.id && m.status === 'live',
                  ).length
                  const upcomingCount = matches.filter(
                    (m) => m.sport_id === sport.id && m.status === 'upcoming',
                  ).length
                  const highlightCount = highlights.filter(
                    (h) => h.sport_id === sport.id,
                  ).length
                  const newsCount = newsArticles.filter(
                    (a) => a.sport_id === sport.id,
                  ).length

                  return (
                    <div
                      key={sport.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#0b1220]/10 bg-[#0b1220] dark:border-[#39ff14]/25">
                            <SportLineIcon
                              slug={sport.slug}
                              fallback={sport.icon}
                            />
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-[#0b1220] dark:text-white">
                                {sport.name}
                              </h4>
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0f7a06] dark:bg-[#39ff14]/15 dark:text-[#39ff14]">
                                Prioritised
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/55">
                              {getSportSubtitle(sport.slug)}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleFavoriteSport(sport.id)}
                          aria-label={`Remove ${sport.name} from favourite sports`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-red-600 dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-[#ff8b91]"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-white/70">
                        {liveCount > 0 && (
                          <span className="rounded-md bg-red-50 px-2 py-0.5 font-bold text-[#c81e28] dark:bg-[#ff3b45]/15 dark:text-[#ff8b91]">
                            {liveCount} live
                          </span>
                        )}
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-white/5">
                          {upcomingCount} upcoming
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-white/5">
                          {highlightCount}{' '}
                          {highlightCount === 1 ? 'highlight' : 'highlights'}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-white/5">
                          {newsCount} {newsCount === 1 ? 'article' : 'articles'}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-white/8">
                        <span className="text-[11px] font-medium text-slate-500 dark:text-white/45">
                          {formatEventCount(sport.event_count)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSportSlug(sport.slug)
                            document
                              .getElementById('live')
                              ?.scrollIntoView({ behavior: 'smooth' })
                          }}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#0f7a06] hover:underline dark:text-[#39ff14]"
                        >
                          Filter {sport.name} <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 3B: My Teams — Followed Teams, Fixtures & Available Results */}
      <section
        id="my-teams"
        className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 lg:px-8"
      >
        <SectionHeading
          eyebrow="Personal watchlist"
          title="My Teams"
          badge={
            <div className="flex flex-wrap items-center gap-2">
              {favoriteTeams.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0f7a06] dark:border-[#39ff14]/35 dark:bg-[#39ff14]/15 dark:text-[#39ff14]">
                  <Heart size={11} /> {favoriteTeams.length} following
                </span>
              )}
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:border-white/12 dark:bg-white/5 dark:text-white/60">
                {user ? 'Synced to profile' : 'Saved locally until sign-in'}
              </span>
            </div>
          }
          action={
            favoriteTeams.length > 0
              ? teamBrowserOpen
                ? 'Hide team directory'
                : 'Manage teams'
              : undefined
          }
          onAction={
            favoriteTeams.length > 0
              ? () => setTeamBrowserOpen((prev) => !prev)
              : undefined
          }
        />

        {catalogLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="min-h-[164px] animate-pulse rounded-2xl border border-slate-200 bg-slate-200/70 dark:border-white/10 dark:bg-[#1f2937]/40"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {followedTeamCatalog.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#0e1727]/85 dark:shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-[#0f7a06] dark:border-[#39ff14]/30 dark:bg-[#39ff14]/10 dark:text-[#39ff14]">
                      <Users size={20} />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-[#0b1220] dark:text-white">
                        Follow your favourite teams
                      </h3>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-white/60">
                        Choose any club, national team, or athlete from live and
                        scheduled SPORTIVRA events below to track their fixtures
                        and results in one place.
                      </p>
                    </div>
                  </div>
                  {!user && (
                    <button
                      type="button"
                      onClick={() => setAuthModalMode('signin')}
                      className="rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-bold text-[#0b1220] transition hover:border-[#0f7a06] dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-[#39ff14]"
                    >
                      Sign in to sync across devices
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {followedTeamCatalog.map((team) => {
                    const live = team.liveMatch
                    const nextUpcoming = team.upcomingMatches[0] ?? null
                    const latestFinished = team.finishedMatches[0] ?? null

                    return (
                      <article
                        key={team.name}
                        className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#0f7a06]/45 dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none dark:hover:border-[#39ff14]/45"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-base font-black text-[#0b1220] dark:border-white/15 dark:bg-white/8 dark:text-white">
                              {team.name[0]}
                            </span>
                            <div className="min-w-0">
                              <h3 className="truncate text-base font-bold text-[#0b1220] dark:text-white">
                                {team.name}
                              </h3>
                              <p className="truncate text-xs text-slate-500 dark:text-white/55">
                                {team.sportIcon} {team.sportName} • {team.league}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleFollowTeam(team.name)}
                            aria-pressed="true"
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#0f7a06] bg-[#39ff14] px-3.5 py-1.5 text-xs font-bold text-[#0b1220] transition hover:bg-[#5cff3d] dark:border-[#39ff14] dark:hover:bg-[#a8ff9d]"
                          >
                            <Check size={13} /> Following
                          </button>
                        </div>

                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-white/8 dark:bg-[#0b1220]/70">
                          {live ? (
                            <button
                              type="button"
                              onClick={() =>
                                setMediaViewer({ kind: 'match', match: live })
                              }
                              className="flex w-full items-center justify-between gap-2 text-left"
                            >
                              <span className="inline-flex items-center gap-1.5 font-bold text-[#c81e28] dark:text-[#ff8b91]">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff3b45]" />
                                LIVE {live.match_clock ?? ''}
                              </span>
                              <span className="truncate font-semibold text-[#0b1220] dark:text-white">
                                {live.home_team} {live.home_score} -{' '}
                                {live.away_score} {live.away_team}
                              </span>
                            </button>
                          ) : nextUpcoming ? (
                            <button
                              type="button"
                              onClick={() =>
                                setMediaViewer({
                                  kind: 'match',
                                  match: nextUpcoming,
                                })
                              }
                              className="flex w-full items-center justify-between gap-2 text-left"
                            >
                              <span className="font-bold text-[#0f7a06] dark:text-[#39ff14]">
                                {formatMatchDayLabel(
                                  nextUpcoming.kickoff_at,
                                  serverDateUtc,
                                )}{' '}
                                {formatUtcTime(nextUpcoming.kickoff_at)}
                              </span>
                              <span className="truncate font-semibold text-[#0b1220] dark:text-white">
                                {nextUpcoming.home_team} vs{' '}
                                {nextUpcoming.away_team}
                              </span>
                            </button>
                          ) : latestFinished ? (
                            <button
                              type="button"
                              onClick={() =>
                                setMediaViewer({
                                  kind: 'match',
                                  match: latestFinished,
                                })
                              }
                              className="flex w-full items-center justify-between gap-2 text-left"
                            >
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-white/10 dark:text-white/75">
                                {latestFinished.match_clock ?? 'FT'}
                              </span>
                              <span className="truncate font-semibold text-[#0b1220] dark:text-white">
                                {latestFinished.home_team}{' '}
                                {latestFinished.home_score} -{' '}
                                {latestFinished.away_score}{' '}
                                {latestFinished.away_team}
                              </span>
                            </button>
                          ) : (
                            <span className="text-slate-500 dark:text-white/50">
                              No matches recorded yet.
                            </span>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>

                {/* Upcoming Matches & Results for Followed Teams */}
                <div className="space-y-6">
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-[#0b1220] dark:text-white">
                        Upcoming matches for your teams (
                        {followedTeamUpcomingMatches.length})
                      </h3>
                    </div>
                    {followedTeamUpcomingMatches.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-600 shadow-sm dark:border-white/10 dark:bg-[#0e1727]/60 dark:text-white/60 dark:shadow-none">
                        No upcoming matches are currently scheduled for your
                        followed teams.
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-3">
                        {followedTeamUpcomingMatches.map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            isReminded={remindedIds.has(match.id)}
                            isSaving={savingReminderId === match.id}
                            favoriteTeams={favoriteTeamSet}
                            serverDateUtc={serverDateUtc}
                            onToggleReminder={(id) => void toggleReminder(id)}
                            onToggleFollowTeam={toggleFollowTeam}
                            onOpenMatch={(m) =>
                              setMediaViewer({ kind: 'match', match: m })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-[#0b1220] dark:text-white">
                        Live &amp; available results for your teams (
                        {followedTeamResultMatches.length})
                      </h3>
                    </div>
                    {followedTeamResultMatches.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-600 shadow-sm dark:border-white/10 dark:bg-[#0e1727]/60 dark:text-white/60 dark:shadow-none">
                        No live matches or completed results are recorded yet
                        for your followed teams.
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {followedTeamResultMatches.map((match) => (
                          <article
                            key={match.id}
                            className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#0f7a06]/50 sm:flex-row sm:items-center dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none dark:hover:border-[#39ff14]/50"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">
                                <span>
                                  {match.sport?.icon} {match.sport?.name}
                                </span>
                                <span>•</span>
                                <span className="truncate">{match.league}</span>
                                {match.status === 'live' ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[#ff3b45] px-2 py-0.5 text-white">
                                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                    LIVE {match.match_clock ?? ''}
                                  </span>
                                ) : (
                                  <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-700 dark:bg-white/10 dark:text-white/80">
                                    {match.match_clock ?? 'FT'}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-bold text-[#0b1220] sm:text-base dark:text-white">
                                {match.home_team}{' '}
                                <span className="mx-1.5 font-black text-[#0f7a06] dark:text-[#39ff14]">
                                  {match.home_score} — {match.away_score}
                                </span>{' '}
                                {match.away_team}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setMediaViewer({ kind: 'match', match })
                              }
                              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#39ff14] px-4 text-xs font-bold text-[#0b1220] transition hover:bg-[#5cff3d] dark:hover:bg-[#a8ff9d]"
                            >
                              <Play size={13} fill="currentColor" />{' '}
                              {match.status === 'live'
                                ? 'Watch live'
                                : 'Match details'}
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Discover & Follow Teams Directory (always open when 0 teams followed, or toggled via Manage teams) */}
            {(favoriteTeams.length === 0 || teamBrowserOpen) && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-[#0e1727]/85 dark:shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal
                      size={16}
                      className="text-[#0f7a06] dark:text-[#39ff14]"
                    />
                    <h3 className="text-base font-bold text-[#0b1220] dark:text-white">
                      Discover teams from SPORTIVRA competitions
                    </h3>
                  </div>

                  <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 sm:w-72 dark:border-white/12 dark:bg-[#0b1220]">
                    <Search
                      size={15}
                      className="text-slate-400 dark:text-white/40"
                    />
                    <input
                      type="text"
                      value={teamSearchQuery}
                      onChange={(e) => setTeamSearchQuery(e.target.value)}
                      placeholder="Filter teams or leagues..."
                      className="h-10 w-full bg-transparent text-xs text-[#0b1220] outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/35"
                    />
                    {teamSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setTeamSearchQuery('')}
                        aria-label="Clear team search"
                        className="text-slate-400 hover:text-[#0b1220] dark:text-white/45 dark:hover:text-white"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTeamSportFilter('all')}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                      teamSportFilter === 'all'
                        ? 'border-[#0f7a06] bg-[#39ff14] text-[#0b1220] dark:border-[#39ff14]'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0f7a06]/50 dark:border-white/12 dark:bg-[#0b1220] dark:text-white/75 dark:hover:border-[#39ff14]/50'
                    }`}
                  >
                    All sports
                  </button>
                  {sports.map((sport) => (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => setTeamSportFilter(sport.id)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                        teamSportFilter === sport.id
                          ? 'border-[#0f7a06] bg-[#39ff14] text-[#0b1220] dark:border-[#39ff14]'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0f7a06]/50 dark:border-white/12 dark:bg-[#0b1220] dark:text-white/75 dark:hover:border-[#39ff14]/50'
                      }`}
                    >
                      {sport.icon} {sport.name}
                    </button>
                  ))}
                </div>

                {filteredDiscoveryTeams.length === 0 ? (
                  <p className="mt-5 text-xs text-slate-500 dark:text-white/55">
                    No teams match your current filter.
                  </p>
                ) : (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredDiscoveryTeams.map((team) => {
                      const isFollowing = favoriteTeamSet.has(team.name)
                      const statusLabel = team.liveMatch
                        ? `Live • ${team.liveMatch.home_score}-${team.liveMatch.away_score}`
                        : team.upcomingMatches[0]
                          ? `Next • ${formatMatchDayLabel(team.upcomingMatches[0].kickoff_at, serverDateUtc)}`
                          : team.finishedMatches[0]
                            ? `Result • ${team.finishedMatches[0].home_score}-${team.finishedMatches[0].away_score}`
                            : 'Active squad'

                      return (
                        <div
                          key={team.name}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-white/10 dark:bg-[#0b1220]"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-black text-[#0b1220] dark:border-white/15 dark:bg-white/8 dark:text-white">
                              {team.name[0]}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-[#0b1220] dark:text-white">
                                {team.name}
                              </p>
                              <p className="truncate text-[11px] text-slate-500 dark:text-white/50">
                                {team.sportIcon} {team.sportName} • {statusLabel}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleFollowTeam(team.name)}
                            aria-pressed={isFollowing}
                            className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-xs font-bold transition ${
                              isFollowing
                                ? 'border-[#0f7a06] bg-[#39ff14] text-[#0b1220] hover:bg-[#5cff3d] dark:border-[#39ff14] dark:hover:bg-[#a8ff9d]'
                                : 'border-slate-300 bg-white text-[#0b1220] hover:border-[#0f7a06] hover:bg-[#39ff14]/15 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-[#39ff14]/60 dark:hover:bg-[#39ff14]/15'
                            }`}
                          >
                            {isFollowing ? (
                              <>
                                <Check size={12} /> Following
                              </>
                            ) : (
                              <>
                                <Plus size={12} /> Follow
                              </>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* SECTION 4: Upcoming Matches */}
      <section
        id="schedule"
        className="scroll-mt-20 border-t border-slate-200/80 px-5 py-16 lg:px-8 dark:border-white/6"
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Plan your watchlist"
            title="Upcoming matches"
            badge={
              favoriteSportIds.length > 0 && !selectedSport ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0f7a06] dark:border-[#39ff14]/35 dark:bg-[#39ff14]/10 dark:text-[#39ff14]">
                  <Sparkles size={11} /> Prioritised for your sports
                </span>
              ) : undefined
            }
            action="View full schedule"
            onAction={() => void handleOpenMatchCenter('upcoming')}
          />
          {catalogLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="min-h-[248px] animate-pulse rounded-2xl border border-slate-200 bg-slate-200/70 dark:border-white/10 dark:bg-[#1f2937]/40"
                />
              ))}
            </div>
          ) : upcomingMatches.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-[#1f2937]/40 dark:shadow-none">
              <p className="text-sm text-slate-600 dark:text-white/60">
                No upcoming {selectedSport ? `${selectedSport.name} ` : ''}
                matches are scheduled right now.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {upcomingMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  isReminded={remindedIds.has(match.id)}
                  isSaving={savingReminderId === match.id}
                  favoriteTeams={favoriteTeamSet}
                  serverDateUtc={serverDateUtc}
                  onToggleReminder={(id) => void toggleReminder(id)}
                  onToggleFollowTeam={toggleFollowTeam}
                  onOpenMatch={(m) => setMediaViewer({ kind: 'match', match: m })}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 5: Featured Highlights */}
      <section
        id="highlights"
        className="scroll-mt-20 border-y border-slate-200 bg-white px-5 py-16 lg:px-8 dark:border-white/6 dark:bg-[#0e1727]"
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Catch up"
            title="Featured highlights"
            badge={
              favoriteSportIds.length > 0 && !selectedSport ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0f7a06] dark:border-[#39ff14]/35 dark:bg-[#39ff14]/10 dark:text-[#39ff14]">
                  <Sparkles size={11} /> Prioritised for your sports
                </span>
              ) : undefined
            }
            action="View all highlights"
            onAction={() => setArchiveMode('highlights')}
          />
          {catalogLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-h-[248px] animate-pulse rounded-2xl border border-slate-200 bg-slate-200/70 dark:border-white/10 dark:bg-[#1f2937]/40" />
              <div className="min-h-[248px] animate-pulse rounded-2xl border border-slate-200 bg-slate-200/70 dark:border-white/10 dark:bg-[#1f2937]/40" />
            </div>
          ) : showcaseHighlights.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center dark:border-white/10 dark:bg-[#1f2937]/40">
              <p className="text-sm text-slate-600 dark:text-white/60">
                No {selectedSport ? `${selectedSport.name} ` : ''}highlights are
                published yet.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {showcaseHighlights.map((highlight) => (
                <article
                  key={highlight.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setMediaViewer({ kind: 'highlight', highlight })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setMediaViewer({ kind: 'highlight', highlight })
                    }
                  }}
                  className={`highlight-card group cursor-pointer bg-[#0b1220] text-white ${
                    showcaseHighlights.length === 1 ? 'md:col-span-2' : ''
                  }`}
                >
                  <img
                    src={highlight.image_url}
                    alt={highlight.image_alt ?? highlight.title}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0b1220]/95 via-[#0b1220]/75 to-[#0b1220]/20" />
                  <div className="relative flex h-full min-h-[248px] items-end justify-between gap-4 p-5 sm:p-7">
                    <div className="max-w-md">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#39ff14]/35 bg-[#0b1220]/75 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#39ff14] backdrop-blur">
                          {highlight.sport?.icon && (
                            <span>{highlight.sport.icon}</span>
                          )}
                          {highlight.badge}
                        </span>
                        {highlight.access_tier === 'premium' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#39ff14]/45 bg-[#0b1220]/85 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#39ff14] backdrop-blur">
                            <Lock size={10} /> Premium
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 text-xl font-bold leading-snug text-white transition group-hover:text-[#39ff14] sm:text-2xl">
                        {highlight.title}
                      </h3>
                      {highlight.duration && (
                        <p className="mt-3 text-xs font-bold tracking-wider text-white/75">
                          {highlight.duration}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setMediaViewer({ kind: 'highlight', highlight })
                      }}
                      aria-label={`Play highlight: ${highlight.title}`}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/25 bg-[#0b1220]/80 text-white backdrop-blur transition group-hover:scale-110 group-hover:border-[#39ff14] group-hover:bg-[#39ff14] group-hover:text-[#0b1220]"
                    >
                      <Play size={18} fill="currentColor" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 6: Latest Sports News */}
      <section
        id="news"
        className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 lg:px-8"
      >
        <SectionHeading
          eyebrow="Beyond the scoreboard"
          title="Latest sports news"
          badge={
            favoriteSportIds.length > 0 && !selectedSport ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0f7a06] dark:border-[#39ff14]/35 dark:bg-[#39ff14]/10 dark:text-[#39ff14]">
                <Sparkles size={11} /> Prioritised for your sports
              </span>
            ) : undefined
          }
          action="View all news"
          onAction={() => setArchiveMode('news')}
        />
        {catalogLoading ? (
          <div className="grid gap-5 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="aspect-[1.2] animate-pulse rounded-xl border border-slate-200 bg-slate-200/70 dark:border-white/10 dark:bg-[#1f2937]/40"
              />
            ))}
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-[#1f2937]/40 dark:shadow-none">
            <p className="text-sm text-slate-600 dark:text-white/60">
              No {selectedSport ? `${selectedSport.name} ` : ''}news articles are
              available yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {filteredNews.map((item) => (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveArticle(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setActiveArticle(item)
                  }
                }}
                className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#0f7a06]/50 hover:shadow-md dark:border-white/10 dark:bg-[#0e1727]/75 dark:shadow-none dark:hover:border-[#39ff14]/45"
              >
                <div>
                  <div className="relative mb-4 aspect-[16/10] overflow-hidden rounded-xl">
                    <img
                      src={item.image_url}
                      alt={item.image_alt ?? item.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-[#0b1220]/85 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#39ff14] backdrop-blur">
                      {item.category}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold leading-snug text-[#0b1220] transition group-hover:text-[#0f7a06] dark:text-white dark:group-hover:text-[#39ff14]">
                    {item.title}
                  </h3>
                  {item.summary && (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-white/55">
                      {item.summary}
                    </p>
                  )}
                </div>
                <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-white/8 dark:text-white/45">
                  {formatArticleDate(item.published_at)} &nbsp;•&nbsp;{' '}
                  {item.read_time}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 7: SPORTIVRA Membership & Plans + Multi-Column Footer */}
      {(() => {
        const membershipDisplay = getMembershipDisplayModel({
          plans: publicPlans,
          paidPlansConfigured,
          checkoutConfigured: paidCheckoutConfigured,
        })
        const freeFeatures = membershipDisplay.freePlan
          ? extractPlanFeatures(membershipDisplay.freePlan.features)
          : []
        const hasActivePremium = Boolean(billingOverview?.hasActivePremium)
        const activePlanCode = billingOverview?.subscription?.planCode ?? null

        return (
          <section
            id="pricing"
            className="mx-auto max-w-7xl scroll-mt-20 px-5 pb-16 pt-4 lg:px-8"
          >
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 dark:border-white/10">
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.26em] text-[#0f7a06] dark:text-[#39ff14]">
                    SPORTIVRA Membership
                  </p>
                  <h2 className="text-2xl font-bold tracking-tight text-[#0b1220] sm:text-3xl dark:text-white">
                    Choose your plan
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-white/65">
                    Start free with live scores, schedule reminders, and
                    personalised teams, or choose Monthly or Yearly Premium for
                    licensed live sports broadcasts and ad-free viewing.
                  </p>
                </div>

                {user && (
                  <button
                    type="button"
                    onClick={() => setAuthModalMode('account')}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-4 text-xs font-bold text-[#0b1220] transition hover:border-[#0f7a06] dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-[#39ff14]"
                  >
                    <CreditCard
                      size={14}
                      className="text-[#0f7a06] dark:text-[#39ff14]"
                    />
                    {billingLoading && !billingOverview
                      ? 'Checking membership...'
                      : billingError && !billingOverview
                        ? 'Membership status unavailable'
                        : hasActivePremium
                          ? 'Active: SPORTIVRA Premium'
                          : 'Active: SPORTIVRA Free'}
                  </button>
                )}
              </div>

              {checkoutError && (
                <div className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs font-medium text-red-700 dark:border-[#ff3b45]/40 dark:bg-[#ff3b45]/10 dark:text-[#ff8b91]">
                  {checkoutError}
                </div>
              )}

              {membershipDisplay.paidPlansConfigured &&
                !membershipDisplay.checkoutEnabled && (
                  <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200">
                    Official SPORTIVRA Premium pricing is displayed below.
                    Online checkout is disabled until real Paystack plan codes
                    and server payment configuration are added.
                  </div>
                )}

              {plansError && !plansLoading && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200">
                  <span>Could not load membership plans: {plansError}</span>
                  <button
                    type="button"
                    onClick={() => void loadPublicPlans()}
                    className="inline-flex items-center gap-1.5 font-bold underline"
                  >
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              )}

              {plansLoading ? (
                <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  <div className="min-h-[260px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-[#0b1220]" />
                  <div className="min-h-[260px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-[#0b1220]" />
                </div>
              ) : (
                <div
                  className={`mt-6 grid gap-5 ${
                    membershipDisplay.premiumPlans.length > 1
                      ? 'md:grid-cols-3'
                      : 'md:grid-cols-2'
                  }`}
                >
                  {/* Free Membership Tier */}
                  <article className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-white/12 dark:bg-[#0b1220]">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-white/80">
                          Free
                        </span>
                        {user && !hasActivePremium && (
                          <span className="text-[11px] font-bold text-[#0f7a06] dark:text-[#39ff14]">
                            Current plan
                          </span>
                        )}
                      </div>
                      <h3 className="mt-4 text-xl font-bold text-[#0b1220] dark:text-white">
                        {membershipDisplay.freePlan?.name ?? 'SPORTIVRA Free'}
                      </h3>
                      <p className="mt-2 text-3xl font-black tracking-tight text-[#0b1220] dark:text-white">
                        Free
                        <span className="ml-1.5 text-xs font-semibold text-slate-500 dark:text-white/50">
                          always included
                        </span>
                      </p>
                      <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-white/60">
                        {membershipDisplay.freePlan?.description ??
                          'Live scores, match schedule reminders, personalised teams and sports, plus free streams and highlights.'}
                      </p>
                      <ul className="mt-5 space-y-2.5 text-xs text-slate-700 dark:text-white/75">
                        {(freeFeatures.length > 0
                          ? freeFeatures
                          : [
                              'Real-time live scores & final results',
                              'Personalised favourite sports & followed teams',
                              'Saved match kick-off reminders',
                              'Access to all free highlights & news',
                            ]
                        ).map((feat) => (
                          <li key={feat} className="flex items-start gap-2">
                            <Check
                              size={14}
                              className="mt-0.5 shrink-0 text-[#0f7a06] dark:text-[#39ff14]"
                            />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAuthModalMode(user ? 'account' : 'signup')}
                      className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 text-xs font-bold text-[#0b1220] transition hover:border-[#0f7a06] dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-[#39ff14]"
                    >
                      {user ? 'Manage account' : 'Create free account'}{' '}
                      <ArrowRight size={14} />
                    </button>
                  </article>

                  {/* Configured Paid Plans OR Graceful Coming-Soon State */}
                  {!membershipDisplay.paidPlansConfigured ? (
                    <article className="flex flex-col justify-between rounded-2xl border border-[#0f7a06]/30 bg-gradient-to-br from-[#39ff14]/15 via-emerald-50 to-white p-6 dark:border-[#39ff14]/35 dark:from-[#39ff14]/12 dark:via-[#0b1220] dark:to-[#0e1727]">
                      <div>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#39ff14] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#0b1220]">
                          <Sparkles size={11} /> SPORTIVRA Premium
                        </span>
                        <h3 className="mt-4 text-xl font-bold text-[#0b1220] dark:text-white">
                          {membershipDisplay.comingSoonMessage ??
                            'Premium plans coming soon'}
                        </h3>
                        <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-white/70">
                          Paid membership tiers and regional pricing are not
                          published yet. Free access remains open while Premium
                          plans and Paystack billing configuration are finalized.
                        </p>
                        <ul className="mt-5 space-y-2.5 text-xs text-slate-700 dark:text-white/75">
                          <li className="flex items-start gap-2">
                            <ShieldCheck
                              size={14}
                              className="mt-0.5 shrink-0 text-[#0f7a06] dark:text-[#39ff14]"
                            />
                            <span>
                              Server-verified Paystack subscriptions (no
                              unverified upgrades)
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ShieldCheck
                              size={14}
                              className="mt-0.5 shrink-0 text-[#0f7a06] dark:text-[#39ff14]"
                            />
                            <span>
                              Protected access to licensed Premium matches &amp;
                              highlights
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ShieldCheck
                              size={14}
                              className="mt-0.5 shrink-0 text-[#0f7a06] dark:text-[#39ff14]"
                            />
                            <span>
                              Self-serve cancellation and billing history inside
                              your Account
                            </span>
                          </li>
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setAuthModalMode(user ? 'account' : 'signup')
                        }
                        className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0b1220] px-5 text-xs font-bold text-white transition hover:bg-[#1f2937] dark:bg-[#39ff14] dark:text-[#0b1220] dark:hover:bg-[#a8ff9d]"
                      >
                        {user
                          ? 'Open account & billing'
                          : 'Join free for updates'}{' '}
                        <ArrowRight size={14} />
                      </button>
                    </article>
                  ) : (
                    membershipDisplay.premiumPlans.map((plan) => {
                      const formattedPrice = formatMinorCurrency(
                        plan.amountMinor,
                        plan.currency,
                      )
                      const intervalLabel = formatBillingIntervalLabel(
                        plan.billingInterval,
                      )
                      const planFeatures = extractPlanFeatures(plan.features)
                      const isCurrentPlan =
                        hasActivePremium && activePlanCode === plan.code
                      const isSubmitting = checkoutPlanCode === plan.code
                      const annualSavings =
                        plan.billingInterval === 'year' &&
                        membershipDisplay.annualSavings?.yearlyPlanCode ===
                          plan.code
                          ? membershipDisplay.annualSavings
                          : null

                      return (
                        <article
                          key={plan.code}
                          className="flex flex-col justify-between rounded-2xl border border-[#0f7a06]/40 bg-gradient-to-br from-[#39ff14]/15 via-emerald-50 to-white p-6 dark:border-[#39ff14]/45 dark:from-[#39ff14]/12 dark:via-[#0b1220] dark:to-[#0e1727]"
                        >
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#39ff14] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#0b1220]">
                                <Sparkles size={11} /> Premium
                              </span>
                              {isCurrentPlan ? (
                                <span className="text-[11px] font-bold text-[#0f7a06] dark:text-[#39ff14]">
                                  Current plan
                                </span>
                              ) : (
                                annualSavings && (
                                  <span className="rounded-full border border-[#0f7a06]/30 bg-white px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#0f7a06] dark:border-[#39ff14]/40 dark:bg-[#0b1220] dark:text-[#39ff14]">
                                    Save{' '}
                                    {formatMinorCurrency(
                                      annualSavings.savingsMinor,
                                      annualSavings.currency,
                                    )}
                                    {annualSavings.monthsFree
                                      ? ` • ${annualSavings.monthsFree} months free`
                                      : ` • ${annualSavings.savingsPercent}% off`}
                                  </span>
                                )
                              )}
                            </div>

                            <h3 className="mt-4 text-xl font-bold text-[#0b1220] dark:text-white">
                              {plan.name}
                            </h3>

                            {formattedPrice && (
                              <p className="mt-2 text-3xl font-black tracking-tight text-[#0b1220] dark:text-white">
                                {formattedPrice}
                                {intervalLabel && (
                                  <span className="ml-1 text-xs font-semibold text-slate-600 dark:text-white/60">
                                    {intervalLabel}
                                  </span>
                                )}
                              </p>
                            )}

                            {annualSavings && (
                              <p className="mt-1.5 text-xs font-bold text-[#0f7a06] dark:text-[#39ff14]">
                                Save{' '}
                                {formatMinorCurrency(
                                  annualSavings.savingsMinor,
                                  annualSavings.currency,
                                )}
                                /year ({annualSavings.savingsPercent}% off vs{' '}
                                {formatMinorCurrency(
                                  annualSavings.annualizedMonthlyMinor,
                                  annualSavings.currency,
                                )}
                                /year billed monthly)
                              </p>
                            )}

                            {plan.description && (
                              <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-white/70">
                                {plan.description}
                              </p>
                            )}

                            {planFeatures.length > 0 && (
                              <ul className="mt-5 space-y-2.5 text-xs text-slate-700 dark:text-white/80">
                                {planFeatures.map((feat) => (
                                  <li
                                    key={feat}
                                    className="flex items-start gap-2"
                                  >
                                    <Check
                                      size={14}
                                      className="mt-0.5 shrink-0 text-[#0f7a06] dark:text-[#39ff14]"
                                    />
                                    <span>{feat}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <div className="mt-6">
                            {isCurrentPlan ? (
                              <button
                                type="button"
                                onClick={() => setAuthModalMode('account')}
                                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#0f7a06] bg-white px-5 text-xs font-bold text-[#0f7a06] transition hover:bg-emerald-50 dark:border-[#39ff14] dark:bg-transparent dark:text-[#39ff14] dark:hover:bg-[#39ff14]/10"
                              >
                                Manage subscription
                              </button>
                            ) : !plan.checkoutReady ? (
                              <button
                                type="button"
                                disabled
                                className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-5 text-xs font-bold text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/50"
                              >
                                Checkout disabled — Paystack setup pending
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={
                                  checkoutPlanCode !== null ||
                                  hasActivePremium
                                }
                                onClick={() => void startPlanCheckout(plan.code)}
                                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#39ff14] px-5 text-xs font-bold text-[#0b1220] transition hover:bg-[#5cff3d] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#a8ff9d]"
                              >
                                {isSubmitting ? (
                                  <>
                                    <Loader2
                                      size={14}
                                      className="animate-spin"
                                    />{' '}
                                    Redirecting to Paystack...
                                  </>
                                ) : hasActivePremium ? (
                                  'Already subscribed'
                                ) : user ? (
                                  <>
                                    Upgrade with Paystack{' '}
                                    <ArrowRight size={14} />
                                  </>
                                ) : (
                                  <>
                                    Sign in to upgrade <ArrowRight size={14} />
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>
              )}

              <p className="mt-6 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-white/45">
                <ShieldCheck
                  size={13}
                  className="shrink-0 text-[#0f7a06] dark:text-[#39ff14]"
                />
                <span>
                  Payments are processed by Paystack and verified strictly on
                  the SPORTIVRA server before granting Premium access.
                </span>
              </p>
            </div>
          </section>
        )
      })()}

      <footer className="border-t border-slate-200 bg-[#eef2f6] px-5 pb-10 pt-12 text-slate-600 lg:px-8 dark:border-white/8 dark:bg-[#080e19] dark:text-white/55">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
            <div className="col-span-2">
              <Brand />
              <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-600 dark:text-white/50">
                The international home for live scores, upcoming fixtures,
                on-demand highlights, and sports stories that matter.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0b1220] dark:text-white">
                Product
              </h3>
              <ul className="mt-3 space-y-2.5 text-xs text-slate-600 dark:text-white/55">
                <li>
                  <a
                    href="#live"
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    Live Matches
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => void handleOpenMatchCenter('finished')}
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    Scores
                  </button>
                </li>
                <li>
                  <a
                    href="#highlights"
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    Highlights
                  </a>
                </li>
                <li>
                  <a
                    href="#schedule"
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    Schedule
                  </a>
                </li>
                <li>
                  <a
                    href="#my-sports"
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    Favourite Sports
                  </a>
                </li>
                <li>
                  <a
                    href="#my-teams"
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    My Teams
                  </a>
                </li>
                <li>
                  <a
                    href="#pricing"
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    Membership
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0b1220] dark:text-white">
                Sports
              </h3>
              <ul className="mt-3 space-y-2.5 text-xs text-slate-600 dark:text-white/55">
                {catalogLoading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <li
                      key={idx}
                      className="h-3.5 w-20 animate-pulse rounded bg-slate-300 dark:bg-white/10"
                    />
                  ))
                ) : sports.length === 0 ? (
                  <li className="text-slate-400 dark:text-white/40">
                    No sports available
                  </li>
                ) : (
                  sports.map((sport) => (
                    <li key={sport.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSportSlug(sport.slug)
                          document
                            .getElementById('live')
                            ?.scrollIntoView({ behavior: 'smooth' })
                        }}
                        className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                      >
                        {sport.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0b1220] dark:text-white">
                Company
              </h3>
              <ul className="mt-3 space-y-2.5 text-xs text-slate-600 dark:text-white/55">
                <li>
                  <button
                    type="button"
                    onClick={() => setInfoTopic('About us')}
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    About us
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setInfoTopic('Careers')}
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    Careers
                  </button>
                </li>
                <li>
                  <a
                    href="#news"
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    Newsroom
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0b1220] dark:text-white">
                Support
              </h3>
              <ul className="mt-3 space-y-2.5 text-xs text-slate-600 dark:text-white/55">
                <li>
                  <button
                    type="button"
                    onClick={() => setAuthModalMode(user ? 'account' : 'signin')}
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    {user ? 'My Account' : 'Sign in'}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setInfoTopic('Help centre')}
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    Help centre
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setInfoTopic('Privacy')}
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    Privacy policy
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setInfoTopic('Terms')}
                    className="transition hover:text-[#0f7a06] dark:hover:text-[#39ff14]"
                  >
                    Terms of use
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-4 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:border-white/8 dark:text-white/35">
            <p>© 2026 SPORTIVRA. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 dark:text-white/45">
              <span className="inline-flex items-center gap-1.5">
                <Globe size={13} className="text-[#0f7a06] dark:text-[#39ff14]" />{' '}
                Web
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Smartphone size={13} /> Mobile
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Monitor size={13} /> Desktop
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Tv size={13} /> Smart TV
              </span>
            </div>
          </div>
        </div>
      </footer>

      {mediaViewer && (
        <MediaViewerModal
          item={mediaViewer}
          user={user}
          remindedIds={remindedIds}
          favoriteTeams={favoriteTeamSet}
          serverDateUtc={serverDateUtc}
          onToggleReminder={toggleReminder}
          onToggleFollowTeam={toggleFollowTeam}
          onRequestSignIn={() => {
            setPendingMediaAuthNotice(
              'Sign in with your SPORTIVRA Premium account to watch this stream.',
            )
            setAuthModalMode('signin')
          }}
          onRequestUpgrade={() => {
            setMediaViewer(null)
            document
              .getElementById('pricing')
              ?.scrollIntoView({ behavior: 'smooth' })
          }}
          onClose={() => setMediaViewer(null)}
        />
      )}

      {authModalMode && (
        <AuthAccountModal
          initialMode={authModalMode}
          user={user}
          profile={profile}
          sports={sports}
          favoriteSportIds={favoriteSportIds}
          favoriteTeams={favoriteTeams}
          remindedMatches={remindedMatches}
          pendingReminderMessage={
            pendingVerifyRef
              ? 'Sign in to verify your Paystack payment and activate your subscription.'
              : pendingCheckoutPlanCode
                ? 'Sign in or create an account to continue to Paystack checkout.'
                : pendingMediaAuthNotice
                  ? pendingMediaAuthNotice
                  : pendingReminderMatchId
                    ? 'Sign in or create an account to save match reminders to SPORTIVRA.'
                    : null
          }
          billingOverview={billingOverview}
          billingLoading={billingLoading}
          billingError={billingError}
          publicPlans={publicPlans}
          paidPlansConfigured={paidPlansConfigured}
          paidCheckoutConfigured={paidCheckoutConfigured}
          plansLoading={plansLoading}
          plansError={plansError}
          onRefreshBilling={loadBillingOverview}
          onRetryPlans={loadPublicPlans}
          onBillingChanged={async () => {
            await loadUserAccountState()
            await loadBillingOverview()
          }}
          onNavigateToPlans={() => {
            setAuthModalMode(null)
            document
              .getElementById('pricing')
              ?.scrollIntoView({ behavior: 'smooth' })
          }}
          onClose={() => {
            setAuthModalMode(null)
            setPendingReminderMatchId(null)
            setPendingCheckoutPlanCode(null)
            setPendingVerifyRef(null)
            setPendingMediaAuthNotice(null)
          }}
          onAuthSuccess={handleAuthSuccess}
          onProfileUpdated={(updated) => {
            setProfile(updated)
            applyPreferencesState(
              extractPreferencesFromProfile(
                updated,
                validSportIds.size > 0 ? validSportIds : undefined,
                validTeamNames.size > 0 ? validTeamNames : undefined,
              ),
            )
          }}
          onToggleFollowTeam={toggleFollowTeam}
          onRemoveReminder={handleRemoveReminderFromAccount}
          onSignedOut={() => {
            setUser(null)
            setProfile(null)
            setBillingOverview(null)
            setBillingError(null)
            setRemindedIds(new Set())
            syncingGuestUserIdRef.current = null
            lastSyncedUserIdRef.current = null
            applyPreferencesState({ favoriteSportIds: [], favoriteTeams: [] })
            showToast('Signed out of SPORTIVRA.')
          }}
        />
      )}

      {activeArticle && (
        <ArticleReaderModal
          article={activeArticle}
          onClose={() => setActiveArticle(null)}
        />
      )}

      {matchCenterTab && (
        <MatchCenterModal
          initialTab={matchCenterTab}
          matches={matchesBySport}
          favoriteSportIds={favoriteSportIds}
          favoriteTeams={favoriteTeamSet}
          remindedIds={remindedIds}
          serverDateUtc={serverDateUtc}
          onToggleReminder={toggleReminder}
          onToggleFollowTeam={toggleFollowTeam}
          onWatchMatch={(m) => {
            setMatchCenterTab(null)
            setMediaViewer({ kind: 'match', match: m })
          }}
          onClose={() => setMatchCenterTab(null)}
        />
      )}

      {archiveMode && (
        <CatalogArchiveModal
          mode={archiveMode}
          highlights={filteredHighlights}
          newsArticles={allArchiveNews}
          onSelectHighlight={(h) => {
            setArchiveMode(null)
            setMediaViewer({ kind: 'highlight', highlight: h })
          }}
          onSelectArticle={(a) => {
            setArchiveMode(null)
            setActiveArticle(a)
          }}
          onClose={() => setArchiveMode(null)}
        />
      )}

      {infoTopic && (
        <InfoPageModal
          topic={infoTopic}
          onClose={() => setInfoTopic(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl backdrop-blur ${
            toast.tone === 'error'
              ? 'border-red-300 bg-white text-red-700 dark:border-[#ff3b45]/50 dark:bg-[#0e1727]/95 dark:text-[#ff8b91]'
              : 'border-emerald-300 bg-white text-emerald-900 dark:border-[#39ff14]/45 dark:bg-[#0e1727]/95 dark:text-[#a8ff9d]'
          }`}
        >
          <Bell
            size={14}
            className={`shrink-0 ${
              toast.tone === 'error'
                ? 'text-red-600 dark:text-current'
                : 'text-[#0f7a06] dark:text-current'
            }`}
          />
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-[#0b1220] dark:text-white/50 dark:hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  )
}
