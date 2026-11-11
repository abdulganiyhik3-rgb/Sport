export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
          membership_tier: 'free' | 'pro'
          membership_status: 'active' | 'inactive'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          favorite_sport_id?: string | null
          membership_tier?: 'free' | 'pro'
          membership_status?: 'active' | 'inactive'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          favorite_sport_id?: string | null
          membership_tier?: 'free' | 'pro'
          membership_status?: 'active' | 'inactive'
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
