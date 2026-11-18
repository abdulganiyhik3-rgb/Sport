import {
  getTwitchServerConfig,
  TWITCH_API_BASE,
  TWITCH_OAUTH_BASE,
} from '@/lib/twitch/config'
import type {
  TwitchCategory,
  TwitchChannel,
  TwitchClip,
  TwitchClipCreation,
  TwitchFollowedChannel,
  TwitchPage,
  TwitchSchedule,
  TwitchSearchChannel,
  TwitchStream,
  TwitchSubscription,
  TwitchUser,
  TwitchValidatedToken,
  TwitchVideo,
  TwitchVideoType,
} from '@/lib/twitch/types'

export type TwitchFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

interface CachedAppToken {
  accessToken: string
  expiresAt: number
}

export interface TwitchApiRequestOptions {
  accessToken?: string
  fetchImpl?: TwitchFetch
}

export interface TwitchSubscriptionsResponse {
  broadcaster_id: string
  broadcaster_name: string
  total: number
  points: number
  data: TwitchSubscription[]
  pagination?: { cursor?: string }
}

export class TwitchApiError extends Error {
  readonly statusCode: number
  readonly endpoint: string
  readonly retryAfter: string | null

  constructor(
    statusCode: number,
    endpoint: string,
    message: string,
    retryAfter: string | null = null,
  ) {
    super(message)
    this.name = 'TwitchApiError'
    this.statusCode = statusCode
    this.endpoint = endpoint
    this.retryAfter = retryAfter
  }
}

let appTokenCache: CachedAppToken | null = null
let appTokenRequest: Promise<string> | null = null
const TWITCH_REQUEST_TIMEOUT_MS = 10_000

function defaultFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, init)
}

function withTwitchTimeout(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(TWITCH_REQUEST_TIMEOUT_MS),
  }
}

function toQueryString(entries: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  return params.toString()
}

function appendMany(params: URLSearchParams, key: string, values: string[] | undefined) {
  for (const value of values?.slice(0, 100) ?? []) {
    if (value) params.append(key, value)
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function responseMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === 'object' &&
    'message' in body &&
    typeof body.message === 'string'
  ) {
    return body.message
  }
  return fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

export function resetTwitchAppTokenCache(): void {
  appTokenCache = null
  appTokenRequest = null
}

export async function getTwitchAppAccessToken(
  fetchImpl: TwitchFetch = defaultFetch,
): Promise<string> {
  const now = Date.now()
  if (appTokenCache && appTokenCache.expiresAt > now + 60_000) {
    return appTokenCache.accessToken
  }
  if (appTokenRequest) return appTokenRequest

  const request = (async () => {
    const config = getTwitchServerConfig()
    const response = await fetchImpl(
      `${TWITCH_OAUTH_BASE}/token`,
      withTwitchTimeout({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'client_credentials',
        }),
      }),
    )
    const body = await parseResponseBody(response)

    if (!response.ok || !body || typeof body !== 'object') {
      throw new TwitchApiError(
        response.status || 502,
        '/oauth2/token',
        'Unable to authenticate with Twitch right now.',
        response.headers.get('ratelimit-reset'),
      )
    }

    const accessToken = 'access_token' in body ? body.access_token : null
    const expiresIn = 'expires_in' in body ? body.expires_in : null
    if (
      typeof accessToken !== 'string' ||
      !accessToken ||
      typeof expiresIn !== 'number' ||
      expiresIn <= 0
    ) {
      throw new TwitchApiError(502, '/oauth2/token', 'Twitch returned an invalid app token.')
    }

    appTokenCache = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    }
    return accessToken
  })()

  appTokenRequest = request
  try {
    return await request
  } finally {
    if (appTokenRequest === request) appTokenRequest = null
  }
}

