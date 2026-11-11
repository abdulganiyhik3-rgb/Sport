export type BillingProviderId = 'paystack'

export interface CheckoutInitInput {
  userId: string
  email: string
  planId: string
  planCode: string
  billingInterval: 'month' | 'year'
  amountMinor: number
  currency: string
  providerPlanRef: string
  reference: string
  callbackUrl: string
}

export interface CheckoutInitResult {
  provider: BillingProviderId
  reference: string
  authorizationUrl: string
  accessCode: string | null
  raw: Record<string, unknown>
}

export interface VerifiedTransactionResult {
  provider: BillingProviderId
  reference: string
  providerTransactionId: string | null
  status: 'success' | 'failed' | 'abandoned' | 'pending'
  amountMinor: number
  currency: string
  paidAt: string | null
  channel: string | null
  customerCode: string | null
  authorizationCode: string | null
  authorizationReusable: boolean
  planCode: string | null
  subscriptionCode: string | null
  metadata: Record<string, unknown>
  raw: Record<string, unknown>
}

export interface SubscriptionManageLinkResult {
  provider: BillingProviderId
  subscriptionCode: string
  managementUrl: string
  raw: Record<string, unknown>
}

export interface BillingProvider {
  readonly id: BillingProviderId
  initializeCheckout(input: CheckoutInitInput): Promise<CheckoutInitResult>
  verifyTransaction(reference: string): Promise<VerifiedTransactionResult>
  disableSubscription(input: {
    subscriptionCode: string
    emailToken: string
  }): Promise<void>
  generateManagementLink(
    subscriptionCode: string,
  ): Promise<SubscriptionManageLinkResult>
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean
}
