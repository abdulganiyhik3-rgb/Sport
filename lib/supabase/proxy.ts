import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from './types'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return supabaseResponse
  }

  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-'))

  if (!hasSupabaseCookie) {
    return supabaseResponse
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    global: {
      fetch: (input, init) => {
        const timeoutSignal = AbortSignal.timeout(1200)
        const signal = init?.signal
          ? AbortSignal.any([init.signal, timeoutSignal])
          : timeoutSignal
        return fetch(input, { ...init, signal })
      },
    },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        supabaseResponse = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
      },
    },
  })

  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ])
  } catch {
    // Allow browser client hydration if server-side egress is restricted
  }

  return supabaseResponse
}
