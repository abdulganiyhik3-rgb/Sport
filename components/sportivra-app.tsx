'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Globe,
  Loader2,
  Menu,
  Monitor,
  Play,
  Search,
  Smartphone,
  Trophy,
  Tv,
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
  fetchInitialCatalog,
  fetchMatchesFromSupabase,
  formatArticleDate,
  formatEventCount,
  formatMatchDayLabel,
  formatUtcTime,
  searchCatalog,
  type InitialCatalogData,
  type SearchResults,
} from '@/lib/sportivra/data'
import {
  ArticleReaderModal,
  AuthAccountModal,
  CatalogArchiveModal,
  InfoPageModal,
  MatchCenterModal,
  MediaViewerModal,
} from '@/components/sportivra-modals'

const navItems = [
  'Home',
  'Live',
  'Sports',
  'Schedule',
  'Scores',
  'Highlights',
  'News',
] as const

const sportSubtitles: Record<string, string> = {
  football: 'Matches, leagues & cups',
  basketball: 'NBA, EuroLeague & more',
  tennis: 'Grand Slams & ATP/WTA',
  cricket: 'T20, ODI & international',
  boxing: 'World title bouts & PPV',
  motorsport: 'Grand Prix & trackside',
}

function getSportSubtitle(slug: string): string {
  return sportSubtitles[slug] ?? 'Live fixtures & highlights'
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
      <span className="text-[18px] font-black tracking-[0.18em] text-white">
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
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.26em] text-[#39ff14]">
          {eyebrow}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {title}
          </h2>
          {badge}
        </div>
      </div>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-white/65 transition hover:text-[#39ff14] sm:text-sm"
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
  serverDateUtc,
  onToggleReminder,
  onOpenMatch,
}: {
  match: MatchRow
  isReminded: boolean
  isSaving: boolean
  serverDateUtc: string
  onToggleReminder: (matchId: string) => void
  onOpenMatch: (match: MatchRow) => void
}) {
  const dayLabel = formatMatchDayLabel(match.kickoff_at, serverDateUtc)
  const timeLabel = formatUtcTime(match.kickoff_at)

  return (
    <article className="match-card group flex flex-col justify-between">
      <div>
        <div className="mb-4 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <span className="text-sm">{match.sport?.icon ?? '⚽'}</span>
            <span className="truncate">{match.league}</span>
          </span>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold text-[#39ff14]">
            {dayLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onOpenMatch(match)}
          className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 py-3 text-center"
        >
          <div className="flex flex-col items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/8 text-sm font-black text-white transition group-hover:border-[#39ff14]/45">
              {match.home_team[0]}
            </span>
            <span className="line-clamp-2 text-xs font-bold leading-snug text-white/95 sm:text-sm">
              {match.home_team}
            </span>
          </div>

          <span className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white/45">
            vs
          </span>

          <div className="flex flex-col items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/8 text-sm font-black text-white transition group-hover:border-[#39ff14]/45">
              {match.away_team[0]}
            </span>
            <span className="line-clamp-2 text-xs font-bold leading-snug text-white/95 sm:text-sm">
              {match.away_team}
            </span>
          </div>
        </button>
      </div>

      <div className="mt-4 space-y-3 border-t border-white/8 pt-4">
        <div className="flex items-center justify-center gap-1.5 text-xs text-white/55">
          <Clock3 size={13} className="text-[#39ff14]" />
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
              ? 'border-[#39ff14] bg-[#39ff14] text-[#0b1220]'
              : 'border-[#39ff14]/40 bg-[#39ff14]/10 text-[#39ff14] hover:border-[#39ff14] hover:bg-[#39ff14]/20'
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

  const [user, setUser] = useState<{ id: string; email: string | null } | null>(
    initialData.user,
  )
  const [profile, setProfile] = useState<ProfileRow | null>(initialData.profile)
  const [remindedIds, setRemindedIds] = useState<Set<string>>(
    () => new Set(initialData.reminderMatchIds),
  )
  const [savingReminderId, setSavingReminderId] = useState<string | null>(null)
  const [pendingReminderMatchId, setPendingReminderMatchId] = useState<
    string | null
  >(null)

  const [mobileNav, setMobileNav] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
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

  // Check URL query params after email confirmation / password recovery (/auth/callback)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const confirmed = params.get('confirmed')
    const recovery = params.get('recovery')
    const authError = params.get('auth_error')

    if (recovery === '1') {
      setAuthModalMode('recovery')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (confirmed === '1') {
      showToast('Email confirmed — welcome to SPORTIVRA!', 'success')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (authError) {
      showToast(authError, 'error')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [showToast])

  // If SSR ran in an environment where server-side egress was restricted,
  // hydrate directly from Supabase in the browser without fallback mock data.
  useEffect(() => {
    if (initialData.serverHydrated) return
    let cancelled = false

    async function hydrateFromBrowser() {
      setCatalogLoading(true)
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
        showToast(`Could not load SPORTIVRA data: ${fresh.loadError}`, 'error')
      }
    }

    void hydrateFromBrowser()
    return () => {
      cancelled = true
    }
  }, [initialData.serverHydrated, showToast])

  const loadUserAccountState = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      setUser(null)
      setProfile(null)
      setRemindedIds(new Set())
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

    setProfile(profileRes.data ?? null)
    const nextReminders = new Set(
      (remindersRes.data ?? []).map((r) => r.match_id),
    )
    setRemindedIds(nextReminders)

    return authUser.id
  }, [])

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
  useEffect(() => {
    if (!searchOpen) return
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSearchResults(null)
      setSearchLoading(false)
      return
    }

    let cancelled = false
    setSearchLoading(true)
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient()
        const results = await searchCatalog(supabase, trimmed)
        if (!cancelled) {
          setSearchResults(results)
        }
      } catch {
        if (!cancelled) {
          showToast('Search query failed. Please try again.', 'error')
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
  }, [searchOpen, searchQuery, showToast])

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
    } else {
      showToast('Signed in to SPORTIVRA.')
    }
  }, [loadUserAccountState, pendingReminderMatchId, showToast])

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

  const selectedSport = useMemo(
    () => sports.find((s) => s.slug === selectedSportSlug) ?? null,
    [sports, selectedSportSlug],
  )

  const globalLiveMatches = useMemo(
    () => matches.filter((m) => m.status === 'live'),
    [matches],
  )

  const matchesBySport = useMemo(() => {
    if (!selectedSport) return matches
    return matches.filter((m) => m.sport_id === selectedSport.id)
  }, [matches, selectedSport])

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
    if (!selectedSport) return highlights
    return highlights.filter((h) => h.sport_id === selectedSport.id)
  }, [highlights, selectedSport])

  const showcaseHighlights = useMemo(
    () => filteredHighlights.slice(0, 2),
    [filteredHighlights],
  )

  const filteredNews = useMemo(() => {
    if (!selectedSport) return newsArticles.slice(0, 3)
    return newsArticles
      .filter((a) => a.sport_id === selectedSport.id)
      .slice(0, 3)
  }, [newsArticles, selectedSport])

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
    if (item === 'Scores') {
      e.preventDefault()
      void handleOpenMatchCenter('finished')
    }
    setMobileNav(false)
  }

  return (
    <main id="top" className="min-h-screen overflow-x-clip bg-[#0b1220] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b1220]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Brand />

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
            {navItems.map((item, i) => (
              <a
                key={item}
                href={i === 0 ? '#top' : `#${item.toLowerCase()}`}
                onClick={(e) => handleNavClick(e, item)}
                className={`inline-flex items-center gap-1.5 text-[13px] font-semibold transition hover:text-[#39ff14] ${
                  i === 0 ? 'text-[#39ff14]' : 'text-white/70'
                }`}
              >
                {item}
                {item === 'Live' && globalLiveMatches.length > 0 && (
                  <span
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#39ff14]"
                    aria-hidden="true"
                  />
                )}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white"
              aria-label="Search SPORTIVRA"
            >
              <Search size={19} />
            </button>
            {user ? (
              <button
                type="button"
                onClick={() => setAuthModalMode('account')}
                className="hidden min-h-11 items-center gap-2 rounded-full border border-[#39ff14]/40 bg-[#39ff14]/10 px-4 text-sm font-semibold text-white transition hover:bg-[#39ff14]/20 sm:flex"
              >
                <UserIcon size={15} className="text-[#39ff14]" />
                <span className="max-w-[140px] truncate">
                  {profile?.full_name || user.email || 'Account'}
                </span>
                {remindedIds.size > 0 && (
                  <span className="rounded-full bg-[#39ff14] px-1.5 py-0.5 text-[10px] font-black text-[#0b1220]">
                    {remindedIds.size}
                  </span>
                )}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPendingReminderMatchId(null)
                    setAuthModalMode('signin')
                  }}
                  className="hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white sm:flex"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingReminderMatchId(null)
                    setAuthModalMode('signup')
                  }}
                  className="hidden min-h-11 items-center gap-1.5 rounded-full bg-[#39ff14] px-5 text-sm font-bold text-[#0b1220] transition hover:bg-[#a8ff9d] sm:flex"
                >
                  Join now <ArrowRight size={14} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setMobileNav((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/8 lg:hidden"
              aria-label={mobileNav ? 'Close menu' : 'Open menu'}
            >
              {mobileNav ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="border-t border-white/10 bg-[#0b1220]/95 px-5 py-3 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl">
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4">
                <Search size={18} className="text-white/40" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sports, teams, players, news..."
                  className="h-12 w-full bg-transparent text-base text-white outline-none placeholder:text-white/35"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setSearchResults(null)
                    }}
                    className="text-xs font-semibold text-white/50 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>

              {searchQuery.trim() && (
                <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0e1727] p-4">
                  {searchLoading ? (
                    <div className="flex items-center gap-2 text-xs text-white/60">
                      <Loader2 size={14} className="animate-spin text-[#39ff14]" />
                      Searching SPORTIVRA database...
                    </div>
                  ) : searchResults &&
                    searchResults.sports.length === 0 &&
                    searchResults.matches.length === 0 &&
                    searchResults.highlights.length === 0 &&
                    searchResults.newsArticles.length === 0 ? (
                    <p className="text-xs text-white/55">
                      No matching sports, fixtures, highlights, or articles found for
                      &ldquo;{searchQuery.trim()}&rdquo;.
                    </p>
                  ) : (
                    searchResults && (
                      <div className="space-y-4">
                        {searchResults.sports.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#39ff14]">
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
                                  className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white hover:border-[#39ff14]"
                                >
                                  {sport.icon} {sport.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {searchResults.matches.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#39ff14]">
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
                                  className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0b1220] px-3.5 py-2.5 text-left hover:border-[#39ff14]/60"
                                >
                                  <div>
                                    <p className="text-xs font-bold text-white">
                                      {match.headline
                                        ? `${match.headline} • `
                                        : ''}
                                      {match.home_team} vs {match.away_team}
                                    </p>
                                    <p className="text-[11px] text-white/50">
                                      {match.league}
                                    </p>
                                  </div>
                                  <span className="text-[10px] font-bold uppercase text-[#39ff14]">
                                    {match.status}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {searchResults.highlights.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#39ff14]">
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
                                  className="rounded-lg border border-white/10 bg-[#0b1220] px-3.5 py-2.5 text-left hover:border-[#39ff14]/60"
                                >
                                  <p className="text-xs font-bold text-white">
                                    {h.title}
                                  </p>
                                  <p className="text-[11px] text-white/50">
                                    {h.badge}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {searchResults.newsArticles.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#39ff14]">
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
                                  className="rounded-lg border border-white/10 bg-[#0b1220] px-3.5 py-2.5 text-left hover:border-[#39ff14]/60"
                                >
                                  <p className="text-xs font-bold text-white">
                                    {article.title}
                                  </p>
                                  <p className="text-[11px] text-white/50">
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
          <nav className="border-t border-white/10 bg-[#0b1220] px-5 py-4 lg:hidden">
            {navItems.map((item, i) => (
              <a
                key={item}
                href={i === 0 ? '#top' : `#${item.toLowerCase()}`}
                onClick={(e) => handleNavClick(e, item)}
                className="flex min-h-11 items-center justify-between border-b border-white/8 text-sm font-semibold text-white/80 last:border-0"
              >
                <span>{item}</span>
                {item === 'Live' && globalLiveMatches.length > 0 && (
                  <span className="rounded-full bg-[#ff3b45] px-2 py-0.5 text-[10px] font-black uppercase text-white">
                    {globalLiveMatches.length} Live
                  </span>
                )}
              </a>
            ))}
            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileNav(false)
                    setAuthModalMode('account')
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-[#39ff14] px-5 text-xs font-bold text-[#0b1220]"
                >
                  <UserIcon size={14} /> Account ({remindedIds.size} reminders)
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNav(false)
                      setAuthModalMode('signin')
                    }}
                    className="flex min-h-11 items-center rounded-full border border-white/15 px-5 text-xs font-semibold text-white"
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
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=2200&q=85')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1220] via-[#0b1220]/85 to-[#0b1220]/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/30 to-[#0b1220]/60" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-5 pb-8 pt-16 sm:pb-10 sm:pt-20 lg:px-8">
          <div className="max-w-2xl">
            <div className="mb-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.25em] text-[#39ff14]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#39ff14]" />{' '}
              The world of sport, in one place
            </div>
            <h1 className="max-w-xl text-4xl font-black leading-[0.98] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
              ALL SPORTS.
              <br />
              <span className="text-[#39ff14]">LIVE</span> AND
              <br />
              ON DEMAND.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/70 sm:mt-6 sm:text-lg sm:leading-7">
              Stream live fixtures, real-time scores, curated highlights, and
              match schedules — all in one place.
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
                className="flex min-h-12 items-center gap-2 rounded-full bg-[#39ff14] px-6 text-sm font-bold text-[#0b1220] transition hover:scale-[1.02] hover:bg-[#a8ff9d]"
              >
                <Play size={16} fill="currentColor" /> Watch now
              </button>
              <a
                href="#sports"
                className="flex min-h-12 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 text-sm font-bold text-white backdrop-blur transition hover:border-[#39ff14]/50 hover:bg-white/10"
              >
                Explore sports <ArrowRight size={16} />
              </a>
            </div>
          </div>

          {/* Integrated Live Scoreboard Ticker Strip */}
          <div className="mt-10">
            {catalogLoading ? (
              <div className="grid gap-3 rounded-2xl border border-white/10 bg-[#0e1727]/80 p-3 backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-[72px] animate-pulse rounded-xl bg-white/5"
                  />
                ))}
              </div>
            ) : globalLiveMatches.length > 0 ? (
              <div className="grid gap-2 rounded-2xl border border-white/12 bg-[#0e1727]/85 p-2.5 shadow-2xl backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
                {globalLiveMatches.slice(0, 3).map((match) => (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => setMediaViewer({ kind: 'match', match })}
                    className="group flex flex-col justify-between rounded-xl border border-white/8 bg-[#0b1220]/70 px-3.5 py-2.5 text-left transition hover:border-[#39ff14]/50 hover:bg-[#1f2937]/70"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider">
                      <span className="flex items-center gap-1.5 text-[#ff5c64]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b45]" />
                        LIVE
                      </span>
                      <span className="truncate text-white/45">
                        {match.sport?.name ?? 'Sport'} • {match.league}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 space-y-0.5 text-xs font-semibold text-white">
                        <p className="truncate">{match.home_team}</p>
                        <p className="truncate text-white/75">
                          {match.away_team}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-black tracking-tight text-[#39ff14]">
                          {match.home_score} - {match.away_score}
                        </p>
                        {match.match_clock && (
                          <p className="text-[10px] font-bold text-[#ff8b91]">
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
                  className="flex min-h-[60px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-white transition hover:border-[#39ff14]/50 hover:text-[#39ff14] sm:col-span-2 lg:col-span-1"
                >
                  View all scores <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0e1727]/85 px-4 py-3 backdrop-blur-xl">
                <p className="text-xs font-semibold text-white/70">
                  No live fixtures active at the moment — check upcoming kickoffs
                  or final results.
                </p>
                <button
                  type="button"
                  onClick={() => void handleOpenMatchCenter('all')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#39ff14] hover:text-[#a8ff9d]"
                >
                  Open match centre <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {selectedSport && (
        <div className="border-y border-white/10 bg-[#0e1727] px-5 py-3 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-white/80">
              Filtering by {selectedSport.icon}{' '}
              <span className="text-[#39ff14]">{selectedSport.name}</span> across
              live matches, final scores, schedule, highlights &amp; news
            </p>
            <button
              type="button"
              onClick={() => setSelectedSportSlug(null)}
              className="flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-white/75 transition hover:border-[#39ff14] hover:text-white"
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
            liveMatches.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff3b45] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                Live
              </span>
            ) : undefined
          }
          action="View all live"
          onAction={() => void handleOpenMatchCenter('live')}
        />

        {catalogLoading ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-h-[300px] animate-pulse rounded-2xl border border-white/10 bg-[#1f2937]/40 lg:col-span-2" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="min-h-[142px] animate-pulse rounded-2xl border border-white/10 bg-[#1f2937]/40" />
              <div className="min-h-[142px] animate-pulse rounded-2xl border border-white/10 bg-[#1f2937]/40" />
            </div>
          </div>
        ) : liveMatches.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#1f2937]/40 p-8 text-center">
            <p className="text-sm text-white/65">
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
              <article className="live-feature group relative min-h-[320px] overflow-hidden rounded-2xl lg:col-span-2">
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
                    <span className="flex w-fit items-center gap-2 rounded-full bg-[#ff3b45] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      Live{featuredLive.match_clock ? ` • ${featuredLive.match_clock}` : ''}
                    </span>
                    <span className="rounded-full border border-white/15 bg-[#0b1220]/70 px-3 py-1 text-[11px] font-semibold text-white/80 backdrop-blur">
                      {featuredLive.league}
                    </span>
                  </div>

                  <div>
                    {featuredLive.headline ? (
                      <h3 className="text-2xl font-black tracking-tight sm:text-3xl">
                        {featuredLive.headline}
                      </h3>
                    ) : (
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-[#0b1220]/80 text-sm font-black">
                            {featuredLive.home_team[0]}
                          </span>
                          <span className="truncate text-base font-bold sm:text-xl">
                            {featuredLive.home_team}
                          </span>
                        </div>
                        <span className="rounded-xl bg-[#0b1220]/80 px-3.5 py-1.5 text-2xl font-black tracking-tight text-white backdrop-blur sm:text-3xl">
                          {featuredLive.home_score} — {featuredLive.away_score}
                        </span>
                        <div className="flex items-center justify-end gap-2.5 text-right">
                          <span className="truncate text-base font-bold sm:text-xl">
                            {featuredLive.away_team}
                          </span>
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-[#0b1220]/80 text-sm font-black">
                            {featuredLive.away_team[0]}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-white/15 pt-4">
                      <div className="flex items-center gap-3">
                        <span className="h-1 w-20 rounded-full bg-[#39ff14]" />
                        <span className="text-xs font-semibold text-white/75">
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
                    onClick={() => setMediaViewer({ kind: 'match', match })}
                    className="group flex min-h-[152px] cursor-pointer flex-col justify-between rounded-2xl border border-white/10 bg-[#0e1727] p-4 transition hover:border-[#39ff14]/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff3b45] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        Live
                      </span>
                      <span className="truncate text-[11px] font-semibold text-white/55">
                        {match.match_clock ? `${match.match_clock} • ` : ''}
                        {match.league}
                      </span>
                    </div>

                    <div className="my-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-white transition group-hover:text-[#39ff14]">
                          {match.headline ||
                            `${match.home_team} vs ${match.away_team}`}
                        </h3>
                        <p className="mt-1 text-xl font-black tracking-tight text-white">
                          {match.home_score} — {match.away_score}
                        </p>
                      </div>

                      {match.image_url ? (
                        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#0b1220]">
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
                        <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#0b1220] text-xl">
                          {match.sport?.icon ?? '◉'}
                        </div>
                      )}
                    </div>

                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#39ff14]">
                      Watch live <ArrowRight size={13} />
                    </span>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Final Scores Ribbon */}
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0e1727]/90 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <button
            type="button"
            onClick={() => void handleOpenMatchCenter('finished')}
            className="inline-flex shrink-0 items-center gap-2 text-xs font-bold text-white transition hover:text-[#39ff14]"
          >
            <span className="h-2 w-2 rounded-full bg-[#39ff14]" />
            Final scores <ArrowRight size={13} className="text-[#39ff14]" />
          </button>

          {catalogLoading ? (
            <div className="h-7 flex-1 animate-pulse rounded-lg bg-white/5" />
          ) : finishedMatches.length === 0 ? (
            <p className="text-xs text-white/55">
              No recent final scores for{' '}
              {selectedSport ? selectedSport.name : 'this view'}.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {finishedMatches.map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => setMediaViewer({ kind: 'match', match })}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b1220] px-3 py-1.5 text-left text-xs transition hover:border-[#39ff14]/50"
                >
                  <span className="text-white/50">
                    {match.sport?.name ?? 'Sport'}
                  </span>
                  <span className="font-semibold text-white">
                    {match.home_team}{' '}
                    <span className="mx-1 font-black text-[#39ff14]">
                      {match.home_score} - {match.away_score}
                    </span>{' '}
                    {match.away_team}
                  </span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/75">
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
        className="scroll-mt-20 border-y border-white/6 bg-[#0e1727] px-5 py-16 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Find your game"
            title="Explore sports"
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
                    className="min-h-[172px] animate-pulse rounded-2xl border border-white/10 bg-[#1f2937]/40"
                  />
                ))
              : sports.map((sport) => {
                  const isSelected = selectedSportSlug === sport.slug
                  return (
                    <button
                      type="button"
                      key={sport.id}
                      onClick={() =>
                        setSelectedSportSlug((prev) =>
                          prev === sport.slug ? null : sport.slug,
                        )
                      }
                      className={`sport-tile flex flex-col justify-between bg-gradient-to-br text-left ${sport.gradient_class} ${
                        isSelected ? 'ring-2 ring-[#39ff14]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#39ff14]/25 bg-[#0b1220]/70">
                          <SportLineIcon
                            slug={sport.slug}
                            fallback={sport.icon}
                          />
                        </span>
                        <ChevronRight
                          size={15}
                          className={
                            isSelected ? 'text-[#39ff14]' : 'text-white/40'
                          }
                        />
                      </div>
                      <div className="mt-6">
                        <h3 className="font-bold text-white">{sport.name}</h3>
                        <p className="mt-1 text-[11px] leading-snug text-white/60">
                          {getSportSubtitle(sport.slug)}
                        </p>
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-[#39ff14]/85">
                          {formatEventCount(sport.event_count)}
                        </p>
                      </div>
                    </button>
                  )
                })}
          </div>
        </div>
      </section>

      {/* SECTION 4: Upcoming Matches */}
      <section
        id="schedule"
        className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 lg:px-8"
      >
        <SectionHeading
          eyebrow="Plan your watchlist"
          title="Upcoming matches"
          action="View full schedule"
          onAction={() => void handleOpenMatchCenter('upcoming')}
        />
        {catalogLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="min-h-[248px] animate-pulse rounded-2xl border border-white/10 bg-[#1f2937]/40"
              />
            ))}
          </div>
        ) : upcomingMatches.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#1f2937]/40 p-8 text-center">
            <p className="text-sm text-white/60">
              No upcoming {selectedSport ? `${selectedSport.name} ` : ''}matches
              are scheduled right now.
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
                serverDateUtc={serverDateUtc}
                onToggleReminder={(id) => void toggleReminder(id)}
                onOpenMatch={(m) => setMediaViewer({ kind: 'match', match: m })}
              />
            ))}
          </div>
        )}
      </section>

      {/* SECTION 5: Featured Highlights */}
      <section
        id="highlights"
        className="scroll-mt-20 border-y border-white/6 bg-[#0e1727] px-5 py-16 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Catch up"
            title="Featured highlights"
            action="View all highlights"
            onAction={() => setArchiveMode('highlights')}
          />
          {catalogLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-h-[248px] animate-pulse rounded-2xl border border-white/10 bg-[#1f2937]/40" />
              <div className="min-h-[248px] animate-pulse rounded-2xl border border-white/10 bg-[#1f2937]/40" />
            </div>
          ) : showcaseHighlights.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#1f2937]/40 p-8 text-center">
              <p className="text-sm text-white/60">
                No {selectedSport ? `${selectedSport.name} ` : ''}highlights
                published yet.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {showcaseHighlights.map((highlight) => (
                <article
                  key={highlight.id}
                  onClick={() =>
                    setMediaViewer({ kind: 'highlight', highlight })
                  }
                  className={`highlight-card group cursor-pointer ${
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
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#39ff14]/35 bg-[#0b1220]/75 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#39ff14] backdrop-blur">
                        {highlight.sport?.icon && (
                          <span>{highlight.sport.icon}</span>
                        )}
                        {highlight.badge}
                      </span>
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
          action="View all news"
          onAction={() => setArchiveMode('news')}
        />
        {catalogLoading ? (
          <div className="grid gap-5 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="aspect-[1.2] animate-pulse rounded-xl border border-white/10 bg-[#1f2937]/40"
              />
            ))}
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#1f2937]/40 p-8 text-center">
            <p className="text-sm text-white/60">
              No {selectedSport ? `${selectedSport.name} ` : ''}news articles
              available yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {filteredNews.map((item) => (
              <article
                key={item.id}
                onClick={() => setActiveArticle(item)}
                className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-white/10 bg-[#0e1727]/75 p-4 transition hover:border-[#39ff14]/45"
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
                  <h3 className="text-lg font-bold leading-snug text-white transition group-hover:text-[#39ff14]">
                    {item.title}
                  </h3>
                  {item.summary && (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/55">
                      {item.summary}
                    </p>
                  )}
                </div>
                <p className="mt-4 border-t border-white/8 pt-3 text-xs text-white/45">
                  {formatArticleDate(item.published_at)} &nbsp;•&nbsp;{' '}
                  {item.read_time}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 7: Promotional Membership Banner + Multi-Column Footer */}
      <section
        id="pricing"
        className="relative mx-5 mb-16 scroll-mt-20 overflow-hidden rounded-3xl bg-gradient-to-r from-[#39ff14] via-[#34ea12] to-[#1aa80b] px-6 py-10 text-[#0b1220] sm:px-12 sm:py-12 lg:mx-auto lg:max-w-7xl"
      >
        <div className="relative z-10 max-w-xl">
          <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#0b1220]/70">
            Your sport. Your way.
          </p>
          <h2 className="mt-2.5 text-3xl font-black uppercase tracking-tight sm:text-4xl">
            Go beyond the highlights.
          </h2>
          <p className="mt-3 max-w-md text-sm font-medium leading-6 text-[#0b1220]/80">
            Create your SPORTIVRA account for personalised match reminders,
            favourite sport tracking, highlights, and real-time fixture updates.
          </p>
          <button
            type="button"
            onClick={() => setAuthModalMode(user ? 'account' : 'signup')}
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0b1220] px-6 text-sm font-bold text-white transition hover:bg-[#1f2937]"
          >
            {user ? 'Manage account' : 'Join SPORTIVRA'}{' '}
            <ArrowRight size={16} />
          </button>
        </div>
        <Trophy className="absolute -bottom-8 right-4 size-44 rotate-12 text-[#0b1220]/15 sm:right-14 sm:size-60" />
      </section>

      <footer className="border-t border-white/8 bg-[#080e19] px-5 pb-10 pt-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
            <div className="col-span-2">
              <Brand />
              <p className="mt-3 max-w-xs text-xs leading-relaxed text-white/50">
                The international home for live scores, upcoming fixtures,
                on-demand highlights, and sports stories that matter.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Product
              </h3>
              <ul className="mt-3 space-y-2.5 text-xs text-white/55">
                <li>
                  <a href="#live" className="transition hover:text-[#39ff14]">
                    Live Matches
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => void handleOpenMatchCenter('finished')}
                    className="transition hover:text-[#39ff14]"
                  >
                    Scores
                  </button>
                </li>
                <li>
                  <a
                    href="#highlights"
                    className="transition hover:text-[#39ff14]"
                  >
                    Highlights
                  </a>
                </li>
                <li>
                  <a
                    href="#schedule"
                    className="transition hover:text-[#39ff14]"
                  >
                    Schedule
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Sports
              </h3>
              <ul className="mt-3 space-y-2.5 text-xs text-white/55">
                {catalogLoading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <li
                      key={idx}
                      className="h-3.5 w-20 animate-pulse rounded bg-white/10"
                    />
                  ))
                ) : sports.length === 0 ? (
                  <li className="text-white/40">No sports loaded</li>
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
                        className="transition hover:text-[#39ff14]"
                      >
                        {sport.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Company
              </h3>
              <ul className="mt-3 space-y-2.5 text-xs text-white/55">
                <li>
                  <button
                    type="button"
                    onClick={() => setInfoTopic('About us')}
                    className="transition hover:text-[#39ff14]"
                  >
                    About us
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setInfoTopic('Careers')}
                    className="transition hover:text-[#39ff14]"
                  >
                    Careers
                  </button>
                </li>
                <li>
                  <a href="#news" className="transition hover:text-[#39ff14]">
                    Newsroom
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Support
              </h3>
              <ul className="mt-3 space-y-2.5 text-xs text-white/55">
                <li>
                  <button
                    type="button"
                    onClick={() => setAuthModalMode(user ? 'account' : 'signin')}
                    className="transition hover:text-[#39ff14]"
                  >
                    {user ? 'My Account' : 'Sign in'}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setInfoTopic('Help centre')}
                    className="transition hover:text-[#39ff14]"
                  >
                    Help centre
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setInfoTopic('Privacy')}
                    className="transition hover:text-[#39ff14]"
                  >
                    Privacy policy
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setInfoTopic('Terms')}
                    className="transition hover:text-[#39ff14]"
                  >
                    Terms of use
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-4 border-t border-white/8 pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 SPORTIVRA. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-white/45">
              <span className="inline-flex items-center gap-1.5">
                <Globe size={13} className="text-[#39ff14]" /> Web
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

      {authModalMode && (
        <AuthAccountModal
          initialMode={authModalMode}
          user={user}
          profile={profile}
          sports={sports}
          remindedMatches={remindedMatches}
          pendingReminderMessage={
            pendingReminderMatchId
              ? 'Sign in or create an account to save match reminders to SPORTIVRA.'
              : null
          }
          onClose={() => {
            setAuthModalMode(null)
            setPendingReminderMatchId(null)
          }}
          onAuthSuccess={handleAuthSuccess}
          onProfileUpdated={(updated) => setProfile(updated)}
          onRemoveReminder={handleRemoveReminderFromAccount}
          onSignedOut={() => {
            setUser(null)
            setProfile(null)
            setRemindedIds(new Set())
            showToast('Signed out of SPORTIVRA.')
          }}
        />
      )}

      {mediaViewer && (
        <MediaViewerModal
          item={mediaViewer}
          remindedIds={remindedIds}
          serverDateUtc={serverDateUtc}
          onToggleReminder={toggleReminder}
          onClose={() => setMediaViewer(null)}
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
          remindedIds={remindedIds}
          serverDateUtc={serverDateUtc}
          onToggleReminder={toggleReminder}
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
          newsArticles={
            selectedSport
              ? newsArticles.filter((a) => a.sport_id === selectedSport.id)
              : newsArticles
          }
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
              ? 'border-[#ff3b45]/50 bg-[#0e1727]/95 text-[#ff8b91]'
              : 'border-[#39ff14]/45 bg-[#0e1727]/95 text-[#a8ff9d]'
          }`}
        >
          <Bell size={14} className="shrink-0" />
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="text-white/50 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  )
}
