import crypto from 'node:crypto'
import { getPaystackSecretKey } from './env'
import type {
  BillingProvider,
  CheckoutInitInput,
  CheckoutInitResult,
  SubscriptionManageLinkResult,
  VerifiedTransactionResult,
} from './provider'

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/billing/paystack.ts must only be imported in server-side modules.',
  )
}

const PAYSTACK_API_BASE = 'https://api.paystack.co'
const PAYSTACK_TIMEOUT_MS = 15_000

export class PaystackApiError extends Error {
  readonly statusCode: number
  readonly responseBody: unknown

  constructor(message: string, statusCode: number, responseBody?: unknown) {
    super(message)
    this.name = 'PaystackApiError'
    this.statusCode = statusCode
    this.responseBody = responseBody
  }
}

export interface PaystackProviderOptions {
  secretKey?: string
  fetchImpl?: typeof fetch
  apiBaseUrl?: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function mapPaystackStatus(
  status: unknown,
): VerifiedTransactionResult['status'] {
  if (status === 'success') return 'success'
  if (status === 'failed' || status === 'reversed') return 'failed'
  if (status === 'abandoned') return 'abandoned'
  return 'pending'
}

export function verifyPaystackSignature(
  rawBody: string,
  signature: string | null | undefined,
  secretKey: string,
): boolean {
  if (!secretKey || !signature) return false
  const cleanSig = signature.trim()
  // Paystack signs raw body with HMAC-SHA512 hex digest (128 hex chars)
  if (!/^[0-9a-fA-F]{128}$/.test(cleanSig)) {
    return false
  }

  const expectedHex = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody, 'utf8')
    .digest('hex')

  const expectedBuf = Buffer.from(expectedHex, 'hex')
  const receivedBuf = Buffer.from(cleanSig, 'hex')

  if (expectedBuf.length !== receivedBuf.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuf, receivedBuf)
}

export function createPaystackProvider(
  options: PaystackProviderOptions = {},
): BillingProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const apiBaseUrl = (options.apiBaseUrl ?? PAYSTACK_API_BASE).replace(
    /\/+$/,
    '',
  )

  const resolveKey = () => options.secretKey?.trim() || getPaystackSecretKey()

  async function requestPaystack<T extends Record<string, unknown>>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: Record<string, unknown> },
  ): Promise<T> {
    const secretKey = resolveKey()
    const response = await fetchImpl(`${apiBaseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(PAYSTACK_TIMEOUT_MS),
    })

    let parsed: unknown = null
    try {
      parsed = await response.json()
    } catch {
      throw new PaystackApiError(
        `Paystack returned non-JSON response (${response.status}).`,
        response.status,
      )
    }

    const payload = asRecord(parsed)
    if (!response.ok || payload.status !== true) {
      const msg =
        asNonEmptyString(payload.message) ||
        `Paystack request failed with HTTP ${response.status}.`
      throw new PaystackApiError(msg, response.status, payload)
    }

    return payload as T
  }

  return {
    id: 'paystack',

    verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
      const secretKey = options.secretKey?.trim() || process.env.PAYSTACK_SECRET_KEY?.trim() || ''
      return verifyPaystackSignature(rawBody, signature, secretKey)
    },

    async initializeCheckout(
      input: CheckoutInitInput,
    ): Promise<CheckoutInitResult> {
      const payload = await requestPaystack<Record<string, unknown>>(
        '/transaction/initialize',
        {
          method: 'POST',
          body: {
            email: input.email,
            amount: String(input.amountMinor),
            currency: input.currency,
            reference: input.reference,
            callback_url: input.callbackUrl,
            plan: input.providerPlanRef,
            metadata: {
              user_id: input.userId,
              plan_id: input.planId,
              plan_code: input.planCode,
              billing_interval: input.billingInterval,
              checkout_ref: input.reference,
            },
          },
        },
      )

      const data = asRecord(payload.data)
      const authorizationUrl = asNonEmptyString(data.authorization_url)
      const returnedReference =
        asNonEmptyString(data.reference) || input.reference

      if (!authorizationUrl) {
        throw new PaystackApiError(
          'Paystack initialization succeeded without an authorization_url.',
          502,
          payload,
        )
      }

      return {
        provider: 'paystack',
        reference: returnedReference,
        authorizationUrl,
        accessCode: asNonEmptyString(data.access_code),
        raw: payload,
      }
    },

    async verifyTransaction(
      reference: string,
    ): Promise<VerifiedTransactionResult> {
      const cleanRef = reference.trim()
      const payload = await requestPaystack<Record<string, unknown>>(
        `/transaction/verify/${encodeURIComponent(cleanRef)}`,
        { method: 'GET' },
      )

      const data = asRecord(payload.data)
      const customer = asRecord(data.customer)
      const authorization = asRecord(data.authorization)
      const planObject = asRecord(data.plan_object)
      const subscriptionObject = asRecord(data.subscription)
      const metadata = asRecord(data.metadata)

      const returnedRef = asNonEmptyString(data.reference)
      if (!returnedRef || returnedRef !== cleanRef) {
        throw new PaystackApiError(
          'Paystack verification reference mismatch.',
          502,
          payload,
        )
      }

      const rawAmount = data.amount
      const amountMinor =
        typeof rawAmount === 'number' &&
        Number.isInteger(rawAmount) &&
        rawAmount >= 0
          ? rawAmount
          : -1
      const currency = asNonEmptyString(data.currency)?.toUpperCase() || ''

      if (amountMinor < 0 || !/^[A-Z]{3}$/.test(currency)) {
        throw new PaystackApiError(
          'Paystack verification returned an invalid amount or currency.',
          502,
          payload,
        )
      }

      const rawId = data.id
      const providerTransactionId =
        typeof rawId === 'number' || typeof rawId === 'string'
          ? String(rawId).trim() || null
          : null

      return {
        provider: 'paystack',
        reference: returnedRef,
        providerTransactionId,
        status: mapPaystackStatus(data.status),
        amountMinor,
        currency,
        paidAt: asNonEmptyString(data.paid_at) || asNonEmptyString(data.paidAt),
        channel: asNonEmptyString(data.channel),
        customerCode: asNonEmptyString(customer.customer_code),
        authorizationCode: asNonEmptyString(authorization.authorization_code),
        authorizationReusable: authorization.reusable === true,
        planCode:
          asNonEmptyString(data.plan) || asNonEmptyString(planObject.plan_code),
        subscriptionCode: asNonEmptyString(
          subscriptionObject.subscription_code,
        ),
        metadata,
        raw: payload,
      }
    },

    async disableSubscription(input: {
      subscriptionCode: string
      emailToken: string
    }): Promise<void> {
      await requestPaystack('/subscription/disable', {
        method: 'POST',
        body: {
          code: input.subscriptionCode,
          token: input.emailToken,
        },
      })
    },

    async generateManagementLink(
      subscriptionCode: string,
    ): Promise<SubscriptionManageLinkResult> {
      const payload = await requestPaystack<Record<string, unknown>>(
        `/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`,
        { method: 'GET' },
      )

      const data = asRecord(payload.data)
      const managementUrl = asNonEmptyString(data.link)
      if (!managementUrl) {
        throw new PaystackApiError(
          'Paystack did not return a subscription management URL.',
          502,
          payload,
        )
      }

      return {
        provider: 'paystack',
        subscriptionCode,
        managementUrl,
        raw: payload,
      }
    },
  }
}
