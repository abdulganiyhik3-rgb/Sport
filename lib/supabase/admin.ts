import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/supabase/admin.ts must only be imported in server-side modules.',
  )
}

export type AdminSupabaseClient = SupabaseClient<Database>

function resolveSupabaseAdminConfig(): { url: string; serviceRoleKey: string } {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''

  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) environment variable.',
    )
  }

  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY server environment variable.',
    )
  }

  return { url, serviceRoleKey }
}

export function createAdminClient(): AdminSupabaseClient {
  const { url, serviceRoleKey } = resolveSupabaseAdminConfig()

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    db: {
      retry: false,
    },
  })
}
