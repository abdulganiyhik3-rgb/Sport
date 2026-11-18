import { cookies } from 'next/headers'
import {
  refreshTwitchAccessToken,
  validateTwitchAccessToken,
  type TwitchFetch,
} from '@/lib/twitch/api'
import { decryptTwitchValue, encryptTwitchValue } from '@/lib/twitch/crypto'
import type { TwitchSession } from '@/lib/twitch/types'

const TWITCH_SESSION_COOKIE = 'sportivra_twitch_session'
const TWITCH_OAUTH_STATE_COOKIE = 'sportivra_twitch_oauth_state'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const STATE_MAX_AGE_SECONDS = 60 * 10

export interface TwitchOAuthState {
  state: string
  returnTo: string
  scopes: string[]
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
})

function isTwitchSession(value: unknown): value is TwitchSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TwitchSession>
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    typeof candidate.expiresAt === 'number' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.login === 'string' &&
    typeof candidate.displayName === 'string' &&
    Array.isArray(candidate.scopes) &&
    candidate.scopes.every((scope) => typeof scope === 'string')
  )
}

function isOAuthState(value: unknown): value is TwitchOAuthState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TwitchOAuthState>
  return (
    typeof candidate.state === 'string' &&
    typeof candidate.returnTo === 'string' &&
    Array.isArray(candidate.scopes) &&
    candidate.scopes.every((scope) => typeof scope === 'string')
  )
}

export async function readTwitchSession(): Promise<TwitchSession | null> {
  const store = await cookies()
  const raw = store.get(TWITCH_SESSION_COOKIE)?.value
  if (!raw) return null
  const session = decryptTwitchValue<TwitchSession>(raw)
  return isTwitchSession(session) ? session : null
}

export async function writeTwitchSession(session: TwitchSession): Promise<void> {
  const store = await cookies()
  store.set(
    TWITCH_SESSION_COOKIE,
    encryptTwitchValue(session),
    cookieOptions(SESSION_MAX_AGE_SECONDS),
  )
}

export async function clearTwitchSession(): Promise<void> {
  const store = await cookies()
  store.delete(TWITCH_SESSION_COOKIE)
}

export async function readValidTwitchSession(
  fetchImpl?: TwitchFetch,
): Promise<TwitchSession | null> {
  const session = await readTwitchSession()
  if (!session) return null
  if (session.expiresAt > Date.now() + 60_000) return session

  try {
    const refreshed = await refreshTwitchAccessToken(
      session.refreshToken,
      fetchImpl,
    )
    const validated = await validateTwitchAccessToken(
      refreshed.accessToken,
      fetchImpl,
    )
    const nextSession: TwitchSession = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: Date.now() + refreshed.expiresIn * 1000,
      userId: validated.user_id,
      login: validated.login,
      displayName: session.displayName,
      scopes: refreshed.scopes.length > 0 ? refreshed.scopes : session.scopes,
    }
    await writeTwitchSession(nextSession)
    return nextSession
  } catch {
    await clearTwitchSession()
    return null
  }
}

export async function writeTwitchOAuthState(
  state: TwitchOAuthState,
): Promise<void> {
  const store = await cookies()
  store.set(
    TWITCH_OAUTH_STATE_COOKIE,
    encryptTwitchValue(state),
    cookieOptions(STATE_MAX_AGE_SECONDS),
  )
}

export async function readTwitchOAuthState(): Promise<TwitchOAuthState | null> {
  const store = await cookies()
  const raw = store.get(TWITCH_OAUTH_STATE_COOKIE)?.value
  if (!raw) return null
  const state = decryptTwitchValue<TwitchOAuthState>(raw)
  return isOAuthState(state) ? state : null
}

export async function clearTwitchOAuthState(): Promise<void> {
  const store = await cookies()
  store.delete(TWITCH_OAUTH_STATE_COOKIE)
}

export function hasTwitchScope(
  session: TwitchSession,
  requiredScope: string,
): boolean {
  return session.scopes.includes(requiredScope)
}

export { TWITCH_SESSION_COOKIE, TWITCH_OAUTH_STATE_COOKIE }
