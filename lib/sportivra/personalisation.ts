import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  MatchRow,
  ProfileRow,
  SportRow,
} from '@/lib/supabase/types'

export const GUEST_PREFS_STORAGE_KEY = 'sportivra-guest-preferences'

export interface UserPreferences {
  favoriteSportIds: string[]
  favoriteTeams: string[]
}

export interface TeamCatalogItem {
  name: string
  sportId: string
  sportName: string
  sportSlug: string
  sportIcon: string
  league: string
  matches: MatchRow[]
  liveMatch: MatchRow | null
  upcomingMatches: MatchRow[]
  finishedMatches: MatchRow[]
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const trimmed = raw.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

export function readGuestPreferences(
  validSportIds?: Set<string>,
  validTeams?: Set<string>,
): UserPreferences {
  if (typeof window === 'undefined') {
    return { favoriteSportIds: [], favoriteTeams: [] }
  }

  try {
    const raw = window.localStorage.getItem(GUEST_PREFS_STORAGE_KEY)
    if (!raw) return { favoriteSportIds: [], favoriteTeams: [] }

    const parsed = JSON.parse(raw) as Partial<UserPreferences> | null
    const rawSports = Array.isArray(parsed?.favoriteSportIds)
      ? parsed.favoriteSportIds.filter((v): v is string => typeof v === 'string')
      : []
    const rawTeams = Array.isArray(parsed?.favoriteTeams)
      ? parsed.favoriteTeams.filter((v): v is string => typeof v === 'string')
      : []

    const dedupedSports = dedupeStrings(rawSports)
    const dedupedTeams = dedupeStrings(rawTeams)

    return {
      favoriteSportIds: validSportIds
        ? dedupedSports.filter((id) => validSportIds.has(id))
        : dedupedSports,
      favoriteTeams: validTeams
        ? dedupedTeams.filter((name) => validTeams.has(name))
        : dedupedTeams,
    }
  } catch {
    return { favoriteSportIds: [], favoriteTeams: [] }
  }
}

export function writeGuestPreferences(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return
  try {
    const sanitized: UserPreferences = {
      favoriteSportIds: dedupeStrings(prefs.favoriteSportIds),
      favoriteTeams: dedupeStrings(prefs.favoriteTeams),
    }
    if (
      sanitized.favoriteSportIds.length === 0 &&
      sanitized.favoriteTeams.length === 0
    ) {
      window.localStorage.removeItem(GUEST_PREFS_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(
      GUEST_PREFS_STORAGE_KEY,
      JSON.stringify(sanitized),
    )
  } catch {
    // Ignore storage unavailability (private mode / quota exceeded)
  }
}

export function clearGuestPreferences(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(GUEST_PREFS_STORAGE_KEY)
  } catch {
    // Ignore storage unavailability
  }
}

export function extractPreferencesFromProfile(
  profile: ProfileRow | null,
  validSportIds?: Set<string>,
  validTeams?: Set<string>,
): UserPreferences {
  if (!profile) return { favoriteSportIds: [], favoriteTeams: [] }

  const rawSports =
    Array.isArray(profile.favorite_sport_ids) &&
    profile.favorite_sport_ids.length > 0
      ? profile.favorite_sport_ids
      : profile.favorite_sport_id
        ? [profile.favorite_sport_id]
        : []

  const rawTeams = Array.isArray(profile.favorite_teams)
    ? profile.favorite_teams
    : []

  const dedupedSports = dedupeStrings(rawSports)
  const dedupedTeams = dedupeStrings(rawTeams)

  return {
    favoriteSportIds: validSportIds
      ? dedupedSports.filter((id) => validSportIds.has(id))
      : dedupedSports,
    favoriteTeams: validTeams
      ? dedupedTeams.filter((team) => validTeams.has(team))
      : dedupedTeams,
  }
}

export function mergePreferences(
  primary: UserPreferences,
  secondary: UserPreferences,
): UserPreferences {
  return {
    favoriteSportIds: dedupeStrings([
      ...primary.favoriteSportIds,
      ...secondary.favoriteSportIds,
    ]),
    favoriteTeams: dedupeStrings([
      ...primary.favoriteTeams,
      ...secondary.favoriteTeams,
    ]),
  }
}

export async function persistUserPreferences(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string | null,
  prefs: UserPreferences,
): Promise<{ profile: ProfileRow | null; error: string | null }> {
  const favoriteSportIds = dedupeStrings(prefs.favoriteSportIds)
  const favoriteTeams = dedupeStrings(prefs.favoriteTeams)

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        favorite_sport_ids: favoriteSportIds,
        favorite_sport_id: favoriteSportIds[0] ?? null,
        favorite_teams: favoriteTeams,
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single()

  if (error) {
    return { profile: null, error: error.message }
  }

  return { profile: data, error: null }
}

export function extractTeamsFromMatches(
  matches: MatchRow[],
  sports: SportRow[],
): TeamCatalogItem[] {
  const sportMap = new Map(sports.map((s) => [s.id, s]))
  const teamMap = new Map<string, TeamCatalogItem>()

  for (const match of matches) {
    const sport = match.sport ?? sportMap.get(match.sport_id) ?? null
    const sportId = match.sport_id
    const sportName = sport?.name ?? 'Sport'
    const sportSlug = sport?.slug ?? 'sport'
    const sportIcon = sport?.icon ?? '◉'

    for (const rawName of [match.home_team, match.away_team]) {
      const name = rawName.trim()
      if (!name) continue

      let entry = teamMap.get(name)
      if (!entry) {
        entry = {
          name,
          sportId,
          sportName,
          sportSlug,
          sportIcon,
          league: match.league,
          matches: [],
          liveMatch: null,
          upcomingMatches: [],
          finishedMatches: [],
        }
        teamMap.set(name, entry)
      }

      entry.matches.push(match)
      if (match.status === 'live' && !entry.liveMatch) {
        entry.liveMatch = match
      } else if (match.status === 'upcoming') {
        entry.upcomingMatches.push(match)
      } else if (match.status === 'finished') {
        entry.finishedMatches.push(match)
      }
    }
  }

  const sortOrderMap = new Map(sports.map((s) => [s.id, s.sort_order]))

  return Array.from(teamMap.values()).sort((a, b) => {
    const orderA = sortOrderMap.get(a.sportId) ?? 999
    const orderB = sortOrderMap.get(b.sportId) ?? 999
    if (orderA !== orderB) return orderA - orderB
    return a.name.localeCompare(b.name)
  })
}

export function prioritiseBySports<T extends { sport_id: string | null }>(
  items: T[],
  favoriteSportIds: readonly string[],
): T[] {
  if (favoriteSportIds.length === 0) return items
  const favSet = new Set(favoriteSportIds)
  const rankMap = new Map(favoriteSportIds.map((id, idx) => [id, idx]))

  return items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const aFav = Boolean(a.item.sport_id && favSet.has(a.item.sport_id))
      const bFav = Boolean(b.item.sport_id && favSet.has(b.item.sport_id))
      if (aFav !== bFav) return aFav ? -1 : 1

      if (aFav && bFav && a.item.sport_id && b.item.sport_id) {
        const rankA = rankMap.get(a.item.sport_id) ?? 999
        const rankB = rankMap.get(b.item.sport_id) ?? 999
        if (rankA !== rankB) return rankA - rankB
      }

      return a.originalIndex - b.originalIndex
    })
    .map((entry) => entry.item)
}
