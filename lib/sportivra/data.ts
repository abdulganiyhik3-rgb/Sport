import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  HighlightRow,
  MatchRow,
  NewsArticleRow,
  ProfileRow,
  SportRow,
} from '@/lib/supabase/types'

export interface InitialCatalogData {
  sports: SportRow[]
  matches: MatchRow[]
  highlights: HighlightRow[]
  newsArticles: NewsArticleRow[]
  user: { id: string; email: string | null } | null
  profile: ProfileRow | null
  reminderMatchIds: string[]
  serverDateUtc: string
  serverHydrated: boolean
  loadError: string | null
}

export interface SearchResults {
  sports: SportRow[]
  matches: MatchRow[]
  highlights: HighlightRow[]
  newsArticles: NewsArticleRow[]
}

export async function fetchInitialCatalog(
  supabase: SupabaseClient<Database>,
): Promise<InitialCatalogData> {
  const serverDateUtc = new Date().toISOString().slice(0, 10)

  try {
    const [sportsRes, matchesRes, highlightsRes, newsRes, authRes] =
      await Promise.all([
        supabase
          .from('sports')
          .select('*')
          .order('sort_order', { ascending: true }),
        supabase
          .from('matches')
          .select('*, sport:sports(*)')
          .order('is_featured', { ascending: false })
          .order('sort_order', { ascending: true })
          .order('kickoff_at', { ascending: true }),
        supabase
          .from('highlights')
          .select('*, sport:sports(*)')
          .order('is_featured', { ascending: false })
          .order('sort_order', { ascending: true })
          .order('published_at', { ascending: false }),
        supabase
          .from('news_articles')
          .select('*, sport:sports(*)')
          .order('sort_order', { ascending: true })
          .order('published_at', { ascending: false }),
        supabase.auth.getUser(),
      ])

    const firstError =
      sportsRes.error || matchesRes.error || highlightsRes.error || newsRes.error

    if (firstError) {
      return {
        sports: [],
        matches: [],
        highlights: [],
        newsArticles: [],
        user: null,
        profile: null,
        reminderMatchIds: [],
        serverDateUtc,
        serverHydrated: false,
        loadError: firstError.message,
      }
    }

    const authUser = authRes.data.user
    let profile: ProfileRow | null = null
    let reminderMatchIds: string[] = []

    if (authUser) {
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

      if (profileRes.data) {
        profile = profileRes.data
      }
      if (remindersRes.data) {
        reminderMatchIds = remindersRes.data.map((r) => r.match_id)
      }
    }

    return {
      sports: sportsRes.data ?? [],
      matches: (matchesRes.data ?? []) as MatchRow[],
      highlights: (highlightsRes.data ?? []) as HighlightRow[],
      newsArticles: (newsRes.data ?? []) as NewsArticleRow[],
      user: authUser
        ? { id: authUser.id, email: authUser.email ?? null }
        : null,
      profile,
      reminderMatchIds,
      serverDateUtc,
      serverHydrated: true,
      loadError: null,
    }
  } catch (err) {
    return {
      sports: [],
      matches: [],
      highlights: [],
      newsArticles: [],
      user: null,
      profile: null,
      reminderMatchIds: [],
      serverDateUtc,
      serverHydrated: false,
      loadError:
        err instanceof Error ? err.message : 'Unable to load the live catalogue.',
    }
  }
}

