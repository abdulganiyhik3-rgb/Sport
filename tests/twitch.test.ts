import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createTwitchClip,
  exchangeTwitchAuthorizationCode,
  followTwitchChannel,
  getTwitchChannels,
  getTwitchClips,
  getTwitchFollowedChannels,
  getTwitchSchedule,
  getTwitchStreams,
  getTwitchSubscriptions,
  getTwitchUsers,
  getTwitchVideos,
  getTwitchAppAccessToken,
  refreshTwitchAccessToken,
  resetTwitchAppTokenCache,
  revokeTwitchAccessToken,
  searchTwitchCategories,
  searchTwitchChannels,
  TwitchApiError,
  unfollowTwitchChannel,
  validateTwitchAccessToken,
  type TwitchFetch,
} from '@/lib/twitch/api'
import {
  parseTwitchCursor,
  parseTwitchPageSize,
  resolveTwitchScopes,
  sanitizeTwitchReturnTo,
} from '@/lib/twitch/config'
import { decryptTwitchValue, encryptTwitchValue } from '@/lib/twitch/crypto'
import { isSameOriginRequest } from '@/lib/twitch/http'
import { GET as getTwitchConfig } from '@/app/api/twitch/config/route'
import { GET as discoverTwitch } from '@/app/api/twitch/discover/route'
import { POST as followTwitch } from '@/app/api/twitch/follow/route'
import { POST as createTwitchClipRoute } from '@/app/api/twitch/clips/route'
import { GET as startTwitchOAuth } from '@/app/api/twitch/oauth/start/route'

type RequestRecord = {
  url: string
  init?: RequestInit
}

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function withTwitchEnv<T>(callback: () => Promise<T>): Promise<T> {
  const previous = {
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    redirectUri: process.env.TWITCH_REDIRECT_URI,
    encryptionKey: process.env.TWITCH_TOKEN_ENCRYPTION_KEY,
  }
  process.env.TWITCH_CLIENT_ID = 'client-id-test'
  process.env.TWITCH_CLIENT_SECRET = 'client-secret-test'
  process.env.TWITCH_REDIRECT_URI =
    'https://sportivra.example.com/api/twitch/oauth/callback'
  process.env.TWITCH_TOKEN_ENCRYPTION_KEY = 'x'.repeat(32)

  return callback().finally(() => {
    if (previous.clientId === undefined) delete process.env.TWITCH_CLIENT_ID
    else process.env.TWITCH_CLIENT_ID = previous.clientId
    if (previous.clientSecret === undefined) delete process.env.TWITCH_CLIENT_SECRET
    else process.env.TWITCH_CLIENT_SECRET = previous.clientSecret
    if (previous.redirectUri === undefined) delete process.env.TWITCH_REDIRECT_URI
    else process.env.TWITCH_REDIRECT_URI = previous.redirectUri
    if (previous.encryptionKey === undefined) delete process.env.TWITCH_TOKEN_ENCRYPTION_KEY
    else process.env.TWITCH_TOKEN_ENCRYPTION_KEY = previous.encryptionKey
  })
}

function withoutTwitchEnv<T>(callback: () => Promise<T>): Promise<T> {
  const previous = {
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    redirectUri: process.env.TWITCH_REDIRECT_URI,
    encryptionKey: process.env.TWITCH_TOKEN_ENCRYPTION_KEY,
  }
  delete process.env.TWITCH_CLIENT_ID
  delete process.env.TWITCH_CLIENT_SECRET
  delete process.env.TWITCH_REDIRECT_URI
  delete process.env.TWITCH_TOKEN_ENCRYPTION_KEY

  return callback().finally(() => {
    if (previous.clientId === undefined) delete process.env.TWITCH_CLIENT_ID
    else process.env.TWITCH_CLIENT_ID = previous.clientId
    if (previous.clientSecret === undefined) delete process.env.TWITCH_CLIENT_SECRET
    else process.env.TWITCH_CLIENT_SECRET = previous.clientSecret
    if (previous.redirectUri === undefined) delete process.env.TWITCH_REDIRECT_URI
    else process.env.TWITCH_REDIRECT_URI = previous.redirectUri
    if (previous.encryptionKey === undefined) delete process.env.TWITCH_TOKEN_ENCRYPTION_KEY
    else process.env.TWITCH_TOKEN_ENCRYPTION_KEY = previous.encryptionKey
  })
}

