import {
  getTwitchClips,
  getTwitchSchedule,
  getTwitchStreams,
  getTwitchVideos,
  searchTwitchCategories,
  searchTwitchChannels,
  TwitchApiError,
} from '@/lib/twitch/api'
import {
  parseTwitchCursor,
  parseTwitchPageSize,
  validateTwitchId,
} from '@/lib/twitch/config'
import { twitchErrorResponse, twitchJson } from '@/lib/twitch/http'
import type { TwitchDiscoveryKind, TwitchVideoType } from '@/lib/twitch/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const discoveryKinds = new Set<TwitchDiscoveryKind>([
  'streams',
  'channels',
  'categories',
  'videos',
  'clips',
  'schedule',
])

const videoTypes = new Set<TwitchVideoType>([
  'all',
  'archive',
  'highlight',
  'upload',
])

function requiredQuery(value: string | null, label: string): string {
  const normalized = value?.trim() || ''
  if (!normalized) throw new TwitchApiError(400, '/discover', `${label} is required.`)
  return normalized.slice(0, 100)
}

function validId(value: string, endpoint: string): string {
  try {
    return validateTwitchId(value)
  } catch {
    throw new TwitchApiError(400, endpoint, 'A valid Twitch ID is required.')
  }
}

function videoType(value: string | null): TwitchVideoType {
  const candidate = value || 'all'
  if (!videoTypes.has(candidate as TwitchVideoType)) {
    throw new TwitchApiError(400, '/videos', 'A supported Twitch video type is required.')
  }
  return candidate as TwitchVideoType
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const rawKind = url.searchParams.get('kind') as TwitchDiscoveryKind | null
    if (!rawKind || !discoveryKinds.has(rawKind)) {
      return twitchJson(
        { error: 'A supported Twitch discovery kind is required.', code: 'INVALID_KIND' },
        400,
      )
    }

    const first = parseTwitchPageSize(url.searchParams.get('first'))
    const after = parseTwitchCursor(url.searchParams.get('after'))
    const query = url.searchParams.get('q')?.trim() || ''

    switch (rawKind) {
      case 'channels': {
        const result = await searchTwitchChannels(requiredQuery(query, 'A channel search query'), {
          liveOnly: url.searchParams.get('liveOnly') === 'true',
          first,
          after,
        })
        return twitchJson({ kind: rawKind, ...result })
      }
      case 'categories': {
        const result = await searchTwitchCategories(requiredQuery(query, 'A category search query'), {
          first,
          after,
        })
        return twitchJson({ kind: rawKind, ...result })
      }
      case 'streams': {
        const gameId = url.searchParams.get('gameId')?.trim() || ''
        const userId = url.searchParams.get('userId')?.trim() || ''
        let gameIds = gameId ? [validId(gameId, '/streams')] : undefined
        let userIds = userId ? [validId(userId, '/streams')] : undefined
        let matchedCategories: Awaited<ReturnType<typeof searchTwitchCategories>>['data'] = []

        if (query && !gameIds?.length && !userIds?.length) {
          const [categories, channels] = await Promise.all([
            searchTwitchCategories(query, { first: 5 }),
            searchTwitchChannels(query, { liveOnly: true, first: 20 }),
          ])
          matchedCategories = categories.data
          gameIds = categories.data.map((category) => category.id)
          userIds = channels.data.map((channel) => channel.id)
        }

        if ((!gameIds || gameIds.length === 0) && (!userIds || userIds.length === 0)) {
          throw new TwitchApiError(400, '/streams', 'Choose a category, channel, or search query.')
        }

        const result = await getTwitchStreams({ gameIds, userIds, first, after })
        return twitchJson({ kind: rawKind, ...result, matchedCategories })
      }
      case 'videos': {
        let userId = url.searchParams.get('userId')?.trim() || undefined
        let gameId = url.searchParams.get('gameId')?.trim() || undefined
        let matchedCategories: Awaited<ReturnType<typeof searchTwitchCategories>>['data'] = []
        if (!userId && !gameId && query) {
          const [categories, channels] = await Promise.all([
            searchTwitchCategories(query, { first: 5 }),
            searchTwitchChannels(query, { first: 5 }),
          ])
          matchedCategories = categories.data
          userId = channels.data[0]?.id
          gameId = userId ? undefined : categories.data[0]?.id
        }
        if (!userId && !gameId) {
          throw new TwitchApiError(400, '/videos', 'A Twitch channel or category is required for VODs.')
        }
        const result = await getTwitchVideos({
          userId: userId ? validId(userId, '/videos') : undefined,
          gameId: gameId ? validId(gameId, '/videos') : undefined,
          type: videoType(url.searchParams.get('type')),
          first,
          after,
        })
        return twitchJson({ kind: rawKind, ...result, matchedCategories })
      }
      case 'clips': {
        let broadcasterId = url.searchParams.get('broadcasterId')?.trim() || undefined
        let gameId = url.searchParams.get('gameId')?.trim() || undefined
        let matchedCategories: Awaited<ReturnType<typeof searchTwitchCategories>>['data'] = []
        if (!broadcasterId && !gameId && query) {
          const [categories, channels] = await Promise.all([
            searchTwitchCategories(query, { first: 5 }),
            searchTwitchChannels(query, { first: 5 }),
          ])
          matchedCategories = categories.data
          broadcasterId = channels.data[0]?.id
          gameId = broadcasterId ? undefined : categories.data[0]?.id
        }
        if (!broadcasterId && !gameId) {
          throw new TwitchApiError(400, '/clips', 'A Twitch channel or category is required for clips.')
        }
        const result = await getTwitchClips({
          broadcasterId: broadcasterId ? validId(broadcasterId, '/clips') : undefined,
          gameId: gameId ? validId(gameId, '/clips') : undefined,
          first,
          after,
        })
        return twitchJson({ kind: rawKind, ...result, matchedCategories })
      }
      case 'schedule': {
        const broadcasterId = validId(
          url.searchParams.get('broadcasterId') || '',
          '/schedule',
        )
        try {
          const result = await getTwitchSchedule(broadcasterId, { first, after })
          return twitchJson({ kind: rawKind, ...result })
        } catch (error) {
          if (error instanceof TwitchApiError && error.statusCode === 404) {
            return twitchJson({
              kind: rawKind,
              broadcaster_id: broadcasterId,
              broadcaster_name: 'Twitch channel',
              segments: [],
              pagination: {},
            })
          }
          throw error
        }
      }
    }
  } catch (error) {
    return twitchErrorResponse(error)
  }
}
