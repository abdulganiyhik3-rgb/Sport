import type { Database } from '@/lib/supabase/types'

export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type MatchRow = Database['public']['Tables']['matches']['Row']
export type HighlightRow = Database['public']['Tables']['highlights']['Row']
export type PremiumMediaAssetRow =
  Database['public']['Tables']['premium_media_assets']['Row']
export type SubscriptionPlanRow =
  Database['public']['Tables']['subscription_plans']['Row']
export type SubscriptionRow =
  Database['public']['Tables']['subscriptions']['Row']
export type SubscriptionProviderTokenRowPlaceholder =
  Database['public']['Tables']['subscription_provider_tokens']['Row']
export type PaymentTransactionRow =
  Database['public']['Tables']['payment_transactions']['Row']
export type WebhookEventRow =
  Database['public']['Tables']['webhook_events']['Row']