describe('Twitch route boundaries', () => {
  it('reports public and OAuth readiness without exposing configuration values', async () => {
    await withoutTwitchEnv(async () => {
      const unconfigured = await getTwitchConfig(
        new Request('https://sportivra.example.com/api/twitch/config'),
      )
      assert.equal(unconfigured.status, 200)
      assert.deepEqual(await unconfigured.json(), {
        configured: false,
        oauthConfigured: false,
        embedScriptUrl: 'https://embed.twitch.tv/embed/v1.js',
      })
    })

    await withTwitchEnv(async () => {
      const configured = await getTwitchConfig(
        new Request('https://sportivra.example.com/api/twitch/config'),
      )
      assert.equal(configured.status, 200)
      const body = await configured.json() as Record<string, unknown>
      assert.equal(body.configured, true)
      assert.equal(body.oauthConfigured, true)
      assert.equal('clientSecret' in body, false)
      assert.equal('encryptionKey' in body, false)
    })
  })

  it('rejects invalid discovery requests before contacting Twitch', async () => {
    const invalidKind = await discoverTwitch(
      new Request('https://sportivra.example.com/api/twitch/discover?kind=unknown'),
    )
    assert.equal(invalidKind.status, 400)
    assert.equal((await invalidKind.json()).code, 'INVALID_KIND')

    const missingSearch = await discoverTwitch(
      new Request('https://sportivra.example.com/api/twitch/discover?kind=channels'),
    )
    assert.equal(missingSearch.status, 400)

    const missingScheduleId = await discoverTwitch(
      new Request('https://sportivra.example.com/api/twitch/discover?kind=schedule'),
    )
    assert.equal(missingScheduleId.status, 400)
  })

  it('rejects cross-origin follow and clip mutations before reading a session', async () => {
    const followResponse = await followTwitch(
      new Request('https://sportivra.example.com/api/twitch/follow', {
        method: 'POST',
        headers: { origin: 'https://evil.example.com', 'content-type': 'application/json' },
        body: JSON.stringify({ broadcasterId: '42' }),
      }),
    )
    assert.equal(followResponse.status, 403)
    assert.equal((await followResponse.json()).code, 'CSRF_REJECTED')

    const clipResponse = await createTwitchClipRoute(
      new Request('https://sportivra.example.com/api/twitch/clips', {
        method: 'POST',
        headers: { origin: 'https://evil.example.com', 'content-type': 'application/json' },
        body: JSON.stringify({ broadcasterId: '42' }),
      }),
    )
    assert.equal(clipResponse.status, 403)
    assert.equal((await clipResponse.json()).code, 'CSRF_REJECTED')
  })

  it('fails closed when OAuth is started without server credentials', async () => {
    await withoutTwitchEnv(async () => {
      const result = await startTwitchOAuth(
        new Request('https://sportivra.example.com/api/twitch/oauth/start'),
      )
      assert.equal(result.status, 503)
      assert.equal((await result.json()).code, 'TWITCH_NOT_CONFIGURED')
    })
  })
})

describe('Twitch configuration and encrypted session values', () => {
  it('uses least-privilege default scopes and supports explicit broadcaster capabilities', () => {
    assert.deepEqual(resolveTwitchScopes(null), [
      'user:read:follows',
      'user:edit:follows',
    ])
    assert.deepEqual(resolveTwitchScopes('follow,clips,subscriptions,unknown,__proto__'), [
      'user:read:follows',
      'user:edit:follows',
      'clips:edit',
      'channel:read:subscriptions',
    ])
  })

  it('rejects open redirects and clamps pagination inputs', () => {
    assert.equal(sanitizeTwitchReturnTo('/sports?twitch=1'), '/sports?twitch=1')
    assert.equal(sanitizeTwitchReturnTo('https://evil.example/steal'), '/')
    assert.equal(sanitizeTwitchReturnTo('//evil.example/steal'), '/')
    assert.equal(parseTwitchPageSize('999'), 100)
    assert.equal(parseTwitchPageSize('not-a-number'), 20)
    assert.equal(parseTwitchCursor('  cursor-123  '), 'cursor-123')
  })

  it('rejects cross-origin mutation requests while allowing same-origin and non-browser requests', () => {
    assert.equal(
      isSameOriginRequest(
        new Request('https://sportivra.example.com/api/twitch/follow', {
          method: 'POST',
          headers: { origin: 'https://evil.example.com' },
        }),
      ),
      false,
    )
    assert.equal(
      isSameOriginRequest(
        new Request('https://sportivra.example.com/api/twitch/follow', {
          method: 'POST',
          headers: { origin: 'https://sportivra.example.com' },
        }),
      ),
      true,
    )
    assert.equal(
      isSameOriginRequest(
        new Request('https://sportivra.example.com/api/twitch/follow', {
          method: 'POST',
        }),
      ),
      true,
    )
    assert.equal(
      isSameOriginRequest(
        new Request('http://localhost:3002/api/twitch/follow', {
          method: 'POST',
          headers: {
            origin: 'http://127.0.0.1:3002',
            host: '127.0.0.1:3002',
          },
        }),
      ),
      true,
    )
  })

  it('encrypts Twitch session data and rejects tampering', () => {
    return withTwitchEnv(async () => {
      const value = { userId: '123', accessToken: 'never-return-this-to-the-client' }
      const encrypted = encryptTwitchValue(value)
      assert.deepEqual(decryptTwitchValue<typeof value>(encrypted), value)
      const [iv, tag, ciphertext] = encrypted.split('.')
      const tamperedTag = `${tag.startsWith('A') ? 'B' : 'A'}${tag.slice(1)}`
      assert.equal(decryptTwitchValue(`${iv}.${tamperedTag}.${ciphertext}`), null)
    })
  })
})

