import { NextResponse } from 'next/server'
import { createAdminClient, type AdminSupabaseClient } from '@/lib/supabase/admin'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getCronSecret,
  resolveServerAppOrigin,
  timingSafeEqualSecret,
} from './env'
import { createPaystackProvider } from './paystack'
import type { BillingProvider } from './provider'
import {
  BillingError,
  cancelUserSubscription,
  createUserManageLink,
  getUserBillingOverview,
  initializeSubscriptionCheckout,
  listPublicPlans,
  processPaystackWebhook,
  runExpireOverdueSubscriptions,
  verifyAndActivateCheckout,
} from './service'

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/billing/handlers.ts must only be imported in server-side modules.',
  )
}

export interface SessionAuthUser {
  id: string
  email: string | null
}

export interface BillingHandlerDeps {
  getSessionUser?: () => Promise<SessionAuthUser | null>
  getAdminClient?: () => AdminSupabaseClient
  getProvider?: () => BillingProvider
  resolveOrigin?: (requestUrl?: string) => string
  getExpectedCronSecret?: () => string
}

async function defaultGetSessionUser(): Promise<SessionAuthUser | null> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null
  return {
    id: user.id,
    email: user.email ?? null,
  }
}

function defaultGetAdminClient(): AdminSupabaseClient {
  return createAdminClient()
}

function defaultGetProvider(): BillingProvider {
  return createPaystackProvider()
}

function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}

function jsonError(err: unknown): NextResponse {
  if (err instanceof BillingError) {
    return noStoreJson({ error: err.message, code: err.code }, err.statusCode)
  }

  return noStoreJson(
    { error: 'Internal billing service error.', code: 'INTERNAL_ERROR' },
    500,
  )
}

export async function handleGetBillingPlans(
  deps: BillingHandlerDeps = {},
): Promise<NextResponse> {
  try {
    let client: AdminSupabaseClient
    if (deps.getAdminClient) {
      client = deps.getAdminClient()
    } else if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      client = createAdminClient()
    } else {
      // subscription_plans is intentionally readable via anon/authenticated RLS;
      // allow public plan catalog reads when service_role is absent in local preview.
      client = await createServerSupabaseClient()
    }

    const result = await listPublicPlans(client)
    return noStoreJson(result, 200)
  } catch (err) {
    return jsonError(err)
  }
}

export async function handlePostCheckout(
  request: Request,
  deps: BillingHandlerDeps = {},
): Promise<NextResponse> {
  try {
    const user = await (deps.getSessionUser ?? defaultGetSessionUser)()
    if (!user) {
      throw new BillingError(401, 'UNAUTHENTICATED', 'Authentication required.')
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new BillingError(400, 'INVALID_JSON', 'Invalid JSON request body.')
    }

    const planCode =
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      typeof (body as { planCode?: unknown }).planCode === 'string'
        ? (body as { planCode: string }).planCode
        : ''

    const admin = (deps.getAdminClient ?? defaultGetAdminClient)()
    const provider = (deps.getProvider ?? defaultGetProvider)()
    const appOrigin = (deps.resolveOrigin ?? resolveServerAppOrigin)(
      request.url,
    )

    const result = await initializeSubscriptionCheckout(
      { admin, provider },
      {
        userId: user.id,
        userEmail: user.email,
        planCode,
        appOrigin,
      },
    )

    return noStoreJson(result, 200)
  } catch (err) {
    return jsonError(err)
  }
}

