INSERT INTO public.highlights (
  slug, sport_id, badge, title, description,
  image_url, image_alt, video_url, duration, is_featured, sort_order, published_at
)
VALUES (
  'atp-indoor-tiebreak-masterclass',
  (SELECT id FROM public.sports WHERE slug = 'tennis'),
  'Match point',
  'Turin tiebreak drama: baseline winners under pressure',
  'Relive the longest rallies, aces, and decisive tiebreak points from indoor hard-court action.',
  'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
  'Tennis player hitting forehand on court',
  NULL,
  '04:19',
  false,
  7,
  now() - interval '34 hours'
)
ON CONFLICT (slug) DO NOTHING;
