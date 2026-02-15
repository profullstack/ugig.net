import { SupabaseClient } from "@supabase/supabase-js";

export type NotificationSettingKey =
  | "email_new_message"
  | "email_new_comment"
  | "email_new_follower"
  | "email_new_application"
  | "email_application_status"
  | "email_review_received"
  | "email_endorsement_received"
  | "email_gig_updates"
  | "email_mention"
  | "email_upvote_milestone";

/**
 * Check if a user has a specific email notification enabled.
 * Returns true by default if no settings row exists (opt-out model).
 */
export async function isEmailNotificationEnabled(
  supabase: SupabaseClient,
  userId: string,
  settingKey: NotificationSettingKey
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("notification_settings")
      .select(settingKey)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      // No settings row = all enabled by default
      return true;
    }

    return data[settingKey] !== false;
  } catch {
    // Default to enabled on error
    return true;
  }
}
