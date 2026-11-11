-- Initial showcase seed data for SPORTIVRA (idempotent)

INSERT INTO public.sports (slug, name, icon, event_count, gradient_class, sort_order)
VALUES
  ('football', 'Football', '⚽', 1240, 'from-[#183c35]', 1),
  ('basketball', 'Basketball', '◉', 876, 'from-[#3d2c1a]', 2),
  ('tennis', 'Tennis', '◌', 540, 'from-[#243b24]', 3),
  ('cricket', 'Cricket', '◆', 312, 'from-[#172f3a]', 4),
  ('boxing', 'Boxing', '✦', 198, 'from-[#3a2227]', 5),
  ('motorsport', 'Motorsport', '⌁', 164, 'from-[#27253b]', 6)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.matches (
  slug, sport_id, league, headline, home_team, away_team,
  home_score, away_score, status, match_clock, kickoff_at,
  is_featured, image_url, image_alt, stream_url, sort_order
)
VALUES
  (
    'man-city-vs-liverpool',
    (SELECT id FROM public.sports WHERE slug = 'football'),
    'Premier League',
    NULL,
    'Manchester City',
    'Liverpool',
    2,
    1,
    'live',
    '68''',
    now() - interval '68 minutes',
    true,
    'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?auto=format&fit=crop&w=1400&q=80',
    'Football player on the pitch',
    NULL,
    1
  ),
  (
    'warriors-vs-suns',
    (SELECT id FROM public.sports WHERE slug = 'basketball'),
    'NBA',
    NULL,
    'Warriors',
    'Suns',
    74,
    71,
    'live',
    'Q3',
    now() - interval '55 minutes',
    false,
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=300&q=80',
    'Basketball game action',
    NULL,
    2
  ),
  (
    'united-cup-tennis',
    (SELECT id FROM public.sports WHERE slug = 'tennis'),
    'United Cup',
    'United Cup',
    'Team Australia',
    'Team Poland',
    4,
    3,
    'live',
    'Set 2',
    now() - interval '45 minutes',
    false,
    'https://images.unsplash.com/photo-1530915365347-5b9a1a2c3f22?auto=format&fit=crop&w=300&q=80',
    'Tennis match on court',
    NULL,
    3
  ),
  (
    'arsenal-vs-inter-milan',
    (SELECT id FROM public.sports WHERE slug = 'football'),
    'UEFA Champions League',
    NULL,
    'Arsenal',
    'Inter Milan',
    0,
    0,
    'upcoming',
    NULL,
    (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '20 hours') AT TIME ZONE 'UTC',
    false,
    NULL,
    NULL,
    NULL,
    1
  ),
  (
    'celtics-vs-lakers',
    (SELECT id FROM public.sports WHERE slug = 'basketball'),
    'NBA • Regular Season',
    NULL,
    'Boston Celtics',
    'LA Lakers',
    0,
    0,
    'upcoming',
    NULL,
    (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '21 hours 30 minutes') AT TIME ZONE 'UTC',
    false,
    NULL,
    NULL,
    NULL,
    2
  ),
  (
    'alcaraz-vs-sinner',
    (SELECT id FROM public.sports WHERE slug = 'tennis'),
    'ATP Finals • Turin',
    NULL,
    'C. Alcaraz',
    'J. Sinner',
    0,
    0,
    'upcoming',
    NULL,
    (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day 16 hours') AT TIME ZONE 'UTC',
    false,
    NULL,
    NULL,
    NULL,
    3
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.highlights (
  slug, sport_id, badge, title, description,
  image_url, image_alt, video_url, duration, is_featured, sort_order, published_at
)
VALUES
  (
    'matchday-stories-weekend-unforgettable',
    (SELECT id FROM public.sports WHERE slug = 'football'),
    'Matchday stories',
    'The moments that made this weekend unforgettable',
    'Relive the decisive goals, tactical breakthroughs, and stadium atmosphere from across weekend matchday action.',
    'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1400&q=80',
    'Football stadium under lights',
    NULL,
    '04:32',
    true,
    1,
    now() - interval '6 hours'
  ),
  (
    'originals-built-different-next-wave',
    NULL,
    'Originals',
    'Built different: the next wave',
    'Behind the scenes with rising international athletes preparing for the biggest stage.',
    'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=900&q=80',
    'Athlete training on a track',
    NULL,
    '06:15',
    false,
    2,
    now() - interval '12 hours'
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.news_articles (
  slug, sport_id, category, title, summary, content,
  image_url, image_alt, read_time, published_at, sort_order
)
VALUES
  (
    'new-generation-redefining-beautiful-game',
    (SELECT id FROM public.sports WHERE slug = 'football'),
    'Football',
    'The new generation redefining the beautiful game',
    'Young playmakers and fearless managers are transforming European football with high-tempo pressing and vertical precision.',
    'Across Europe''s premier competitions, a new cohort of players under 23 is setting the pace. Rather than waiting in the wings, academy graduates are commanding midfield zones, dictating tempo under intense pressure, and reshaping how modern clubs build squads for multi-competition calendars.',
    'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1000&q=80',
    'Football action on the pitch',
    '3 min read',
    '2026-11-12T09:00:00Z',
    1
  ),
  (
    'inside-high-speed-battle-2026-title',
    (SELECT id FROM public.sports WHERE slug = 'motorsport'),
    'Motorsport',
    'Inside the high-speed battle for the 2026 title',
    'Telemetry margins, tyre degradation strategy, and fearless late-braking duels are deciding the 2026 championship.',
    'With championship standings separated by single-digit points, engineering teams are chasing milliseconds in every sector. From wind-tunnel refinements to split-second pit wall strategy calls, the 2026 campaign is shaping up as one of the closest title fights in recent memory.',
    'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1000&q=80',
    'Motorsport race car on track',
    '5 min read',
    '2026-11-12T08:00:00Z',
    2
  ),
  (
    'courts-are-set-season-of-rivalries',
    (SELECT id FROM public.sports WHERE slug = 'tennis'),
    'Tennis',
    'The courts are set. A season of rivalries begins',
    'Contrasting styles and razor-thin tiebreaks promise another landmark indoor hard-court finale.',
    'From explosive baseline winners to relentless defensive retrievals, the tour''s leading contenders arrive in peak form. As indoor conditions reward aggressive first-strike tennis, every service game carries tournament-defining weight.',
    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1000&q=80',
    'Tennis player serving on court',
    '4 min read',
    '2026-11-12T07:00:00Z',
    3
  )
ON CONFLICT (slug) DO NOTHING;