export async function handleVerifyCheckout(
  request: Request,
  deps: BillingHandlerDeps = {},
): Promise<NextResponse> {
  try {
    const user = await (deps.getSessionUser ?? defaultGetSessionUser)()
    if (!user) {
      throw new BillingError(401, 'UNAUTHENTICATED', 'Authentication required.')
    }

    const url = new URL(request.url)
    let reference =
      url.searchParams.get('reference') ||
      url.searchParams.get('trxref') ||
      ''

    if (!reference && request.method === 'POST') {
      try {
        const body = (await request.json()) as {
          reference?: unknown
          trxref?: unknown
        }
        if (typeof body?.reference === 'string') {
          reference = body.reference
        } else if (typeof body?.trxref === 'string') {
          reference = body.trxref
        }
      } catch {
        throw new BillingError(400, 'INVALID_JSON', 'Invalid JSON request body.')
      }
    }

    const admin = (deps.getAdminClient ?? defaultGetAdminClient)()
    const provider = (deps.getProvider ?? defaultGetProvider)()

    const result = await verifyAndActivateCheckout(
      { admin, provider },
      {
        userId: user.id,
        reference,
      },
    )

    return noStoreJson(result, 200)
  } catch (err) {
    return jsonError(err)
  }
}

export async function handleGetUserSubscription(
  deps: BillingHandlerDeps = {},
): Promise<NextResponse> {
  try {
    const user = await (deps.getSessionUser ?? defaultGetSessionUser)()
    if (!user) {
      throw new BillingError(401, 'UNAUTHENTICATED', 'Authentication required.')
    }

    const admin = (deps.getAdminClient ?? defaultGetAdminClient)()
    const overview = await getUserBillingOverview(admin, user.id)
    return noStoreJson(overview, 200)
  } catch (err) {
    return jsonError(err)
  }
}

export async function handleCancelUserSubscription(
  deps: BillingHandlerDeps = {},
): Promise<NextResponse> {
  try {
    const user = await (deps.getSessionUser ?? defaultGetSessionUser)()
    if (!user) {
      throw new BillingError(401, 'UNAUTHENTICATED', 'Authentication required.')
    }

    const admin = (deps.getAdminClient ?? defaultGetAdminClient)()
    const provider = (deps.getProvider ?? defaultGetProvider)()

    const result = await cancelUserSubscription({ admin, provider }, user.id)
    return noStoreJson(result, 200)
  } catch (err) {
    return jsonError(err)
  }
}

export async function handleCreateManageLink(
  deps: BillingHandlerDeps = {},
): Promise<NextResponse> {
  try {
    const user = await (deps.getSessionUser ?? defaultGetSessionUser)()
    if (!user) {
      throw new BillingError(401, 'UNAUTHENTICATED', 'Authentication required.')
    }

    const admin = (deps.getAdminClient ?? defaultGetAdminClient)()
    const provider = (deps.getProvider ?? defaultGetProvider)()

    const result = await createUserManageLink({ admin, provider }, user.id)
    return noStoreJson(result, 200)
  } catch (err) {
    return jsonError(err)
  }
}

export async function handlePaystackWebhook(
  request: Request,
  deps: BillingHandlerDeps = {},
): Promise<NextResponse> {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-paystack-signature')

    const admin = (deps.getAdminClient ?? defaultGetAdminClient)()
    const provider = (deps.getProvider ?? defaultGetProvider)()

    const result = await processPaystackWebhook(
      { admin, provider },
      { rawBody, signature },
    )

    return noStoreJson(result, 200)
  } catch (err) {
    return jsonError(err)
  }
}

export async function handleExpireOverdueCron(
  request: Request,
  deps: BillingHandlerDeps = {},
): Promise<NextResponse> {
  try {
    const expectedSecret = (deps.getExpectedCronSecret ?? getCronSecret)()
    if (!expectedSecret) {
      throw new BillingError(
        503,
        'CRON_NOT_CONFIGURED',
        'CRON_SECRET is not configured.',
      )
    }

    const authHeader = request.headers.get('authorization') || ''
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
    const providedToken = match?.[1]?.trim() || ''

    if (!timingSafeEqualSecret(providedToken, expectedSecret)) {
      throw new BillingError(401, 'UNAUTHORIZED', 'Unauthorized cron request.')
    }

    const url = new URL(request.url)
    const graceInterval = url.searchParams.get('grace') || '0 seconds'

    const admin = (deps.getAdminClient ?? defaultGetAdminClient)()
    const result = await runExpireOverdueSubscriptions(admin, graceInterval)
    return noStoreJson({ ok: true, ...result }, 200)
  } catch (err) {
    return jsonError(err)
  }
}
