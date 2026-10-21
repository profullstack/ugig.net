import { createClient } from "@/lib/supabase/server";
import {
  Activity,
  Briefcase,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Award,
  Package,
  FileText,
} from "lucide-react";

interface ProfileActivityStatsProps {
  userId: string;
  lastActiveAt: string | null;
  createdAt: string;
}

export async function ProfileActivityStats({
  userId,
  lastActiveAt,
  createdAt,
}: ProfileActivityStatsProps) {
  const supabase = await createClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const nowMs = now.getTime();

  // Run all counts in parallel
  const [
    gigsPosted,
    gigsApplied,
    skillsPublished,
    postsCreated,
    commentsGiven,
    testimonialsGiven,
    reviewsGiven,
    upvotes,
    downvotes,
    recentActivity,
  ] = await Promise.all([
    // Gigs posted
    supabase
      .from("gigs")
      .select("*", { count: "exact", head: true })
      .eq("poster_id", userId)
      .then((r) => r.count ?? 0),
    // Gigs applied to
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("applicant_id", userId)
      .then((r) => r.count ?? 0),
    // Skills published
    supabase
      .from("skill_listings" as any)
      .select("*", { count: "exact", head: true })
      .eq("seller_id", userId)
      .eq("status", "active")
      .then((r) => r.count ?? 0),
    // Posts created
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("author_id", userId)
      .then((r) => r.count ?? 0),
    // Comments given (gig + post)
    Promise.all([
      supabase
        .from("gig_comments")
        .select("*", { count: "exact", head: true })
        .eq("author_id", userId)
        .then((r) => r.count ?? 0),
      supabase
        .from("post_comments")
        .select("*", { count: "exact", head: true })
        .eq("author_id", userId)
        .then((r) => r.count ?? 0),
    ]).then(([a, b]) => a + b),
    // Testimonials given
    supabase
      .from("testimonials")
      .select("*", { count: "exact", head: true })
      .eq("author_id", userId)
      .then((r) => r.count ?? 0),
    // Reviews given
    supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("reviewer_id", userId)
      .then((r) => r.count ?? 0),
    // Upvotes given
    supabase
      .from("post_votes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("vote_type", 1)
      .then((r) => r.count ?? 0),
    // Downvotes given
    supabase
      .from("post_votes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("vote_type", -1)
      .then((r) => r.count ?? 0),
    // Recent activity count (past 7 days)
    supabase
      .from("activities")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo)
      .then((r) => r.count ?? 0),
  ]);

  // Format "last active" as relative time
  const formatLastActive = (dateStr: string | null): string => {
    if (!dateStr) return "Unknown";
    const diff = nowMs - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  // Format activity summary
  const formatActivitySummary = (count: number): string => {
    if (count === 0) return "No recent activity";
    if (count === 1) return "Active 1 time this week";
    return `Active ${count} times this week`;
  };

  const stats = [
    { icon: Briefcase, label: "Gigs posted", value: gigsPosted },
    { icon: FileText, label: "Applications", value: gigsApplied },
    { icon: MessageSquare, label: "Posts", value: postsCreated },
    { icon: MessageSquare, label: "Comments", value: commentsGiven },
    { icon: Award, label: "Testimonials given", value: testimonialsGiven + reviewsGiven },
    { icon: ThumbsUp, label: "Upvotes", value: upvotes },
    { icon: ThumbsDown, label: "Downvotes", value: downvotes },
  ].filter((s) => s.value > 0);

  return (
    <div className="p-6 bg-card rounded-lg border border-border">
      <h2 className="text-lg font-semibold mb-2">Activity</h2>

      {/* Last active + weekly summary */}
      <div className="space-y-1 mb-4">
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          Last active: <span className="font-medium text-foreground">{formatLastActive(lastActiveAt)}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {formatActivitySummary(recentActivity)}
        </p>
      </div>

      {/* Stats grid */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-2 text-sm">
              <stat.icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-medium ml-auto">{stat.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