export async function exchangeTwitchAuthorizationCode(
  code: string,
  redirectUri: string,
  fetchImpl: TwitchFetch = defaultFetch,
): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
  scopes: string[]
}> {
  const config = getTwitchServerConfig()
  const response = await fetchImpl(
    `${TWITCH_OAUTH_BASE}/token`,
    withTwitchTimeout({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    }),
  )
  const body = await parseResponseBody(response)

  if (!response.ok || !body || typeof body !== 'object') {
    throw new TwitchApiError(502, '/oauth2/token', 'Twitch authorization could not be completed.')
  }

  const accessToken = 'access_token' in body ? body.access_token : null
  const refreshToken = 'refresh_token' in body ? body.refresh_token : null
  const expiresIn = 'expires_in' in body ? body.expires_in : null
  const scopes = 'scope' in body ? stringArray(body.scope) : []

  if (
    typeof accessToken !== 'string' ||
    !accessToken ||
    typeof refreshToken !== 'string' ||
    !refreshToken ||
    typeof expiresIn !== 'number' ||
    expiresIn <= 0
  ) {
    throw new TwitchApiError(502, '/oauth2/token', 'Twitch returned an invalid user token.')
  }

  return { accessToken, refreshToken, expiresIn, scopes }
}

export async function refreshTwitchAccessToken(
  refreshToken: string,
  fetchImpl: TwitchFetch = defaultFetch,
): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
  scopes: string[]
}> {
  const config = getTwitchServerConfig()
  const response = await fetchImpl(
    `${TWITCH_OAUTH_BASE}/token`,
    withTwitchTimeout({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    }),
  )
  const body = await parseResponseBody(response)

  if (!response.ok || !body || typeof body !== 'object') {
    throw new TwitchApiError(401, '/oauth2/token', 'The Twitch connection has expired.')
  }

  const accessToken = 'access_token' in body ? body.access_token : null
  const nextRefreshToken = 'refresh_token' in body ? body.refresh_token : refreshToken
  const expiresIn = 'expires_in' in body ? body.expires_in : null
  const scopes = 'scope' in body ? stringArray(body.scope) : []

  if (
    typeof accessToken !== 'string' ||
    !accessToken ||
    typeof nextRefreshToken !== 'string' ||
    !nextRefreshToken ||
    typeof expiresIn !== 'number' ||
    expiresIn <= 0
  ) {
    throw new TwitchApiError(401, '/oauth2/token', 'Twitch returned an invalid refreshed token.')
  }

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    expiresIn,
    scopes,
  }
}

export async function revokeTwitchAccessToken(
  accessToken: string,
  fetchImpl: TwitchFetch = defaultFetch,
): Promise<void> {
  const config = getTwitchServerConfig()
  const response = await fetchImpl(
    `${TWITCH_OAUTH_BASE}/revoke`,
    withTwitchTimeout({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        token: accessToken,
      }),
    }),
  )
  if (!response.ok) {
    throw new TwitchApiError(
      response.status || 502,
      '/oauth2/revoke',
      'Twitch token revocation failed.',
      response.headers.get('ratelimit-reset'),
    )
  }
}

export async function validateTwitchAccessToken(
  accessToken: string,
  fetchImpl: TwitchFetch = defaultFetch,
): Promise<TwitchValidatedToken> {
  const response = await fetchImpl(
    `${TWITCH_OAUTH_BASE}/validate`,
    withTwitchTimeout({
      headers: { Authorization: `OAuth ${accessToken}` },
    }),
  )
  const body = await parseResponseBody(response)

  if (!response.ok || !body || typeof body !== 'object') {
    throw new TwitchApiError(401, '/oauth2/validate', 'The Twitch connection is no longer valid.')
  }

  if (
    !('client_id' in body) ||
    !('login' in body) ||
    !('user_id' in body) ||
    !('expires_in' in body) ||
    typeof body.client_id !== 'string' ||
    !body.client_id ||
    typeof body.login !== 'string' ||
    !body.login ||
    typeof body.user_id !== 'string' ||
    !body.user_id ||
    typeof body.expires_in !== 'number' ||
    body.expires_in <= 0
  ) {
    throw new TwitchApiError(502, '/oauth2/validate', 'Twitch returned an invalid validation response.')
  }

  const config = getTwitchServerConfig()
  if (body.client_id !== config.clientId) {
    throw new TwitchApiError(401, '/oauth2/validate', 'The Twitch connection belongs to a different application.')
  }

  return {
    client_id: body.client_id,
    login: body.login,
    user_id: body.user_id,
    expires_in: body.expires_in,
    scopes: 'scopes' in body ? stringArray(body.scopes) : [],
  }
}

