export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type MembershipTier = 'free' | 'pro' | 'premium'
export type MembershipStatus =
  | 'active'
  | 'inactive'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'incomplete'
export type UserRole = 'member' | 'admin'
export type AccessTier = 'free' | 'premium'
export type BillingInterval = 'none' | 'month' | 'year'
export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'incomplete'
export type TransactionStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'
export type WebhookProcessingStatus =
  | 'received'
  | 'processed'
  | 'ignored'
  | 'failed'
export type StreamFormat = 'hls' | 'mp4' | 'dash'

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {
      sports: {
        Row: {
          id: string
          slug: string
          name: string
          icon: string
          event_count: number
          gradient_class: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          icon: string
          event_count?: number
          gradient_class?: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          icon?: string
          event_count?: number
          gradient_class?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          id: string
          slug: string
          sport_id: string
          league: string
          headline: string | null
          home_team: string
          away_team: string
          home_score: number
          away_score: number
          status: 'live' | 'upcoming' | 'finished'
          match_clock: string | null
          kickoff_at: string
          is_featured: boolean
          image_url: string | null
          image_alt: string | null
          stream_url: string | null
          access_tier: AccessTier
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          sport_id: string
          league: string
          headline?: string | null
          home_team: string
          away_team: string
          home_score?: number
          away_score?: number
          status: 'live' | 'upcoming' | 'finished'
          match_clock?: string | null
          kickoff_at: string
          is_featured?: boolean
          image_url?: string | null
          image_alt?: string | null
          stream_url?: string | null
          access_tier?: AccessTier
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          sport_id?: string
          league?: string
          headline?: string | null
          home_team?: string
          away_team?: string
          home_score?: number
          away_score?: number
          status?: 'live' | 'upcoming' | 'finished'
          match_clock?: string | null
          kickoff_at?: string
          is_featured?: boolean
          image_url?: string | null
          image_alt?: string | null
          stream_url?: string | null
          access_tier?: AccessTier
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'matches_sport_id_fkey'
            columns: ['sport_id']
            isOneToOne: false
            referencedRelation: 'sports'
            referencedColumns: ['id']
          },
        ]
      }
      highlights: {
        Row: {
          id: string
          slug: string
          sport_id: string | null
          badge: string
          title: string
          description: string | null
          image_url: string
          image_alt: string | null
          video_url: string | null
          access_tier: AccessTier
          duration: string | null
          is_featured: boolean
          sort_order: number
          published_at: string
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          sport_id?: string | null
          badge: string
          title: string
          description?: string | null
          image_url: string
          image_alt?: string | null
          video_url?: string | null
          access_tier?: AccessTier
          duration?: string | null
          is_featured?: boolean
          sort_order?: number
          published_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          sport_id?: string | null
          badge?: string
          title?: string
          description?: string | null
          image_url?: string
          image_alt?: string | null
          video_url?: string | null
          access_tier?: AccessTier
          duration?: string | null
          is_featured?: boolean
          sort_order?: number
          published_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'highlights_sport_id_fkey'
            columns: ['sport_id']
            isOneToOne: false
            referencedRelation: 'sports'
            referencedColumns: ['id']
          },
        ]
      }
      news_articles: {
        Row: {
          id: string
          slug: string
          sport_id: string | null
          category: string
          title: string
          summary: string | null
          content: string | null
          image_url: string
          image_alt: string | null
          read_time: string
          published_at: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          sport_id?: string | null
          category: string
          title: string
          summary?: string | null
          content?: string | null
          image_url: string
          image_alt?: string | null
          read_time: string
          published_at?: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          sport_id?: string | null
          category?: string
          title?: string
          summary?: string | null
          content?: string | null
          image_url?: string
          image_alt?: string | null
          read_time?: string
          published_at?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'news_articles_sport_id_fkey'
            columns: ['sport_id']
            isOneToOne: false
            referencedRelation: 'sports'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          favorite_sport_id: string | null
          favorite_sport_ids: string[]
          favorite_teams: string[]
          role: UserRole
          membership_tier: MembershipTier
          membership_status: MembershipStatus
          provider_customer_ids: Json
          subscription_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          favorite_sport_id?: string | null
          favorite_sport_ids?: string[]
          favorite_teams?: string[]
          role?: UserRole
          membership_tier?: MembershipTier
          membership_status?: MembershipStatus
          provider_customer_ids?: Json
          subscription_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          favorite_sport_id?: string | null
          favorite_sport_ids?: string[]
          favorite_teams?: string[]
          role?: UserRole
          membership_tier?: MembershipTier
          membership_status?: MembershipStatus
          provider_customer_ids?: Json
          subscription_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_favorite_sport_id_fkey'
            columns: ['favorite_sport_id']
            isOneToOne: false
            referencedRelation: 'sports'
            referencedColumns: ['id']
          },
        ]
      }
      match_reminders: {
        Row: {
          id: string
          user_id: string
          match_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          match_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          match_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'match_reminders_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
        ]
      }
      subscription_plans: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          tier: AccessTier
          billing_interval: BillingInterval
          amount_minor: number | null
          currency: string | null
          provider: string | null
          provider_plan_refs: Json
          features: Json
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          tier: AccessTier
          billing_interval: BillingInterval
          amount_minor?: number | null
          currency?: string | null
          provider?: string | null
          provider_plan_refs?: Json
          features?: Json
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string | null
          tier?: AccessTier
          billing_interval?: BillingInterval
          amount_minor?: number | null
          currency?: string | null
          provider?: string | null
          provider_plan_refs?: Json
          features?: Json
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          plan_id: string
          provider: string
          provider_customer_ref: string | null
          provider_subscription_ref: string | null
          status: SubscriptionStatus
          billing_interval: 'month' | 'year'
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          cancelled_at: string | null
          ended_at: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          plan_id: string
          provider: string
          provider_customer_ref?: string | null
          provider_subscription_ref?: string | null
          status: SubscriptionStatus
          billing_interval: 'month' | 'year'
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          ended_at?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          plan_id?: string
          provider?: string
          provider_customer_ref?: string | null
          provider_subscription_ref?: string | null
          status?: SubscriptionStatus
          billing_interval?: 'month' | 'year'
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          ended_at?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'subscription_plans'
            referencedColumns: ['id']
          },
        ]
      }
      subscription_provider_tokens: {
        Row: {
          subscription_id: string
          provider: string
          email_token: string | null
          authorization_code: string | null
          management_url: string | null
          token_metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          subscription_id: string
          provider: string
          email_token?: string | null
          authorization_code?: string | null
          management_url?: string | null
          token_metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          subscription_id?: string
          provider?: string
          email_token?: string | null
          authorization_code?: string | null
          management_url?: string | null
          token_metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscription_provider_tokens_subscription_id_fkey'
            columns: ['subscription_id']
            isOneToOne: true
            referencedRelation: 'subscriptions'
            referencedColumns: ['id']
          },
        ]
      }
      payment_transactions: {
        Row: {
          id: string
          user_id: string
          subscription_id: string | null
          plan_id: string | null
          provider: string
          provider_transaction_ref: string | null
          provider_checkout_ref: string | null
          provider_invoice_ref: string | null
          expected_amount_minor: number | null
          expected_currency: string | null
          amount_minor: number
          currency: string
          status: TransactionStatus
          payment_channel: string | null
          paid_at: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          subscription_id?: string | null
          plan_id?: string | null
          provider: string
          provider_transaction_ref?: string | null
          provider_checkout_ref?: string | null
          provider_invoice_ref?: string | null
          expected_amount_minor?: number | null
          expected_currency?: string | null
          amount_minor: number
          currency: string
          status: TransactionStatus
          payment_channel?: string | null
          paid_at?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          subscription_id?: string | null
          plan_id?: string | null
          provider?: string
          provider_transaction_ref?: string | null
          provider_checkout_ref?: string | null
          provider_invoice_ref?: string | null
          expected_amount_minor?: number | null
          expected_currency?: string | null
          amount_minor?: number
          currency?: string
          status?: TransactionStatus
          payment_channel?: string | null
          paid_at?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payment_transactions_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'subscription_plans'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payment_transactions_subscription_id_fkey'
            columns: ['subscription_id']
            isOneToOne: false
            referencedRelation: 'subscriptions'
            referencedColumns: ['id']
          },
        ]
      }
      webhook_events: {
        Row: {
          id: string
          provider: string
          provider_event_id: string
          event_type: string
          signature_verified: boolean
          payload_hash: string | null
          payload: Json
          processing_status: WebhookProcessingStatus
          retry_count: number
          error_message: string | null
          received_at: string
          processed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          provider: string
          provider_event_id: string
          event_type: string
          signature_verified?: boolean
          payload_hash?: string | null
          payload: Json
          processing_status?: WebhookProcessingStatus
          retry_count?: number
          error_message?: string | null
          received_at?: string
          processed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          provider?: string
          provider_event_id?: string
          event_type?: string
          signature_verified?: boolean
          payload_hash?: string | null
          payload?: Json
          processing_status?: WebhookProcessingStatus
          retry_count?: number
          error_message?: string | null
          received_at?: string
          processed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      premium_media_assets: {
        Row: {
          id: string
          match_id: string | null
          highlight_id: string | null
          access_tier: 'premium'
          media_url: string
          stream_format: StreamFormat
          rights_holder: string
          license_reference: string | null
          permitted_regions: string[]
          license_starts_at: string | null
          license_expires_at: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          match_id?: string | null
          highlight_id?: string | null
          access_tier?: 'premium'
          media_url: string
          stream_format?: StreamFormat
          rights_holder: string
          license_reference?: string | null
          permitted_regions?: string[]
          license_starts_at?: string | null
          license_expires_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          match_id?: string | null
          highlight_id?: string | null
          access_tier?: 'premium'
          media_url?: string
          stream_format?: StreamFormat
          rights_holder?: string
          license_reference?: string | null
          permitted_regions?: string[]
          license_starts_at?: string | null
          license_expires_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'premium_media_assets_highlight_id_fkey'
            columns: ['highlight_id']
            isOneToOne: false
            referencedRelation: 'highlights'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'premium_media_assets_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      expire_overdue_subscriptions: {
        Args: {
          p_grace_interval?: string
        }
        Returns: number
      }
      has_active_premium_access: {
        Args: {
          p_user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type SportRow = Database['public']['Tables']['sports']['Row']
export type MatchRow = Database['public']['Tables']['matches']['Row'] & {
  sport?: SportRow | null
}
export type HighlightRow = Database['public']['Tables']['highlights']['Row'] & {
  sport?: SportRow | null
}
export type NewsArticleRow = Database['public']['Tables']['news_articles']['Row'] & {
  sport?: SportRow | null
}
export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type MatchReminderRow = Database['public']['Tables']['match_reminders']['Row']
export type SubscriptionPlanRow =
  Database['public']['Tables']['subscription_plans']['Row']
export type SubscriptionRow =
  Database['public']['Tables']['subscriptions']['Row']
export type PaymentTransactionRow =
  Database['public']['Tables']['payment_transactions']['Row']
export type WebhookEventRow =
  Database['public']['Tables']['webhook_events']['Row']
export type PremiumMediaAssetRow =
  Database['public']['Tables']['premium_media_assets']['Row']
