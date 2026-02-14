export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          id: string;
          user_id: string;
          activity_type: string;
          reference_id: string | null;
          reference_type: string | null;
          metadata: Json;
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          activity_type: string;
          reference_id?: string | null;
          reference_type?: string | null;
          metadata?: Json;
          is_public?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          activity_type?: string;
          reference_id?: string | null;
          reference_type?: string | null;
          metadata?: Json;
          is_public?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      profiles: {
        Row: {
          id: string;
          username: string;
          full_name: string | null;
          avatar_url: string | null;
          banner_url: string | null;
          bio: string | null;
          skills: string[];
          ai_tools: string[];
          hourly_rate: number | null;
          portfolio_urls: string[];
          location: string | null;
          timezone: string | null;
          is_available: boolean;
          profile_completed: boolean;
          resume_url: string | null;
          resume_filename: string | null;
          website: string | null;
          linkedin_url: string | null;
          github_url: string | null;
          twitter_url: string | null;
          wallet_addresses: Json;
          account_type: "human" | "agent";
          agent_name: string | null;
          agent_description: string | null;
          agent_version: string | null;
          agent_operator_url: string | null;
          agent_source_url: string | null;
          did: string | null;
          rate_type: "fixed" | "hourly" | "daily" | "weekly" | "monthly" | "per_task" | "per_unit" | "revenue_share" | null;
          rate_amount: number | null;
          rate_unit: string | null;
          preferred_coin: string | null;
          verified: boolean;
          verified_at: string | null;
          verification_type: "manual" | "auto" | "premium" | null;
          followers_count: number;
          following_count: number;
          reminder_sent_at: string | null;
          last_active_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name?: string | null;
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string | null;
          skills?: string[];
          ai_tools?: string[];
          hourly_rate?: number | null;
          portfolio_urls?: string[];
          location?: string | null;
          timezone?: string | null;
          is_available?: boolean;
          profile_completed?: boolean;
          resume_url?: string | null;
          resume_filename?: string | null;
          website?: string | null;
          linkedin_url?: string | null;
          github_url?: string | null;
          twitter_url?: string | null;
          wallet_addresses?: Json;
          account_type?: "human" | "agent";
          agent_name?: string | null;
          agent_description?: string | null;
          agent_version?: string | null;
          agent_operator_url?: string | null;
          agent_source_url?: string | null;
          did?: string | null;
          rate_type?: "fixed" | "hourly" | "daily" | "weekly" | "monthly" | "per_task" | "per_unit" | "revenue_share" | null;
          rate_amount?: number | null;
          rate_unit?: string | null;
          preferred_coin?: string | null;
          verified?: boolean;
          verified_at?: string | null;
          verification_type?: "manual" | "auto" | "premium" | null;
          followers_count?: number;
          following_count?: number;
          reminder_sent_at?: string | null;
          last_active_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string | null;
          skills?: string[];
          ai_tools?: string[];
          hourly_rate?: number | null;
          portfolio_urls?: string[];
          location?: string | null;
          timezone?: string | null;
          is_available?: boolean;
          profile_completed?: boolean;
          resume_url?: string | null;
          resume_filename?: string | null;
          website?: string | null;
          linkedin_url?: string | null;
          github_url?: string | null;
          twitter_url?: string | null;
          wallet_addresses?: Json;
          account_type?: "human" | "agent";
          agent_name?: string | null;
          agent_description?: string | null;
          agent_version?: string | null;
          agent_operator_url?: string | null;
          agent_source_url?: string | null;
          did?: string | null;
          rate_type?: "fixed" | "hourly" | "daily" | "weekly" | "monthly" | "per_task" | "per_unit" | "revenue_share" | null;
          rate_amount?: number | null;
          rate_unit?: string | null;
          preferred_coin?: string | null;
          verified?: boolean;
          verified_at?: string | null;
          verification_type?: "manual" | "auto" | "premium" | null;
          followers_count?: number;
          following_count?: number;
          reminder_sent_at?: string | null;
          last_active_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      gigs: {
        Row: {
          id: string;
          poster_id: string;
          title: string;
          description: string;
          category: string;
          skills_required: string[];
          ai_tools_preferred: string[];
          budget_type: "fixed" | "hourly" | "daily" | "weekly" | "monthly" | "per_task" | "per_unit" | "revenue_share";
          budget_min: number | null;
          budget_max: number | null;
          budget_unit: string | null;
          payment_coin: string | null;
          duration: string | null;
          location_type: "remote" | "onsite" | "hybrid";
          location: string | null;
          status: "draft" | "active" | "paused" | "closed" | "filled";
          applications_count: number;
          views_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          poster_id: string;
          title: string;
          description: string;
          category: string;
          skills_required?: string[];
          ai_tools_preferred?: string[];
          budget_type: "fixed" | "hourly" | "daily" | "weekly" | "monthly" | "per_task" | "per_unit" | "revenue_share";
          budget_min?: number | null;
          budget_max?: number | null;
          budget_unit?: string | null;
          payment_coin?: string | null;
          duration?: string | null;
          location_type?: "remote" | "onsite" | "hybrid";
          location?: string | null;
          status?: "draft" | "active" | "paused" | "closed" | "filled";
          applications_count?: number;
          views_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          poster_id?: string;
          title?: string;
          description?: string;
          category?: string;
          skills_required?: string[];
          ai_tools_preferred?: string[];
          budget_type?: "fixed" | "hourly" | "daily" | "weekly" | "monthly" | "per_task" | "per_unit" | "revenue_share";
          budget_min?: number | null;
          budget_max?: number | null;
          budget_unit?: string | null;
          payment_coin?: string | null;
          duration?: string | null;
          location_type?: "remote" | "onsite" | "hybrid";
          location?: string | null;
          status?: "draft" | "active" | "paused" | "closed" | "filled";
          applications_count?: number;
          views_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gigs_poster_id_fkey";
            columns: ["poster_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      applications: {
        Row: {
          id: string;
          gig_id: string;
          applicant_id: string;
          cover_letter: string;
          proposed_rate: number | null;
          proposed_timeline: string | null;
          portfolio_items: string[];
          ai_tools_to_use: string[];
          status:
            | "pending"
            | "reviewing"
            | "shortlisted"
            | "rejected"
            | "accepted"
            | "withdrawn";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          gig_id: string;
          applicant_id: string;
          cover_letter: string;
          proposed_rate?: number | null;
          proposed_timeline?: string | null;
          portfolio_items?: string[];
          ai_tools_to_use?: string[];
          status?:
            | "pending"
            | "reviewing"
            | "shortlisted"
            | "rejected"
            | "accepted"
            | "withdrawn";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          gig_id?: string;
          applicant_id?: string;
          cover_letter?: string;
          proposed_rate?: number | null;
          proposed_timeline?: string | null;
          portfolio_items?: string[];
          ai_tools_to_use?: string[];
          status?:
            | "pending"
            | "reviewing"
            | "shortlisted"
            | "rejected"
            | "accepted"
            | "withdrawn";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "applications_gig_id_fkey";
            columns: ["gig_id"];
            isOneToOne: false;
            referencedRelation: "gigs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_applicant_id_fkey";
            columns: ["applicant_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      conversations: {
        Row: {
          id: string;
          participant_ids: string[];
          gig_id: string | null;
          last_message_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          participant_ids: string[];
          gig_id?: string | null;
          last_message_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          participant_ids?: string[];
          gig_id?: string | null;
          last_message_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_gig_id_fkey";
            columns: ["gig_id"];
            isOneToOne: false;
            referencedRelation: "gigs";
            referencedColumns: ["id"];
          }
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          attachments: Json;
          read_by: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          attachments?: Json;
          read_by?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string;
          content?: string;
          attachments?: Json;
          read_by?: string[];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          coinpay_payment_id: string | null;
          status: "active" | "canceled" | "past_due" | "trialing" | "incomplete";
          plan: "free" | "pro";
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          coinpay_payment_id?: string | null;
          status?: "active" | "canceled" | "past_due" | "trialing" | "incomplete";
          plan?: "free" | "pro";
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          coinpay_payment_id?: string | null;
          status?: "active" | "canceled" | "past_due" | "trialing" | "incomplete";
          plan?: "free" | "pro";
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          coinpay_payment_id: string | null;
          stripe_payment_id: string | null;
          amount_usd: number;
          amount_crypto: number | null;
          currency: string;
          status: "pending" | "confirmed" | "forwarded" | "expired" | "failed";
          type: "subscription" | "gig_payment" | "tip";
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          coinpay_payment_id?: string | null;
          stripe_payment_id?: string | null;
          amount_usd: number;
          amount_crypto?: number | null;
          currency: string;
          status?: "pending" | "confirmed" | "forwarded" | "expired" | "failed";
          type: "subscription" | "gig_payment" | "tip";
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          coinpay_payment_id?: string | null;
          stripe_payment_id?: string | null;
          amount_usd?: number;
          amount_crypto?: number | null;
          currency?: string;
          status?: "pending" | "confirmed" | "forwarded" | "expired" | "failed";
          type?: "subscription" | "gig_payment" | "tip";
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      gig_usage: {
        Row: {
          id: string;
          user_id: string;
          month: number;
          year: number;
          posts_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          month: number;
          year: number;
          posts_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          month?: number;
          year?: number;
          posts_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gig_usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      reviews: {
        Row: {
          id: string;
          gig_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          gig_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          gig_id?: string;
          reviewer_id?: string;
          reviewee_id?: string;
          rating?: number;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_gig_id_fkey";
            columns: ["gig_id"];
            isOneToOne: false;
            referencedRelation: "gigs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey";
            columns: ["reviewee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type:
            | "new_application"
            | "application_status"
            | "new_message"
            | "call_scheduled"
            | "review_received"
            | "gig_update"
            | "payment_received"
            | "new_comment"
            | "new_follower"
            | "endorsement_received"
            | "mention";
          title: string;
          body: string | null;
          data: Json;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type:
            | "new_application"
            | "application_status"
            | "new_message"
            | "call_scheduled"
            | "review_received"
            | "gig_update"
            | "payment_received"
            | "new_comment"
            | "new_follower"
            | "endorsement_received"
            | "mention";
          title: string;
          body?: string | null;
          data?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?:
            | "new_application"
            | "application_status"
            | "new_message"
            | "call_scheduled"
            | "review_received"
            | "gig_update"
            | "payment_received"
            | "new_comment"
            | "new_follower"
            | "endorsement_received"
            | "mention";
          title?: string;
          body?: string | null;
          data?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      video_calls: {
        Row: {
          id: string;
          room_id: string;
          initiator_id: string;
          participant_ids: string[];
          gig_id: string | null;
          application_id: string | null;
          scheduled_at: string | null;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          initiator_id: string;
          participant_ids: string[];
          gig_id?: string | null;
          application_id?: string | null;
          scheduled_at?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          initiator_id?: string;
          participant_ids?: string[];
          gig_id?: string | null;
          application_id?: string | null;
          scheduled_at?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "video_calls_initiator_id_fkey";
            columns: ["initiator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "video_calls_gig_id_fkey";
            columns: ["gig_id"];
            isOneToOne: false;
            referencedRelation: "gigs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "video_calls_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          }
        ];
      };
      work_history: {
        Row: {
          id: string;
          user_id: string;
          company: string;
          position: string;
          description: string | null;
          start_date: string;
          end_date: string | null;
          is_current: boolean;
          location: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company: string;
          position: string;
          description?: string | null;
          start_date: string;
          end_date?: string | null;
          is_current?: boolean;
          location?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company?: string;
          position?: string;
          description?: string | null;
          start_date?: string;
          end_date?: string | null;
          is_current?: boolean;
          location?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      saved_gigs: {
        Row: {
          id: string;
          user_id: string;
          gig_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          gig_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          gig_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_gigs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_gigs_gig_id_fkey";
            columns: ["gig_id"];
            isOneToOne: false;
            referencedRelation: "gigs";
            referencedColumns: ["id"];
          }
        ];
      };
      gig_comments: {
        Row: {
          id: string;
          gig_id: string;
          author_id: string;
          parent_id: string | null;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          gig_id: string;
          author_id: string;
          parent_id?: string | null;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          gig_id?: string;
          author_id?: string;
          parent_id?: string | null;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gig_comments_gig_id_fkey";
            columns: ["gig_id"];
            isOneToOne: false;
            referencedRelation: "gigs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gig_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gig_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "gig_comments";
            referencedColumns: ["id"];
          }
        ];
      };
      post_comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          parent_id: string | null;
          content: string;
          depth: number;
          upvotes: number;
          downvotes: number;
          score: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          parent_id?: string | null;
          content: string;
          depth?: number;
          upvotes?: number;
          downvotes?: number;
          score?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string;
          author_id?: string;
          parent_id?: string | null;
          content?: string;
          depth?: number;
          upvotes?: number;
          downvotes?: number;
          score?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "post_comments";
            referencedColumns: ["id"];
          }
        ];
      };
      post_comment_votes: {
        Row: {
          id: string;
          comment_id: string;
          user_id: string;
          vote_type: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          comment_id: string;
          user_id: string;
          vote_type: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          comment_id?: string;
          user_id?: string;
          vote_type?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_comment_votes_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "post_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_comment_votes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      tag_follows: {
        Row: {
          id: string;
          user_id: string;
          tag: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tag: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tag?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tag_follows_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      follows: {
        Row: {
          id: string;
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          follower_id?: string;
          following_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_following_id_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          content: string;
          url: string | null;
          post_type: string;
          tags: string[];
          upvotes: number;
          downvotes: number;
          score: number;
          comments_count: number;
          views_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          content: string;
          url?: string | null;
          post_type?: string;
          tags?: string[];
          upvotes?: number;
          downvotes?: number;
          score?: number;
          comments_count?: number;
          views_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          content?: string;
          url?: string | null;
          post_type?: string;
          tags?: string[];
          upvotes?: number;
          downvotes?: number;
          score?: number;
          comments_count?: number;
          views_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      post_votes: {
        Row: {
          id: string;
          post_id: string;
          user_id: string;
          vote_type: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          user_id: string;
          vote_type: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string;
          user_id?: string;
          vote_type?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_votes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_votes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      endorsements: {
        Row: {
          id: string;
          endorser_id: string;
          endorsed_id: string;
          skill: string;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          endorser_id: string;
          endorsed_id: string;
          skill: string;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          endorser_id?: string;
          endorsed_id?: string;
          skill?: string;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "endorsements_endorser_id_fkey";
            columns: ["endorser_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "endorsements_endorsed_id_fkey";
            columns: ["endorsed_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      portfolio_items: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          url: string | null;
          image_url: string | null;
          tags: string[];
          gig_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          url?: string | null;
          image_url?: string | null;
          tags?: string[];
          gig_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          url?: string | null;
          image_url?: string | null;
          tags?: string[];
          gig_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portfolio_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portfolio_items_gig_id_fkey";
            columns: ["gig_id"];
            isOneToOne: false;
            referencedRelation: "gigs";
            referencedColumns: ["id"];
          }
        ];
      };
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          expires_at: string | null;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          last_used_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          key_hash?: string;
          key_prefix?: string;
          last_used_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      webhooks: {
        Row: {
          id: string;
          user_id: string;
          url: string;
          secret: string;
          events: string[];
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          url: string;
          secret: string;
          events: string[];
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          url?: string;
          secret?: string;
          events?: string[];
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_deliveries: {
        Row: {
          id: string;
          webhook_id: string;
          event_type: string;
          payload: Json;
          status_code: number | null;
          response_body: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          webhook_id: string;
          event_type: string;
          payload?: Json;
          status_code?: number | null;
          response_body?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          webhook_id?: string;
          event_type?: string;
          payload?: Json;
          status_code?: number | null;
          response_body?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: false;
            referencedRelation: "webhooks";
            referencedColumns: ["id"];
          }
        ];
      };
      verification_requests: {
        Row: {
          id: string;
          user_id: string;
          evidence: string;
          status: "pending" | "approved" | "rejected";
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          evidence: string;
          status?: "pending" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          evidence?: string;
          status?: "pending" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "verification_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
        Views: {
      [_ in never]: never;
    };
    Functions: {
      increment_gig_usage: {
        Args: {
          p_user_id: string;
          p_month: number;
          p_year: number;
        };
        Returns: undefined;
      };
      get_api_key_user: {
        Args: {
          p_key_prefix: string;
        };
        Returns: {
          user_id: string;
          key_hash: string;
          key_id: string;
        }[];
      };
      update_api_key_last_used: {
        Args: {
          p_key_id: string;
        };
        Returns: undefined;
      };
      increment_post_views: {
        Args: {
          post_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      account_type: "human" | "agent";
      gig_status: "draft" | "active" | "paused" | "closed" | "filled";
      budget_type: "fixed" | "hourly" | "daily" | "weekly" | "monthly" | "per_task" | "per_unit" | "revenue_share";
      location_type: "remote" | "onsite" | "hybrid";
      application_status:
        | "pending"
        | "reviewing"
        | "shortlisted"
        | "rejected"
        | "accepted"
        | "withdrawn";
      subscription_status:
        | "active"
        | "canceled"
        | "past_due"
        | "trialing"
        | "incomplete";
      subscription_plan: "free" | "pro";
      notification_type:
        | "new_application"
        | "application_status"
        | "new_message"
        | "call_scheduled"
        | "review_received"
        | "gig_update"
        | "payment_received"
        | "new_comment"
        | "new_follower"
        | "endorsement_received"
            | "mention";
      payment_status: "pending" | "confirmed" | "forwarded" | "expired" | "failed";
      payment_type: "subscription" | "gig_payment" | "tip";
      verification_type: "manual" | "auto" | "premium";
      verification_request_status: "pending" | "approved" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
      PublicSchema["Views"])
  ? (PublicSchema["Tables"] &
      PublicSchema["Views"])[PublicTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
  ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I;
    }
    ? I
    : never
  : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
  ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U;
    }
    ? U
    : never
  : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
  ? PublicSchema["Enums"][PublicEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
  ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;
