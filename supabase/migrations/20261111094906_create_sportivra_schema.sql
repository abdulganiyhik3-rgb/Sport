-- SPORTIVRA core relational schema (safe & idempotent)

CREATE TABLE IF NOT EXISTS public.sports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  icon text NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  gradient_class text NOT NULL DEFAULT 'from-[#183c35]',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  sport_id uuid NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  league text NOT NULL,
  headline text,
  home_team text NOT NULL,
  away_team text NOT NULL,
  home_score integer NOT NULL DEFAULT 0,
  away_score integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('live', 'upcoming', 'finished')),
  match_clock text,
  kickoff_at timestamptz NOT NULL,
  is_featured boolean NOT NULL DEFAULT false,
  image_url text,
  image_alt text,
  stream_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  sport_id uuid REFERENCES public.sports(id) ON DELETE SET NULL,
  badge text NOT NULL,
  title text NOT NULL,
  description text,
  image_url text NOT NULL,
  image_alt text,
  video_url text,
  duration text,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.news_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  sport_id uuid REFERENCES public.sports(id) ON DELETE SET NULL,
  category text NOT NULL,
  title text NOT NULL,
  summary text,
  content text,
  image_url text NOT NULL,
  image_alt text,
  read_time text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  favorite_sport_id uuid REFERENCES public.sports(id) ON DELETE SET NULL,
  membership_tier text NOT NULL DEFAULT 'free' CHECK (membership_tier IN ('free', 'pro')),
  membership_status text NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.match_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, match_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sports_sort_order ON public.sports(sort_order);
CREATE INDEX IF NOT EXISTS idx_matches_status_kickoff ON public.matches(status, kickoff_at);
CREATE INDEX IF NOT EXISTS idx_matches_sport_id ON public.matches(sport_id);
CREATE INDEX IF NOT EXISTS idx_highlights_sport_id ON public.highlights(sport_id);
CREATE INDEX IF NOT EXISTS idx_highlights_sort_order ON public.highlights(sort_order);
CREATE INDEX IF NOT EXISTS idx_news_articles_sport_id ON public.news_articles(sport_id);
CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON public.news_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_reminders_user_id ON public.match_reminders(user_id);

-- Updated-at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_updated_at ON public.matches;
CREATE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile when auth user registers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, membership_tier)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'membership_tier' = 'pro' THEN 'pro'
      ELSE 'free'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Enable Row Level Security on every public table
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_reminders ENABLE ROW LEVEL SECURITY;

-- Table grants
GRANT SELECT ON public.sports, public.matches, public.highlights, public.news_articles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.match_reminders TO authenticated;

-- RLS Policies (idempotent creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sports' AND policyname = 'Public can read sports'
  ) THEN
    CREATE POLICY "Public can read sports"
      ON public.sports FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'matches' AND policyname = 'Public can read matches'
  ) THEN
    CREATE POLICY "Public can read matches"
      ON public.matches FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'highlights' AND policyname = 'Public can read highlights'
  ) THEN
    CREATE POLICY "Public can read highlights"
      ON public.highlights FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'news_articles' AND policyname = 'Public can read news articles'
  ) THEN
    CREATE POLICY "Public can read news articles"
      ON public.news_articles FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile"
      ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile"
      ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'match_reminders' AND policyname = 'Users can view own reminders'
  ) THEN
    CREATE POLICY "Users can view own reminders"
      ON public.match_reminders FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'match_reminders' AND policyname = 'Users can create own reminders'
  ) THEN
    CREATE POLICY "Users can create own reminders"
      ON public.match_reminders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'match_reminders' AND policyname = 'Users can delete own reminders'
  ) THEN
    CREATE POLICY "Users can delete own reminders"
      ON public.match_reminders FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
