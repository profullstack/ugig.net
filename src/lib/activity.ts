import { SupabaseClient } from "@supabase/supabase-js";

export type ActivityType =
  | "gig_posted"
  | "gig_applied"
  | "gig_completed"
  | "review_given"
  | "review_received"
  | "post_created"
  | "comment_posted"
  | "endorsement_given"
  | "endorsement_received"
  | "followed_user";

interface LogActivityParams {
  userId: string;
  activityType: ActivityType;
  referenceId?: string | null;
  referenceType?: string | null;
  metadata?: Record<string, unknown>;
  isPublic?: boolean;
}

/**
 * Log a user activity. Fire-and-forget — errors are logged but never thrown.
 */
export async function logActivity(
  supabase: SupabaseClient,
  params: LogActivityParams
): Promise<void> {
  try {
    const { error } = await supabase.from("activities").insert({
      user_id: params.userId,
      activity_type: params.activityType,
      reference_id: params.referenceId || null,
      reference_type: params.referenceType || null,
      metadata: params.metadata || {},
      is_public: params.isPublic ?? true,
    });
    if (error) {
      console.error("[activity] Failed to log activity:", error.message);
    }
  } catch (err) {
    console.error("[activity] Unexpected error logging activity:", err);
  }
}