export async function fetchMatchesFromSupabase(
  supabase: SupabaseClient<Database>,
): Promise<MatchRow[]> {
  const { data } = await supabase
    .from('matches')
    .select('*, sport:sports(*)')
    .order('is_featured', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('kickoff_at', { ascending: true })

  return (data ?? []) as MatchRow[]
}

export async function fetchSportFilteredCatalog(
  supabase: SupabaseClient<Database>,
  sportId: string,
): Promise<{
  matches: MatchRow[]
  highlights: HighlightRow[]
  newsArticles: NewsArticleRow[]
}> {
  const [matchesRes, highlightsRes, newsRes] = await Promise.all([
    supabase
      .from('matches')
      .select('*, sport:sports(*)')
      .eq('sport_id', sportId)
      .order('is_featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('kickoff_at', { ascending: true }),
    supabase
      .from('highlights')
      .select('*, sport:sports(*)')
      .eq('sport_id', sportId)
      .order('is_featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('published_at', { ascending: false }),
    supabase
      .from('news_articles')
      .select('*, sport:sports(*)')
      .eq('sport_id', sportId)
      .order('sort_order', { ascending: true })
      .order('published_at', { ascending: false }),
  ])

  return {
    matches: (matchesRes.data ?? []) as MatchRow[],
    highlights: (highlightsRes.data ?? []) as HighlightRow[],
    newsArticles: (newsRes.data ?? []) as NewsArticleRow[],
  }
}

export async function searchCatalog(
  supabase: SupabaseClient<Database>,
  rawQuery: string,
): Promise<SearchResults> {
  const sanitized = rawQuery
    .trim()
    .replace(/[%_,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!sanitized) {
    return { sports: [], matches: [], highlights: [], newsArticles: [] }
  }

  const pattern = `%${sanitized}%`

  const [sportsRes, matchesRes, highlightsRes, newsRes] = await Promise.all([
    supabase
      .from('sports')
      .select('*')
      .ilike('name', pattern)
      .order('sort_order', { ascending: true })
      .limit(6),
    supabase
      .from('matches')
      .select('*, sport:sports(*)')
      .or(
        `home_team.ilike.${pattern},away_team.ilike.${pattern},league.ilike.${pattern},headline.ilike.${pattern}`,
      )
      .order('kickoff_at', { ascending: true })
      .limit(8),
    supabase
      .from('highlights')
      .select('*, sport:sports(*)')
      .or(
        `title.ilike.${pattern},badge.ilike.${pattern},description.ilike.${pattern}`,
      )
      .order('sort_order', { ascending: true })
      .limit(6),
    supabase
      .from('news_articles')
      .select('*, sport:sports(*)')
      .or(
        `title.ilike.${pattern},category.ilike.${pattern},summary.ilike.${pattern}`,
      )
      .order('published_at', { ascending: false })
      .limit(6),
  ])

  return {
    sports: sportsRes.data ?? [],
    matches: (matchesRes.data ?? []) as MatchRow[],
    highlights: (highlightsRes.data ?? []) as HighlightRow[],
    newsArticles: (newsRes.data ?? []) as NewsArticleRow[],
  }
}

export function formatUtcTime(isoString: string): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '--:--'
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export function formatMatchDayLabel(
  isoString: string,
  referenceDateUtc: string,
): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return 'UPCOMING'

  const targetDay = date.toISOString().slice(0, 10)
  if (targetDay === referenceDateUtc) return 'TODAY'

  const ref = new Date(`${referenceDateUtc}T00:00:00.000Z`)
  const tomorrow = new Date(ref.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  if (targetDay === tomorrow) return 'TOMORROW'

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(date)
    .toUpperCase()
}

export function formatArticleDate(isoString: string): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function formatEventCount(count: number): string {
  return `${count.toLocaleString('en-US')} events`
}

export function resolveActiveNavSectionId(args: {
  scrollY: number
  innerHeight: number
  scrollHeight: number
  sections: Array<{ id: string; offsetTop: number }>
}): string {
  const { scrollY, innerHeight, scrollHeight, sections } = args
  const pricingSection = sections.find((section) => section.id === 'pricing')
  const maxScrollY = Math.max(0, scrollHeight - innerHeight)
  const nearBottom =
    maxScrollY > 0 &&
    scrollY > 0 &&
    innerHeight + scrollY >= scrollHeight - 40

  if (
    pricingSection &&
    (scrollY + 130 >= pricingSection.offsetTop || nearBottom)
  ) {
    return 'pricing'
  }

  if (scrollY < 260) {
    return 'top'
  }

  const offset = scrollY + 130
  for (const section of sections) {
    if (section.id === 'pricing') continue
    if (offset >= section.offsetTop) {
      return section.id
    }
  }

  return 'top'
}
