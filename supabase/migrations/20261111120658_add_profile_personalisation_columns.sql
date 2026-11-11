-- Add multi-sport and favourite-team personalisation arrays to public.profiles

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS favorite_sport_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS favorite_teams text[] NOT NULL DEFAULT '{}'::text[];

-- Non-destructively backfill existing single favorite_sport_id into favorite_sport_ids where empty
UPDATE public.profiles
SET favorite_sport_ids = ARRAY[favorite_sport_id]
WHERE favorite_sport_id IS NOT NULL
  AND cardinality(favorite_sport_ids) = 0;

CREATE OR REPLACE FUNCTION public.sync_profile_primary_favorite_sport()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.favorite_sport_ids IS NULL THEN
    NEW.favorite_sport_ids := '{}'::uuid[];
  END IF;

  IF NEW.favorite_teams IS NULL THEN
    NEW.favorite_teams := '{}'::text[];
  END IF;

  IF cardinality(NEW.favorite_sport_ids) > 0 THEN
    IF NEW.favorite_sport_id IS NULL OR NOT (NEW.favorite_sport_id = ANY(NEW.favorite_sport_ids)) THEN
      NEW.favorite_sport_id := NEW.favorite_sport_ids[1];
    END IF;
  ELSIF TG_OP = 'UPDATE'
    AND cardinality(OLD.favorite_sport_ids) > 0
    AND NEW.favorite_sport_id IS NOT DISTINCT FROM OLD.favorite_sport_id THEN
    NEW.favorite_sport_id := NULL;
  ELSIF NEW.favorite_sport_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR NEW.favorite_sport_id IS DISTINCT FROM OLD.favorite_sport_id THEN
      NEW.favorite_sport_ids := ARRAY[NEW.favorite_sport_id];
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_favorite_sports ON public.profiles;
CREATE TRIGGER trg_profiles_sync_favorite_sports
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_primary_favorite_sport();