async function helixRequest<T>(
  path: string,
  options: TwitchApiRequestOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? defaultFetch
  const config = getTwitchServerConfig()
  const accessToken =
    options.accessToken ?? (await getTwitchAppAccessToken(fetchImpl))
  const response = await fetchImpl(
    `${TWITCH_API_BASE}${path}`,
    withTwitchTimeout({
      headers: {
        Accept: 'application/json',
        'Client-Id': config.clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  )
  const body = await parseResponseBody(response)

  if (!response.ok) {
    const message = response.status === 429
      ? 'Twitch rate limit reached. Please try again shortly.'
      : responseMessage(body, 'Twitch API request failed.')
    throw new TwitchApiError(
      response.status || 502,
      path,
      message,
      response.headers.get('ratelimit-reset'),
    )
  }

  return body as T
}

async function helixMutation<T>(
  path: string,
  method: 'POST' | 'DELETE',
  options: TwitchApiRequestOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? defaultFetch
  const config = getTwitchServerConfig()
  const accessToken = options.accessToken
  if (!accessToken) {
    throw new TwitchApiError(401, path, 'A connected Twitch account is required.')
  }

  const response = await fetchImpl(
    `${TWITCH_API_BASE}${path}`,
    withTwitchTimeout({
      method,
      headers: {
        Accept: 'application/json',
        'Client-Id': config.clientId,
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  )
  const body = await parseResponseBody(response)

  if (!response.ok) {
    throw new TwitchApiError(
      response.status || 502,
      path,
      responseMessage(body, 'Twitch API request failed.'),
      response.headers.get('ratelimit-reset'),
    )
  }

  return body as T
}

export async function getTwitchUsers(
  params: { ids?: string[]; logins?: string[] },
  options?: TwitchApiRequestOptions,
): Promise<TwitchPage<TwitchUser>> {
  const query = new URLSearchParams()
  appendMany(query, 'id', params.ids)
  appendMany(query, 'login', params.logins)
  return helixRequest<TwitchPage<TwitchUser>>(`/users?${query}`, options)
}

export async function searchTwitchChannels(
  query: string,
  params: { liveOnly?: boolean; first?: number; after?: string } = {},
  options?: TwitchApiRequestOptions,
): Promise<TwitchPage<TwitchSearchChannel>> {
  const search = toQueryString({
    query: query.trim().slice(0, 100),
    live_only: params.liveOnly ? 'true' : undefined,
    first: params.first,
    after: params.after,
  })
  return helixRequest<TwitchPage<TwitchSearchChannel>>(`/search/channels?${search}`, options)
}

export async function searchTwitchCategories(
  query: string,
  params: { first?: number; after?: string } = {},
  options?: TwitchApiRequestOptions,
): Promise<TwitchPage<TwitchCategory>> {
  const search = toQueryString({
    query: query.trim().slice(0, 100),
    first: params.first,
    after: params.after,
  })
  return helixRequest<TwitchPage<TwitchCategory>>(`/search/categories?${search}`, options)
}

export async function getTwitchStreams(
  params: {
    gameIds?: string[]
    userIds?: string[]
    language?: string
    first?: number
    after?: string
  } = {},
  options?: TwitchApiRequestOptions,
): Promise<TwitchPage<TwitchStream>> {
  const query = new URLSearchParams()
  appendMany(query, 'game_id', params.gameIds)
  appendMany(query, 'user_id', params.userIds)
  if (params.language) query.set('language', params.language.slice(0, 10))
  if (params.first) query.set('first', String(params.first))
  if (params.after) query.set('after', params.after.slice(0, 500))
  return helixRequest<TwitchPage<TwitchStream>>(`/streams?${query}`, options)
}

export async function getTwitchChannels(
  userIds: string[],
  options?: TwitchApiRequestOptions,
): Promise<TwitchPage<TwitchChannel>> {
  const query = new URLSearchParams()
  appendMany(query, 'broadcaster_id', userIds)
  return helixRequest<TwitchPage<TwitchChannel>>(`/channels?${query}`, options)
}

export async function getTwitchVideos(
  params: {
    userId?: string
    gameId?: string
    type?: TwitchVideoType
    first?: number
    after?: string
  },
  options?: TwitchApiRequestOptions,
): Promise<TwitchPage<TwitchVideo>> {
  const query = toQueryString({
    user_id: params.userId,
    game_id: params.gameId,
    type: params.type,
    first: params.first,
    after: params.after,
  })
  return helixRequest<TwitchPage<TwitchVideo>>(`/videos?${query}`, options)
}

export async function getTwitchClips(
  params: {
    broadcasterId?: string
    gameId?: string
    first?: number
    after?: string
  },
  options?: TwitchApiRequestOptions,
): Promise<TwitchPage<TwitchClip>> {
  const query = toQueryString({
    broadcaster_id: params.broadcasterId,
    game_id: params.gameId,
    first: params.first,
    after: params.after,
  })
  return helixRequest<TwitchPage<TwitchClip>>(`/clips?${query}`, options)
}

export async function getTwitchSchedule(
  broadcasterId: string,
  params: { first?: number; after?: string } = {},
  options?: TwitchApiRequestOptions,
): Promise<TwitchSchedule> {
  const query = toQueryString({
    broadcaster_id: broadcasterId,
    first: params.first,
    after: params.after,
  })
  const response = await helixRequest<{
    data: TwitchSchedule
    pagination?: TwitchSchedule['pagination']
  }>(`/schedule?${query}`, options)
  return {
    ...response.data,
    pagination: response.pagination,
  }
}

export async function getTwitchFollowedChannels(
  userId: string,
  params: { first?: number; after?: string } = {},
  options: TwitchApiRequestOptions,
): Promise<TwitchPage<TwitchFollowedChannel> & { total: number }> {
  const query = toQueryString({
    user_id: userId,
    first: params.first,
    after: params.after,
  })
  return helixRequest<TwitchPage<TwitchFollowedChannel> & { total: number }>(
    `/channels/followed?${query}`,
    options,
  )
}

export async function followTwitchChannel(
  userId: string,
  broadcasterId: string,
  options: TwitchApiRequestOptions,
): Promise<{ followed: boolean }> {
  const query = toQueryString({
    from_id: userId,
    to_id: broadcasterId,
  })
  await helixMutation<unknown>(`/channels/follow?${query}`, 'POST', options)
  return { followed: true }
}

export async function unfollowTwitchChannel(
  userId: string,
  broadcasterId: string,
  options: TwitchApiRequestOptions,
): Promise<{ followed: boolean }> {
  const query = toQueryString({
    from_id: userId,
    to_id: broadcasterId,
  })
  await helixMutation<unknown>(`/channels/follow?${query}`, 'DELETE', options)
  return { followed: false }
}

export async function getTwitchSubscriptions(
  broadcasterId: string,
  params: { first?: number; after?: string } = {},
  options: TwitchApiRequestOptions,
): Promise<TwitchSubscriptionsResponse> {
  const query = toQueryString({
    broadcaster_id: broadcasterId,
    first: params.first,
    after: params.after,
  })
  return helixRequest<TwitchSubscriptionsResponse>(`/subscriptions?${query}`, options)
}

export async function createTwitchClip(
  broadcasterId: string,
  options: TwitchApiRequestOptions & { hasDelay?: boolean },
): Promise<TwitchPage<TwitchClipCreation>> {
  const query = toQueryString({
    broadcaster_id: broadcasterId,
    has_delay: options.hasDelay ? 'true' : undefined,
  })
  return helixMutation<TwitchPage<TwitchClipCreation>>(`/clips?${query}`, 'POST', options)
}
