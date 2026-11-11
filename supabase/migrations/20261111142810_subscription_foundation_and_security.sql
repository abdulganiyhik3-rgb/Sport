-- SPORTIVRA Subscription Integration - Phase 1: Database and Security Foundation
-- Additive, non-destructive schema and security hardening for Free + Premium memberships,
-- provider-independent billing (Paystack primary), and protected licensed media assets.

-- =============================================================================
-- 1. Harden public.profiles and remove client-controlled tier self-escalation
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS provider_customer_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_membership_tier_check,
  ADD CONSTRAINT profiles_membership_tier_check
    CHECK (membership_tier IN ('free', 'pro', 'premium'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_membership_status_check,
  ADD CONSTRAINT profiles_membership_status_check
    CHECK (
      membership_status IN (
        'active',
        'inactive',
        'past_due',
        'cancelled',
        'expired',
        'incomplete'
      )
    );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check,
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('member', 'admin'));

CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles(role)
  WHERE role = 'admin';

CREATE INDEX IF NOT EXISTS idx_profiles_membership_tier
  ON public.profiles(membership_tier, membership_status);

-- Always provision newly registered users strictly with Free member privileges,
-- ignoring any client-supplied raw_user_meta_data tier or role fields.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    membership_tier,
    membership_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    'member',
    'free',
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Strict role allowlist: only trusted PostgreSQL/service roles may set or change
-- role, membership_tier, membership_status, provider_customer_ids, or subscription_expires_at.
CREATE OR REPLACE FUNCTION public.protect_profile_entitlement_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.role := 'member';
      NEW.membership_tier := 'free';
      NEW.membership_status := 'active';
      NEW.provider_customer_ids := '{}'::jsonb;
      NEW.subscription_expires_at := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role
        OR NEW.membership_tier IS DISTINCT FROM OLD.membership_tier
        OR NEW.membership_status IS DISTINCT FROM OLD.membership_status
        OR NEW.provider_customer_ids IS DISTINCT FROM OLD.provider_customer_ids
        OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at THEN
        RAISE EXCEPTION 'Direct modification of membership, billing, or role fields is not permitted.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_entitlement_fields ON public.profiles;
CREATE TRIGGER trg_profiles_protect_entitlement_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_entitlement_fields();

-- =============================================================================
-- 2. Subscription Plans (provider-independent; prices/currencies unconfigured)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  tier text NOT NULL CHECK (tier IN ('free', 'premium')),
  billing_interval text NOT NULL CHECK (billing_interval IN ('none', 'month', 'year')),
  amount_minor integer CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency text CHECK (
    currency IS NULL
    OR (char_length(currency) = 3 AND currency = upper(currency))
  ),
  provider text,
  provider_plan_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plans_tier_interval_check CHECK (
    (tier = 'free' AND billing_interval = 'none')
    OR (tier = 'premium' AND billing_interval IN ('month', 'year'))
  ),
  CONSTRAINT subscription_plans_free_amount_check CHECK (
    tier <> 'free' OR amount_minor IS NULL OR amount_minor = 0
  ),
  CONSTRAINT subscription_plans_active_pricing_check CHECK (
    NOT is_active
    OR tier = 'free'
    OR (amount_minor IS NOT NULL AND amount_minor > 0 AND currency IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active_sort
  ON public.subscription_plans(is_active, sort_order);

DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 3. Subscriptions & Server-Only Provider Management Tokens
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_customer_ref text,
  provider_subscription_ref text,
  status text NOT NULL CHECK (
    status IN ('active', 'past_due', 'cancelled', 'expired', 'incomplete')
  ),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_sub_ref_unique
  ON public.subscriptions(provider, provider_subscription_ref)
  WHERE provider_subscription_ref IS NOT NULL;

-- Only live/grace states are constrained to one per user so abandoned 'incomplete'
-- checkout records never block subsequent checkout attempts or plan switches.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_open_per_user
  ON public.subscriptions(user_id)
  WHERE status IN ('active', 'past_due');

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_updated
  ON public.subscriptions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status_period_end
  ON public.subscriptions(status, current_period_end);

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Strictly server-only table for Paystack email_token / authorization codes / management links.
-- Kept separate from public.subscriptions so client SELECT queries can never retrieve tokens.
CREATE TABLE IF NOT EXISTS public.subscription_provider_tokens (
  subscription_id uuid PRIMARY KEY REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  email_token text,
  authorization_code text,
  management_url text,
  token_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_subscription_provider_tokens_updated_at ON public.subscription_provider_tokens;
CREATE TRIGGER trg_subscription_provider_tokens_updated_at
  BEFORE UPDATE ON public.subscription_provider_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Keep public.profiles entitlement fields synchronised whenever subscriptions change,
-- prioritising rows with active live period entitlement (including mid-period cancellations)
-- over stale or elapsed rows.
CREATE OR REPLACE FUNCTION public.sync_profile_membership_from_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_sub RECORD;
  v_next_tier text := 'free';
  v_next_status text := 'active';
  v_next_expires timestamptz := NULL;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT
    s.status,
    s.cancel_at_period_end,
    s.current_period_end,
    s.ended_at,
    p.tier AS plan_tier
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE s.user_id = v_user_id
  ORDER BY
    CASE
      WHEN s.status = 'active'
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        THEN 0
      WHEN s.status = 'cancelled'
        AND s.ended_at IS NULL
        AND s.current_period_end IS NOT NULL
        AND s.current_period_end > now()
        THEN 1
      WHEN s.status = 'past_due'
        AND s.current_period_end IS NOT NULL
        AND s.current_period_end > now()
        THEN 2
      WHEN s.status = 'active' THEN 3
      WHEN s.status = 'past_due' THEN 4
      WHEN s.status = 'cancelled' THEN 5
      WHEN s.status = 'incomplete' THEN 6
      ELSE 7
    END,
    s.current_period_end DESC NULLS LAST,
    s.updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_sub.status = 'active' THEN
      IF v_sub.current_period_end IS NULL OR v_sub.current_period_end > now() THEN
        v_next_tier := v_sub.plan_tier;
        v_next_status := 'active';
        v_next_expires := v_sub.current_period_end;
      ELSE
        v_next_tier := 'free';
        v_next_status := 'expired';
        v_next_expires := v_sub.current_period_end;
      END IF;
    ELSIF v_sub.status = 'past_due' THEN
      v_next_status := 'past_due';
      v_next_expires := v_sub.current_period_end;
      IF v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end > now() THEN
        v_next_tier := v_sub.plan_tier;
      ELSE
        v_next_tier := 'free';
      END IF;
    ELSIF v_sub.status = 'cancelled' THEN
      v_next_status := 'cancelled';
      IF v_sub.ended_at IS NULL
        AND v_sub.current_period_end IS NOT NULL
        AND v_sub.current_period_end > now() THEN
        v_next_tier := v_sub.plan_tier;
        v_next_expires := v_sub.current_period_end;
      ELSE
        v_next_tier := 'free';
        v_next_expires := COALESCE(v_sub.ended_at, v_sub.current_period_end);
      END IF;
    ELSIF v_sub.status = 'expired' THEN
      v_next_tier := 'free';
      v_next_status := 'expired';
      v_next_expires := COALESCE(v_sub.ended_at, v_sub.current_period_end);
    ELSE
      v_next_tier := 'free';
      v_next_status := v_sub.status;
      v_next_expires := NULL;
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    membership_tier = v_next_tier,
    membership_status = v_next_status,
    subscription_expires_at = v_next_expires
  WHERE id = v_user_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_sync_profile ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_sync_profile
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_membership_from_subscription();

-- Server-only scheduled sweep to expire overdue subscriptions whose billing period has ended.
-- Updating public.subscriptions fires trg_subscriptions_sync_profile to downgrade profiles cleanly.
CREATE OR REPLACE FUNCTION public.expire_overdue_subscriptions(
  p_grace_interval interval DEFAULT interval '0 seconds'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count integer := 0;
BEGIN
  WITH updated AS (
    UPDATE public.subscriptions s
    SET
      status = 'expired',
      ended_at = COALESCE(s.ended_at, s.current_period_end, now())
    WHERE s.current_period_end IS NOT NULL
      AND (
        (s.status = 'active' AND s.cancel_at_period_end = true AND s.current_period_end <= now())
        OR (s.status = 'active' AND s.cancel_at_period_end = false AND (s.current_period_end + p_grace_interval) <= now())
        OR (s.status = 'past_due' AND (s.current_period_end + p_grace_interval) <= now())
        OR (s.status = 'cancelled' AND s.ended_at IS NULL AND s.current_period_end <= now())
      )
    RETURNING s.id
  )
  SELECT count(*)::integer INTO v_expired_count FROM updated;

  RETURN v_expired_count;
END;
$$;

-- Server-only live entitlement verification: always validates subscription period against now()
-- rather than trusting cached profiles.membership_tier alone.
CREATE OR REPLACE FUNCTION public.has_active_premium_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id
      AND p.tier = 'premium'
      AND (
        (s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (
          s.status = 'cancelled'
          AND s.ended_at IS NULL
          AND s.current_period_end IS NOT NULL
          AND s.current_period_end > now()
        )
        OR (
          s.status = 'past_due'
          AND s.current_period_end IS NOT NULL
          AND s.current_period_end > now()
        )
      )
  );
$$;

-- =============================================================================
-- 4. Payment Transactions & Verified Webhook Events
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_transaction_ref text,
  provider_checkout_ref text,
  provider_invoice_ref text,
  expected_amount_minor integer CHECK (expected_amount_minor IS NULL OR expected_amount_minor >= 0),
  expected_currency text CHECK (
    expected_currency IS NULL
    OR (char_length(expected_currency) = 3 AND expected_currency = upper(expected_currency))
  ),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (
    char_length(currency) = 3 AND currency = upper(currency)
  ),
  status text NOT NULL CHECK (
    status IN ('pending', 'succeeded', 'failed', 'refunded')
  ),
  payment_channel text,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_transactions_ref_present_check CHECK (
    NULLIF(TRIM(COALESCE(provider_transaction_ref, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(provider_checkout_ref, '')), '') IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_provider_ref_unique
  ON public.payment_transactions(provider, provider_transaction_ref)
  WHERE provider_transaction_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_provider_checkout_ref_unique
  ON public.payment_transactions(provider, provider_checkout_ref)
  WHERE provider_checkout_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_created
  ON public.payment_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_subscription_id
  ON public.payment_transactions(subscription_id);

DROP TRIGGER IF EXISTS trg_payment_transactions_updated_at ON public.payment_transactions;
CREATE TRIGGER trg_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  payload_hash text,
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'received' CHECK (
    processing_status IN ('received', 'processed', 'ignored', 'failed')
  ),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_verified_before_processing_check CHECK (
    signature_verified = true
    OR processing_status IN ('received', 'failed')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_provider_event_unique
  ON public.webhook_events(provider, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status_created
  ON public.webhook_events(processing_status, created_at DESC);

-- =============================================================================
-- 5. Premium Content Access Tiers & Protected Licensed Media Assets
-- =============================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS access_tier text NOT NULL DEFAULT 'free';

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_access_tier_check,
  ADD CONSTRAINT matches_access_tier_check
    CHECK (access_tier IN ('free', 'premium'));

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_premium_stream_isolation_check,
  ADD CONSTRAINT matches_premium_stream_isolation_check
    CHECK (access_tier = 'free' OR NULLIF(TRIM(stream_url), '') IS NULL);

ALTER TABLE public.highlights
  ADD COLUMN IF NOT EXISTS access_tier text NOT NULL DEFAULT 'free';

ALTER TABLE public.highlights
  DROP CONSTRAINT IF EXISTS highlights_access_tier_check,
  ADD CONSTRAINT highlights_access_tier_check
    CHECK (access_tier IN ('free', 'premium'));

ALTER TABLE public.highlights
  DROP CONSTRAINT IF EXISTS highlights_premium_video_isolation_check,
  ADD CONSTRAINT highlights_premium_video_isolation_check
    CHECK (access_tier = 'free' OR NULLIF(TRIM(video_url), '') IS NULL);

CREATE INDEX IF NOT EXISTS idx_matches_access_tier
  ON public.matches(access_tier);

CREATE INDEX IF NOT EXISTS idx_highlights_access_tier
  ON public.highlights(access_tier);

CREATE TABLE IF NOT EXISTS public.premium_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  highlight_id uuid REFERENCES public.highlights(id) ON DELETE CASCADE,
  access_tier text NOT NULL DEFAULT 'premium' CHECK (access_tier = 'premium'),
  media_url text NOT NULL CHECK (media_url ~* '^https://[^[:space:]]+$'),
  stream_format text NOT NULL DEFAULT 'hls' CHECK (stream_format IN ('hls', 'mp4', 'dash')),
  rights_holder text NOT NULL CHECK (char_length(TRIM(rights_holder)) > 0),
  license_reference text,
  permitted_regions text[] NOT NULL DEFAULT '{}'::text[] CHECK (NOT ('' = ANY(permitted_regions))),
  license_starts_at timestamptz,
  license_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT premium_media_assets_single_target_check CHECK (
    (match_id IS NOT NULL) <> (highlight_id IS NOT NULL)
  ),
  CONSTRAINT premium_media_assets_license_window_check CHECK (
    license_starts_at IS NULL
    OR license_expires_at IS NULL
    OR license_expires_at > license_starts_at
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_premium_media_assets_active_match
  ON public.premium_media_assets(match_id)
  WHERE match_id IS NOT NULL AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_premium_media_assets_active_highlight
  ON public.premium_media_assets(highlight_id)
  WHERE highlight_id IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_premium_media_assets_license_window
  ON public.premium_media_assets(is_active, license_starts_at, license_expires_at);

DROP TRIGGER IF EXISTS trg_premium_media_assets_updated_at ON public.premium_media_assets;
CREATE TRIGGER trg_premium_media_assets_updated_at
  BEFORE UPDATE ON public.premium_media_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 6. Row Level Security, Function Hardening & Minimal Least-Privilege Grants
-- =============================================================================

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_provider_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_media_assets ENABLE ROW LEVEL SECURITY;

-- Tighten existing table privileges to least-privilege (preserving existing RLS reads/writes)
REVOKE ALL ON public.sports, public.matches, public.highlights, public.news_articles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sports, public.matches, public.highlights, public.news_articles TO anon, authenticated;
GRANT ALL ON public.sports, public.matches, public.highlights, public.news_articles TO service_role;

REVOKE ALL ON public.match_reminders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.match_reminders TO authenticated;
GRANT ALL ON public.match_reminders TO service_role;

-- Column-restricted INSERT/UPDATE on public.profiles so clients can update profile & preferences
-- while remaining completely blocked from altering role, membership, or billing columns.
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT (id, email, full_name, favorite_sport_id, favorite_sport_ids, favorite_teams) ON public.profiles TO authenticated;
GRANT UPDATE (id, email, full_name, favorite_sport_id, favorite_sport_ids, favorite_teams) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- New subscription & protected content privileges
REVOKE ALL ON public.subscription_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

REVOKE ALL ON public.subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

REVOKE ALL ON public.payment_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;

-- Server-only tables (no PUBLIC/anon/authenticated grants or policies)
REVOKE ALL ON public.subscription_provider_tokens, public.webhook_events, public.premium_media_assets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.subscription_provider_tokens, public.webhook_events, public.premium_media_assets TO service_role;

-- Revoke direct EXECUTE privileges on trigger and billing helper functions from client roles
REVOKE ALL ON FUNCTION
  public.set_updated_at(),
  public.handle_new_user(),
  public.sync_profile_primary_favorite_sport(),
  public.protect_profile_entitlement_fields(),
  public.sync_profile_membership_from_subscription(),
  public.expire_overdue_subscriptions(interval),
  public.has_active_premium_access(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.expire_overdue_subscriptions(interval),
  public.has_active_premium_access(uuid)
TO service_role;

-- Idempotent RLS Policies for new tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscription_plans' AND policyname = 'Public can read active subscription plans'
  ) THEN
    CREATE POLICY "Public can read active subscription plans"
      ON public.subscription_plans
      FOR SELECT
      TO anon, authenticated
      USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'Users can view own subscriptions'
  ) THEN
    CREATE POLICY "Users can view own subscriptions"
      ON public.subscriptions
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_transactions' AND policyname = 'Users can view own payment transactions'
  ) THEN
    CREATE POLICY "Users can view own payment transactions"
      ON public.payment_transactions
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