describe('Twitch Helix API adapter', () => {
  it('authenticates with app credentials, sends Helix headers, and caches the app token', async () => {
    await withTwitchEnv(async () => {
      resetTwitchAppTokenCache()
      const requests: RequestRecord[] = []
      const fakeFetch: TwitchFetch = async (input, init) => {
        const url = String(input)
        requests.push({ url, init })
        if (url.includes('/oauth2/token')) {
          return response({ access_token: 'app-token', expires_in: 3600, token_type: 'bearer' })
        }
        return response({ data: [], pagination: {} })
      }

      const [firstToken, secondToken] = await Promise.all([
        getTwitchAppAccessToken(fakeFetch),
        getTwitchAppAccessToken(fakeFetch),
      ])
      assert.equal(firstToken, 'app-token')
      assert.equal(secondToken, 'app-token')
      await getTwitchStreams({ first: 10 }, { fetchImpl: fakeFetch })
      await getTwitchStreams({ first: 10 }, { fetchImpl: fakeFetch })

      const tokenRequests = requests.filter((request) => request.url.includes('/oauth2/token'))
      const helixRequests = requests.filter((request) => request.url.includes('/helix/streams'))
      assert.equal(tokenRequests.length, 1)
      assert.equal(helixRequests.length, 2)
      assert.equal(helixRequests[0].init?.headers instanceof Object, true)
      assert.equal(
        (helixRequests[0].init?.headers as Record<string, string>)['Client-Id'],
        'client-id-test',
      )
      assert.equal(
        (helixRequests[0].init?.headers as Record<string, string>).Authorization,
        'Bearer app-token',
      )
    })
  })

  it('covers public discovery, VODs, clips, schedules, follows, subscriptions and clip creation', async () => {
    await withTwitchEnv(async () => {
      resetTwitchAppTokenCache()
      const requests: RequestRecord[] = []
      const fakeFetch: TwitchFetch = async (input, init) => {
        const url = String(input)
        requests.push({ url, init })
        if (url.includes('/oauth2/token')) {
          return response({ access_token: 'app-token', refresh_token: 'refresh', expires_in: 3600, scope: [] })
        }
        if (url.includes('/oauth2/validate')) {
          return response({ client_id: 'client-id-test', login: 'broadcaster', scopes: ['user:edit:follows'], user_id: '42', expires_in: 3600 })
        }
        if (url.includes('/users')) return response({ data: [] })
        if (url.includes('/schedule')) return response({ data: { broadcaster_id: '42', broadcaster_name: 'Broadcaster', segments: [], pagination: {} }, pagination: {} })
        if (url.includes('/subscriptions')) return response({ broadcaster_id: '42', broadcaster_name: 'Broadcaster', total: 2, points: 2, data: [], pagination: {} })
        if (url.includes('/clips') && init?.method === 'POST') return response({ data: [{ id: 'clip-1', edit_url: 'https://clips.twitch.tv/edit/clip-1' }] }, 202)
        return response({ data: [], pagination: {} })
      }

      await searchTwitchChannels('football', { liveOnly: true, first: 5 }, { fetchImpl: fakeFetch })
      await searchTwitchCategories('football', { first: 5 }, { fetchImpl: fakeFetch })
      await getTwitchUsers({ ids: ['42'] }, { fetchImpl: fakeFetch })
      await getTwitchStreams({ gameIds: ['1'], userIds: ['42'], first: 20 }, { fetchImpl: fakeFetch })
      await getTwitchChannels(['42'], { fetchImpl: fakeFetch })
      await getTwitchVideos({ userId: '42', type: 'archive', first: 20 }, { fetchImpl: fakeFetch })
      await getTwitchClips({ broadcasterId: '42', first: 20 }, { fetchImpl: fakeFetch })
      const schedule = await getTwitchSchedule('42', { first: 20 }, { fetchImpl: fakeFetch })
      assert.equal(schedule.broadcaster_name, 'Broadcaster')
      assert.deepEqual(schedule.segments, [])
      await getTwitchFollowedChannels('99', { first: 20 }, { accessToken: 'user-token', fetchImpl: fakeFetch })
      await followTwitchChannel('99', '42', { accessToken: 'user-token', fetchImpl: fakeFetch })
      await unfollowTwitchChannel('99', '42', { accessToken: 'user-token', fetchImpl: fakeFetch })
      await getTwitchSubscriptions('42', { first: 20 }, { accessToken: 'broadcaster-token', fetchImpl: fakeFetch })
      const clip = await createTwitchClip('42', { accessToken: 'broadcaster-token', fetchImpl: fakeFetch })

      assert.equal(clip.data[0].id, 'clip-1')
      assert.ok(requests.some((request) => request.url.includes('/search/channels?')))
      assert.ok(requests.some((request) => request.url.includes('/search/categories?')))
      assert.ok(requests.some((request) => request.url.includes('/videos?user_id=42')))
      assert.ok(requests.some((request) => request.url.includes('/schedule?broadcaster_id=42')))
      assert.ok(requests.some((request) => request.url.includes('/channels/followed?user_id=99')))
      assert.ok(requests.some((request) => request.url.includes('/channels/follow?from_id=99&to_id=42')))
      assert.ok(requests.some((request) => request.url.includes('/subscriptions?broadcaster_id=42')))
      const clipRequest = requests.find(
        (request) => request.url.includes('/clips?broadcaster_id=42') && request.init?.method === 'POST',
      )
      assert.ok(clipRequest)
    })
  })

  it('surfaces Twitch rate limits without leaking credentials', async () => {
    await withTwitchEnv(async () => {
      resetTwitchAppTokenCache()
      const fakeFetch: TwitchFetch = async (input) => {
        if (String(input).includes('/oauth2/token')) {
          return response({ access_token: 'app-token', expires_in: 3600 })
        }
        return response(
          { error: 'Too Many Requests', status: 429, message: 'slow down' },
          429,
          { 'ratelimit-reset': '12345' },
        )
      }

      await assert.rejects(
        getTwitchStreams({}, { fetchImpl: fakeFetch }),
        (error: unknown) => {
          assert.equal(error instanceof TwitchApiError, true)
          assert.equal((error as TwitchApiError).statusCode, 429)
          assert.equal((error as TwitchApiError).retryAfter, '12345')
          assert.equal((error as Error).message.includes('app-token'), false)
          return true
        },
      )
    })
  })

  it('exchanges, refreshes and validates user OAuth tokens through official endpoints', async () => {
    await withTwitchEnv(async () => {
      const urls: string[] = []
      const fakeFetch: TwitchFetch = async (input) => {
        const url = String(input)
        urls.push(url)
        if (url.endsWith('/oauth2/validate')) {
          return response({ client_id: 'client-id-test', login: 'viewer', scopes: ['user:read:follows'], user_id: '9', expires_in: 3600 })
        }
        return response({ access_token: 'user-token', refresh_token: 'next-refresh', expires_in: 3600, scope: ['user:read:follows'] })
      }

      const exchanged = await exchangeTwitchAuthorizationCode('code', 'https://sportivra.example.com/api/twitch/oauth/callback', fakeFetch)
      const refreshed = await refreshTwitchAccessToken('refresh', fakeFetch)
      const validated = await validateTwitchAccessToken('user-token', fakeFetch)
      await revokeTwitchAccessToken('user-token', fakeFetch)

      assert.equal(exchanged.accessToken, 'user-token')
      assert.equal(refreshed.refreshToken, 'next-refresh')
      assert.equal(validated.user_id, '9')
      assert.ok(urls.some((url) => url.endsWith('/oauth2/token')))
      assert.ok(urls.some((url) => url.endsWith('/oauth2/validate')))
      assert.ok(urls.some((url) => url.endsWith('/oauth2/revoke')))
    })
  })
})
