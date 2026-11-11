-- Expand SPORTIVRA catalog across all 6 sports, add completed scores, and enable Realtime on matches (safe & idempotent)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
  END IF;
END $$;

INSERT INTO public.matches (
  slug, sport_id, league, headline, home_team, away_team,
  home_score, away_score, status, match_clock, kickoff_at,
  is_featured, image_url, image_alt, stream_url, sort_order
)
VALUES
  (
    'india-vs-australia-odi',
    (SELECT id FROM public.sports WHERE slug = 'cricket'),
    'ICC One-Day Series',
    NULL,
    'India',
    'Australia',
    0,
    0,
    'upcoming',
    NULL,
    (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day 09 hours') AT TIME ZONE 'UTC',
    false,
    NULL,
    NULL,
    NULL,
    4
  ),
  (
    'fury-vs-usyk-rematch',
    (SELECT id FROM public.sports WHERE slug = 'boxing'),
    'Heavyweight World Title',
    NULL,
    'T. Fury',
    'O. Usyk',
    0,
    0,
    'upcoming',
    NULL,
    (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '2 days 21 hours') AT TIME ZONE 'UTC',
    false,
    NULL,
    NULL,
    NULL,
    5
  ),
  (
    'las-vegas-gp-qualifying',
    (SELECT id FROM public.sports WHERE slug = 'motorsport'),
    'Formula Grand Prix • Las Vegas',
    'Las Vegas Grand Prix Qualifying',
    'Verstappen',
    'Norris',
    0,
    0,
    'upcoming',
    NULL,
    (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '3 days 06 hours') AT TIME ZONE 'UTC',
    false,
    NULL,
    NULL,
    NULL,
    6
  ),
  (
    'real-madrid-vs-bayern-munich-ft',
    (SELECT id FROM public.sports WHERE slug = 'football'),
    'UEFA Champions League',
    NULL,
    'Real Madrid',
    'Bayern Munich',
    3,
    1,
    'finished',
    'FT',
    now() - interval '14 hours',
    false,
    NULL,
    NULL,
    NULL,
    10
  ),
  (
    'nuggets-vs-heat-ft',
    (SELECT id FROM public.sports WHERE slug = 'basketball'),
    'NBA • Regular Season',
    NULL,
    'Denver Nuggets',
    'Miami Heat',
    114,
    108,
    'finished',
    'FT',
    now() - interval '18 hours',
    false,
    NULL,
    NULL,
    NULL,
    11
  ),
  (
    'england-vs-south-africa-t20-ft',
    (SELECT id FROM public.sports WHERE slug = 'cricket'),
    'International T20',
    NULL,
    'England',
    'South Africa',
    189,
    182,
    'finished',
    'FT',
    now() - interval '22 hours',
    false,
    NULL,
    NULL,
    NULL,
    12
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.highlights (
  slug, sport_id, badge, title, description,
  image_url, image_alt, video_url, duration, is_featured, sort_order, published_at
)
VALUES
  (
    'nba-fourth-quarter-clutch-plays',
    (SELECT id FROM public.sports WHERE slug = 'basketball'),
    'Court vision',
    'Fourth-quarter poise under bright arena lights',
    'Breakdown of the decisive late-game possessions, defensive stops, and perimeter shooting from this week''s marquee matchups.',
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
    'Basketball arena matchup',
    NULL,
    '05:10',
    false,
    3,
    now() - interval '16 hours'
  ),
  (
    'cricket-final-over-thriller',
    (SELECT id FROM public.sports WHERE slug = 'cricket'),
    'Last over',
    'Final-over composure seals dramatic white-ball finish',
    'Every yorker, boundary, and turning point from a thrilling international T20 decider.',
    'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=1200&q=80',
    'Cricket stadium match',
    NULL,
    '03:54',
    false,
    4,
    now() - interval '20 hours'
  ),
  (
    'boxing-camp-chronicles-heavyweight',
    (SELECT id FROM public.sports WHERE slug = 'boxing'),
    'Fight week',
    'Inside heavyweight camp before the main event',
    'Roadwork, sparring rounds, and corner strategy ahead of Saturday''s championship card.',
    'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?auto=format&fit=crop&w=1200&q=80',
    'Boxer training in ring',
    NULL,
    '07:08',
    false,
    5,
    now() - interval '26 hours'
  ),
  (
    'motorsport-pit-lane-telemetry',
    (SELECT id FROM public.sports WHERE slug = 'motorsport'),
    'Trackside',
    'Under the lights: braking zones and pit-wall strategy',
    'Analysing sector speeds and tyre warm-up windows across the championship contenders.',
    'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1200&q=80',
    'Motorsport race car under lights',
    NULL,
    '04:48',
    false,
    6,
    now() - interval '30 hours'
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.news_articles (
  slug, sport_id, category, title, summary, content,
  image_url, image_alt, read_time, published_at, sort_order
)
VALUES
  (
    'nba-pace-and-spacing-evolution',
    (SELECT id FROM public.sports WHERE slug = 'basketball'),
    'Basketball',
    'How five-out spacing is reshaping late-game playbooks',
    'Coaches are stretching defences beyond the arc to create driving lanes when games slow down in the fourth quarter.',
    'Across the league, crunch-time lineups increasingly rely on versatile wings who can guard multiple positions and space the floor. That flexibility forces opponents into tough switching decisions on every high ball screen.',
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1000&q=80',
    'Basketball players on court',
    '4 min read',
    '2026-11-11T18:00:00Z',
    4
  ),
  (
    'cricket-white-ball-death-bowling',
    (SELECT id FROM public.sports WHERE slug = 'cricket'),
    'Cricket',
    'Why slower-ball variations dominate the final four overs',
    'Bowlers are mixing seam-up pace with disguised cutters to keep batters guessing at the death.',
    'With boundaries getting shorter and power-hitters stronger, death-over specialists have turned deception into their sharpest weapon. Reading pitch grip early lets captains pair pace changes with tailored boundary protection.',
    'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=1000&q=80',
    'Cricket match pitch',
    '3 min read',
    '2026-11-11T15:00:00Z',
    5
  ),
  (
    'boxing-footwork-heavyweight-era',
    (SELECT id FROM public.sports WHERE slug = 'boxing'),
    'Boxing',
    'Angles and patience: the tactical evolution at heavyweight',
    'Modern contenders are pairing championship power with sharp lateral movement and disciplined jab control.',
    'Rather than trading early hooks, elite heavyweights are winning rounds with measured distance control, feints, and body-to-head combinations designed to break rhythm over twelve rounds.',
    'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?auto=format&fit=crop&w=1000&q=80',
    'Boxer preparing in gym',
    '5 min read',
    '2026-11-11T12:00:00Z',
    6
  )
ON CONFLICT (slug) DO NOTHING;
