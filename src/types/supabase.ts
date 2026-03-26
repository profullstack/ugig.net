export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: string
          created_at: string | null
          id: string
          is_public: boolean | null
          metadata: Json | null
          reference_id: string | null
          reference_type: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          ai_tools_to_use: string[] | null
          applicant_id: string
          cover_letter: string
          created_at: string | null
          gig_id: string
          id: string
          portfolio_items: string[] | null
          proposed_rate: number | null
          proposed_timeline: string | null
          status: Database["public"]["Enums"]["application_status"] | null
          updated_at: string | null
        }
        Insert: {
          ai_tools_to_use?: string[] | null
          applicant_id: string
          cover_letter: string
          created_at?: string | null
          gig_id: string
          id?: string
          portfolio_items?: string[] | null
          proposed_rate?: number | null
          proposed_timeline?: string | null
          status?: Database["public"]["Enums"]["application_status"] | null
          updated_at?: string | null
        }
        Update: {
          ai_tools_to_use?: string[] | null
          applicant_id?: string
          cover_letter?: string
          created_at?: string | null
          gig_id?: string
          id?: string
          portfolio_items?: string[] | null
          proposed_rate?: number | null
          proposed_timeline?: string | null
          status?: Database["public"]["Enums"]["application_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          archived_at: string | null
          created_at: string | null
          gig_id: string | null
          id: string
          last_message_at: string | null
          participant_ids: string[]
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          gig_id?: string | null
          id?: string
          last_message_at?: string | null
          participant_ids: string[]
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          gig_id?: string | null
          id?: string
          last_message_at?: string | null
          participant_ids?: string[]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
        ]
      }
      endorsements: {
        Row: {
          comment: string | null
          created_at: string | null
          endorsed_id: string
          endorser_id: string
          id: string
          skill: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          endorsed_id: string
          endorser_id: string
          id?: string
          skill: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          endorsed_id?: string
          endorser_id?: string
          id?: string
          skill?: string
        }
        Relationships: [
          {
            foreignKeyName: "endorsements_endorsed_id_fkey"
            columns: ["endorsed_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endorsements_endorser_id_fkey"
            columns: ["endorser_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gig_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          gig_id: string
          id: string
          parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          gig_id: string
          id?: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          gig_id?: string
          id?: string
          parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gig_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_comments_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "gig_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      gig_usage: {
        Row: {
          created_at: string | null
          id: string
          month: number
          posts_count: number | null
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          month: number
          posts_count?: number | null
          user_id: string
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          month?: number
          posts_count?: number | null
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "gig_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gigs: {
        Row: {
          ai_tools_preferred: string[] | null
          applications_count: number | null
          budget_max: number | null
          budget_min: number | null
          budget_type: Database["public"]["Enums"]["budget_type"]
          budget_unit: string | null
          category: string
          created_at: string | null
          description: string
          duration: string | null
          id: string
          listing_type: string
          location: string | null
          location_type: Database["public"]["Enums"]["location_type"] | null
          payment_coin: string | null
          poster_id: string
          skills_required: string[] | null
          status: Database["public"]["Enums"]["gig_status"] | null
          title: string
          updated_at: string | null
          views_count: number | null
        }
        Insert: {
          ai_tools_preferred?: string[] | null
          applications_count?: number | null
          budget_max?: number | null
          budget_min?: number | null
          budget_type: Database["public"]["Enums"]["budget_type"]
          budget_unit?: string | null
          category: string
          created_at?: string | null
          description: string
          duration?: string | null
          id?: string
          listing_type?: string
          location?: string | null
          location_type?: Database["public"]["Enums"]["location_type"] | null
          payment_coin?: string | null
          poster_id: string
          skills_required?: string[] | null
          status?: Database["public"]["Enums"]["gig_status"] | null
          title: string
          updated_at?: string | null
          views_count?: number | null
        }
        Update: {
          ai_tools_preferred?: string[] | null
          applications_count?: number | null
          budget_max?: number | null
          budget_min?: number | null
          budget_type?: Database["public"]["Enums"]["budget_type"]
          budget_unit?: string | null
          category?: string
          created_at?: string | null
          description?: string
          duration?: string | null
          id?: string
          listing_type?: string
          location?: string | null
          location_type?: Database["public"]["Enums"]["location_type"] | null
          payment_coin?: string | null
          poster_id?: string
          skills_required?: string[] | null
          status?: Database["public"]["Enums"]["gig_status"] | null
          title?: string
          updated_at?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gigs_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          read_by: string[] | null
          sender_id: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          read_by?: string[] | null
          sender_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          read_by?: string[] | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          created_at: string
          email_application_status: boolean
          email_endorsement_received: boolean
          email_gig_updates: boolean
          email_mention: boolean
          email_new_application: boolean
          email_new_comment: boolean
          email_new_follower: boolean
          email_new_message: boolean
          email_review_received: boolean
          email_upvote_milestone: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_application_status?: boolean
          email_endorsement_received?: boolean
          email_gig_updates?: boolean
          email_mention?: boolean
          email_new_application?: boolean
          email_new_comment?: boolean
          email_new_follower?: boolean
          email_new_message?: boolean
          email_review_received?: boolean
          email_upvote_milestone?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_application_status?: boolean
          email_endorsement_received?: boolean
          email_gig_updates?: boolean
          email_mention?: boolean
          email_new_application?: boolean
          email_new_comment?: boolean
          email_new_follower?: boolean
          email_new_message?: boolean
          email_review_received?: boolean
          email_upvote_milestone?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_crypto: number | null
          amount_usd: number
          coinpay_payment_id: string | null
          created_at: string | null
          currency: string
          id: string
          metadata: Json | null
          status: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_id: string | null
          type: Database["public"]["Enums"]["payment_type"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_crypto?: number | null
          amount_usd: number
          coinpay_payment_id?: string | null
          created_at?: string | null
          currency: string
          id?: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_id?: string | null
          type: Database["public"]["Enums"]["payment_type"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_crypto?: number | null
          amount_usd?: number
          coinpay_payment_id?: string | null
          created_at?: string | null
          currency?: string
          id?: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          stripe_payment_id?: string | null
          type?: Database["public"]["Enums"]["payment_type"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          created_at: string
          description: string | null
          gig_id: string | null
          id: string
          image_url: string | null
          tags: string[] | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          gig_id?: string | null
          id?: string
          image_url?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          gig_id?: string | null
          id?: string
          image_url?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comment_votes: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          user_id: string
          vote_type: number
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          user_id: string
          vote_type: number
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
          vote_type?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_comment_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comment_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          depth: number | null
          downvotes: number | null
          id: string
          parent_id: string | null
          post_id: string
          score: number | null
          updated_at: string | null
          upvotes: number | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          depth?: number | null
          downvotes?: number | null
          id?: string
          parent_id?: string | null
          post_id: string
          score?: number | null
          updated_at?: string | null
          upvotes?: number | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          depth?: number | null
          downvotes?: number | null
          id?: string
          parent_id?: string | null
          post_id?: string
          score?: number | null
          updated_at?: string | null
          upvotes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_votes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
          vote_type: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
          vote_type: number
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
          vote_type?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          comments_count: number | null
          content: string
          created_at: string | null
          downvotes: number | null
          id: string
          post_type: string | null
          score: number | null
          tags: string[] | null
          updated_at: string | null
          upvotes: number | null
          url: string | null
          views_count: number | null
        }
        Insert: {
          author_id: string
          comments_count?: number | null
          content: string
          created_at?: string | null
          downvotes?: number | null
          id?: string
          post_type?: string | null
          score?: number | null
          tags?: string[] | null
          updated_at?: string | null
          upvotes?: number | null
          url?: string | null
          views_count?: number | null
        }
        Update: {
          author_id?: string
          comments_count?: number | null
          content?: string
          created_at?: string | null
          downvotes?: number | null
          id?: string
          post_type?: string | null
          score?: number | null
          tags?: string[] | null
          updated_at?: string | null
          upvotes?: number | null
          url?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          agent_description: string | null
          agent_name: string | null
          agent_operator_url: string | null
          agent_source_url: string | null
          agent_version: string | null
          ai_tools: string[] | null
          avatar_url: string | null
          average_rating: number | null
          banner_url: string | null
          bio: string | null
          created_at: string | null
          did: string | null
          email_confirmed_at: string | null
          followers_count: number | null
          following_count: number | null
          full_name: string | null
          github_url: string | null
          hourly_rate: number | null
          id: string
          is_available: boolean | null
          is_spam: boolean
          last_active_at: string | null
          linkedin_url: string | null
          ln_address: string | null
          location: string | null
          portfolio_urls: string[] | null
          preferred_coin: string | null
          profile_completed: boolean | null
          rate_amount: number | null
          rate_type: Database["public"]["Enums"]["budget_type"] | null
          rate_unit: string | null
          referral_code: string | null
          reminder_sent_at: string | null
          resume_filename: string | null
          resume_url: string | null
          skills: string[] | null
          timezone: string | null
          total_reviews: number | null
          twitter_url: string | null
          updated_at: string | null
          username: string
          verification_type:
            | Database["public"]["Enums"]["verification_type"]
            | null
          verified: boolean | null
          verified_at: string | null
          wallet_addresses: Json | null
          website: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          agent_description?: string | null
          agent_name?: string | null
          agent_operator_url?: string | null
          agent_source_url?: string | null
          agent_version?: string | null
          ai_tools?: string[] | null
          avatar_url?: string | null
          average_rating?: number | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string | null
          did?: string | null
          email_confirmed_at?: string | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          github_url?: string | null
          hourly_rate?: number | null
          id: string
          is_available?: boolean | null
          is_spam?: boolean
          last_active_at?: string | null
          linkedin_url?: string | null
          ln_address?: string | null
          location?: string | null
          portfolio_urls?: string[] | null
          preferred_coin?: string | null
          profile_completed?: boolean | null
          rate_amount?: number | null
          rate_type?: Database["public"]["Enums"]["budget_type"] | null
          rate_unit?: string | null
          referral_code?: string | null
          reminder_sent_at?: string | null
          resume_filename?: string | null
          resume_url?: string | null
          skills?: string[] | null
          timezone?: string | null
          total_reviews?: number | null
          twitter_url?: string | null
          updated_at?: string | null
          username: string
          verification_type?:
            | Database["public"]["Enums"]["verification_type"]
            | null
          verified?: boolean | null
          verified_at?: string | null
          wallet_addresses?: Json | null
          website?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          agent_description?: string | null
          agent_name?: string | null
          agent_operator_url?: string | null
          agent_source_url?: string | null
          agent_version?: string | null
          ai_tools?: string[] | null
          avatar_url?: string | null
          average_rating?: number | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string | null
          did?: string | null
          email_confirmed_at?: string | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          github_url?: string | null
          hourly_rate?: number | null
          id?: string
          is_available?: boolean | null
          is_spam?: boolean
          last_active_at?: string | null
          linkedin_url?: string | null
          ln_address?: string | null
          location?: string | null
          portfolio_urls?: string[] | null
          preferred_coin?: string | null
          profile_completed?: boolean | null
          rate_amount?: number | null
          rate_type?: Database["public"]["Enums"]["budget_type"] | null
          rate_unit?: string | null
          referral_code?: string | null
          reminder_sent_at?: string | null
          resume_filename?: string | null
          resume_url?: string | null
          skills?: string[] | null
          timezone?: string | null
          total_reviews?: number | null
          twitter_url?: string | null
          updated_at?: string | null
          username?: string
          verification_type?:
            | Database["public"]["Enums"]["verification_type"]
            | null
          verified?: boolean | null
          verified_at?: string | null
          wallet_addresses?: Json | null
          website?: string | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string | null
          id: string
          referral_code: string
          referred_email: string
          referred_user_id: string | null
          referrer_id: string
          registered_at: string | null
          status: Database["public"]["Enums"]["referral_status"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          referral_code: string
          referred_email: string
          referred_user_id?: string | null
          referrer_id: string
          registered_at?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
        }
        Update: {
          created_at?: string | null
          id?: string
          referral_code?: string
          referred_email?: string
          referred_user_id?: string | null
          referrer_id?: string
          registered_at?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          gig_id: string
          id: string
          rating: number
          reviewee_id: string
          reviewer_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          gig_id: string
          id?: string
          rating: number
          reviewee_id: string
          reviewer_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          gig_id?: string
          id?: string
          rating?: number
          reviewee_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_gigs: {
        Row: {
          created_at: string
          gig_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gig_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gig_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_gigs_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_gigs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          coinpay_payment_id: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: Database["public"]["Enums"]["subscription_plan"] | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          coinpay_payment_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"] | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          coinpay_payment_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"] | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_follows: {
        Row: {
          created_at: string | null
          id: string
          tag: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          tag: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          tag?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          created_at: string | null
          evidence: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status:
            | Database["public"]["Enums"]["verification_request_status"]
            | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          evidence: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?:
            | Database["public"]["Enums"]["verification_request_status"]
            | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          evidence?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?:
            | Database["public"]["Enums"]["verification_request_status"]
            | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_calls: {
        Row: {
          application_id: string | null
          created_at: string | null
          ended_at: string | null
          gig_id: string | null
          id: string
          initiator_id: string
          participant_ids: string[]
          room_id: string
          scheduled_at: string | null
          started_at: string | null
        }
        Insert: {
          application_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          gig_id?: string | null
          id?: string
          initiator_id: string
          participant_ids: string[]
          room_id: string
          scheduled_at?: string | null
          started_at?: string | null
        }
        Update: {
          application_id?: string | null
          created_at?: string | null
          ended_at?: string | null
          gig_id?: string | null
          id?: string
          initiator_id?: string
          participant_ids?: string[]
          room_id?: string
          scheduled_at?: string | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_calls_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_calls_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_calls_initiator_id_fkey"
            columns: ["initiator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount_sats: number
          balance_after: number
          bolt11: string | null
          created_at: string | null
          id: string
          reference_id: string | null
          status: string
          type: string
          user_id: string
        }
        Insert: {
          amount_sats: number
          balance_after: number
          bolt11?: string | null
          created_at?: string | null
          id?: string
          reference_id?: string | null
          status?: string
          type: string
          user_id: string
        }
        Update: {
          amount_sats?: number
          balance_after?: number
          bolt11?: string | null
          created_at?: string | null
          id?: string
          reference_id?: string | null
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance_sats: number
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance_sats?: number
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance_sats?: number
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          status_code: number | null
          webhook_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          response_body?: string | null
          status_code?: number | null
          webhook_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          status_code?: number | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          active: boolean
          created_at: string
          events: string[]
          id: string
          secret: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          secret: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          secret?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      work_history: {
        Row: {
          company: string
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          is_current: boolean | null
          location: string | null
          position: string
          start_date: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          location?: string | null
          position: string
          start_date: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company?: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          location?: string | null
          position?: string
          start_date?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      zaps: {
        Row: {
          amount_sats: number
          created_at: string | null
          fee_sats: number
          id: string
          note: string | null
          recipient_id: string
          sender_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          amount_sats: number
          created_at?: string | null
          fee_sats?: number
          id?: string
          note?: string | null
          recipient_id: string
          sender_id: string
          target_id: string
          target_type: string
        }
        Update: {
          amount_sats?: number
          created_at?: string | null
          fee_sats?: number
          id?: string
          note?: string | null
          recipient_id?: string
          sender_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_username_spam: {
        Args: { fname?: string; uname: string }
        Returns: boolean
      }
      create_notification: {
        Args: {
          p_data?: Json
          p_message?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      decrement_gig_usage: {
        Args: { p_month: number; p_user_id: string; p_year: number }
        Returns: undefined
      }
      get_api_key_user: {
        Args: { p_key_prefix: string }
        Returns: {
          key_hash: string
          key_id: string
          user_id: string
        }[]
      }
      get_user_rating: {
        Args: { p_user_id: string }
        Returns: {
          average_rating: number
          total_reviews: number
        }[]
      }
      increment_gig_usage: {
        Args: { p_month: number; p_user_id: string; p_year: number }
        Returns: undefined
      }
      increment_gig_usage_for_active: {
        Args: { p_month: number; p_user_id: string; p_year: number }
        Returns: undefined
      }
      increment_post_views: { Args: { post_id: string }; Returns: undefined }
      update_api_key_last_used: {
        Args: { p_key_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "human" | "agent"
      application_status:
        | "pending"
        | "reviewing"
        | "shortlisted"
        | "rejected"
        | "accepted"
        | "withdrawn"
      budget_type:
        | "fixed"
        | "hourly"
        | "per_task"
        | "per_unit"
        | "revenue_share"
        | "daily"
        | "weekly"
        | "monthly"
        | "yearly"
      gig_status: "draft" | "active" | "paused" | "closed" | "filled"
      location_type: "remote" | "onsite" | "hybrid"
      notification_type:
        | "new_application"
        | "application_status"
        | "new_message"
        | "call_scheduled"
        | "review_received"
        | "gig_update"
        | "payment_received"
        | "new_comment"
        | "endorsement_received"
        | "new_follower"
        | "mention"
      payment_status:
        | "pending"
        | "confirmed"
        | "forwarded"
        | "expired"
        | "failed"
      payment_type: "subscription" | "gig_payment" | "tip"
      referral_status: "pending" | "registered" | "active"
      subscription_plan: "free" | "pro"
      subscription_status:
        | "active"
        | "canceled"
        | "past_due"
        | "trialing"
        | "incomplete"
      verification_request_status: "pending" | "approved" | "rejected"
      verification_type: "manual" | "auto" | "premium"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["human", "agent"],
      application_status: [
        "pending",
        "reviewing",
        "shortlisted",
        "rejected",
        "accepted",
        "withdrawn",
      ],
      budget_type: [
        "fixed",
        "hourly",
        "per_task",
        "per_unit",
        "revenue_share",
        "daily",
        "weekly",
        "monthly",
        "yearly",
      ],
      gig_status: ["draft", "active", "paused", "closed", "filled"],
      location_type: ["remote", "onsite", "hybrid"],
      notification_type: [
        "new_application",
        "application_status",
        "new_message",
        "call_scheduled",
        "review_received",
        "gig_update",
        "payment_received",
        "new_comment",
        "endorsement_received",
        "new_follower",
        "mention",
      ],
      payment_status: [
        "pending",
        "confirmed",
        "forwarded",
        "expired",
        "failed",
      ],
      payment_type: ["subscription", "gig_payment", "tip"],
      referral_status: ["pending", "registered", "active"],
      subscription_plan: ["free", "pro"],
      subscription_status: [
        "active",
        "canceled",
        "past_due",
        "trialing",
        "incomplete",
      ],
      verification_request_status: ["pending", "approved", "rejected"],
      verification_type: ["manual", "auto", "premium"],
    },
  },
} as const
