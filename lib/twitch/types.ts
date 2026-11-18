export interface TwitchPagination {
  cursor?: string
}

export interface TwitchPage<T> {
  data: T[]
  pagination?: TwitchPagination
}

export interface TwitchUser {
  id: string
  login: string
  display_name: string
  type: string
  broadcaster_type: string
  description: string
  profile_image_url: string
  offline_image_url: string
  view_count: number
  created_at: string
}

export interface TwitchStream {
  id: string
  user_id: string
  user_login: string
  user_name: string
  game_id: string
  game_name: string
  type: 'live' | ''
  title: string
  tags: string[]
  viewer_count: number
  started_at: string
  language: string
  thumbnail_url: string
  is_mature: boolean
}

export interface TwitchChannel {
  broadcaster_id: string
  broadcaster_login: string
  broadcaster_name: string
  broadcaster_language: string
  game_id: string
  game_name: string
  title: string
  delay: number
  tags: string[]
  content_classification_labels: string[]
  is_branded_content: boolean
  is_live?: boolean
}

export interface TwitchSearchChannel {
  broadcaster_language: string
  broadcaster_login: string
  display_name: string
  game_id: string
  game_name: string
  id: string
  is_live: boolean
  tags: string[]
  thumbnail_url: string
  title: string
  started_at: string
}

export interface TwitchCategory {
  id: string
  name: string
  box_art_url: string
}

export type TwitchVideoType = 'all' | 'archive' | 'highlight' | 'upload'

export interface TwitchVideo {
  id: string
  stream_id: string | null
  user_id: string
  user_login: string
  user_name: string
  title: string
  description: string
  created_at: string
  published_at: string
  url: string
  thumbnail_url: string
  viewable: 'public' | 'private'
  view_count: number
  language: string
  type: 'upload' | 'archive' | 'highlight'
  duration: string
  muted: boolean
  content_classification_labels: string[]
}

export interface TwitchClip {
  id: string
  url: string
  embed_url: string
  broadcaster_id: string
  broadcaster_name: string
  creator_id: string
  creator_name: string
  video_id: string
  game_id: string
  language: string
  title: string
  view_count: number
  created_at: string
  thumbnail_url: string
  duration: number
  vod_offset: number | null
  is_featured: boolean
}

export interface TwitchScheduleCategory {
  id: string
  name: string
}

export interface TwitchScheduleSegment {
  id: string
  start_time: string
  end_time: string
  title: string
  canceled_until: string | null
  category: TwitchScheduleCategory | null
  is_recurring: boolean
}

export interface TwitchSchedule {
  broadcaster_id: string
  broadcaster_name: string
  segments: TwitchScheduleSegment[]
  vacation?: { start_time: string; end_time: string } | null
  pagination?: TwitchPagination
}

export interface TwitchFollowedChannel {
  broadcaster_id: string
  broadcaster_login: string
  broadcaster_name: string
  followed_at: string
}

export interface TwitchSubscription {
  broadcaster_id: string
  broadcaster_name: string
  is_gift: boolean
  tier: string
  plan_name: string
  user_id: string
  user_name: string
  user_login: string
  gifted_by: string | null
  gifted_by_user_id: string | null
  gifted_by_user_login: string | null
  gifter_name: string | null
  gifter_login: string | null
  is_prime: boolean
  created_at: string
  cumulative_months: number
  streak_months: number | null
  duration_months: number
}

export interface TwitchClipCreation {
  id: string
  edit_url: string
}

export interface TwitchValidatedToken {
  client_id: string
  login: string
  scopes: string[]
  user_id: string
  expires_in: number
}

export interface TwitchSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  userId: string
  login: string
  displayName: string
  scopes: string[]
}

export type TwitchDiscoveryKind =
  | 'streams'
  | 'channels'
  | 'categories'
  | 'videos'
  | 'clips'
  | 'schedule'
