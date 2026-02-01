"use client";

import Link from "next/link";
import {
  Briefcase,
  Send,
  CheckCircle,
  Star,
  Award,
  type LucideIcon,
} from "lucide-react";
import type { ActivityType } from "@/types";

interface ActivityItemProps {
  activity: {
    id: string;
    activity_type: string;
    reference_id: string | null;
    reference_type: string | null;
    metadata: Record<string, unknown>;
    is_public: boolean;
    created_at: string;
    user?: {
      id: string;
      username: string;
      full_name: string | null;
      avatar_url: string | null;
    };
  };
  showUser?: boolean;
}

const ACTIVITY_CONFIG: Record<
  string,
  { icon: LucideIcon; color: string; label: string }
> = {
  gig_posted: {
    icon: Briefcase,
    color: "text-blue-500",
    label: "posted a new gig",
  },
  gig_applied: {
    icon: Send,
    color: "text-yellow-500",
    label: "applied to a gig",
  },
  gig_completed: {
    icon: CheckCircle,
    color: "text-green-500",
    label: "completed a gig",
  },
  review_given: {
    icon: Star,
    color: "text-amber-500",
    label: "left a review",
  },
  review_received: {
    icon: Award,
    color: "text-purple-500",
    label: "received a review",
  },
  post_created: {
    icon: Briefcase,
    color: "text-blue-400",
    label: "created a post",
  },
  comment_posted: {
    icon: Send,
    color: "text-gray-500",
    label: "commented",
  },
  endorsement_given: {
    icon: Award,
    color: "text-indigo-500",
    label: "endorsed someone",
  },
  endorsement_received: {
    icon: Award,
    color: "text-indigo-500",
    label: "received an endorsement",
  },
  followed_user: {
    icon: Star,
    color: "text-pink-500",
    label: "followed a user",
  },
};

function getActivityConfig(type: string) {
  return (
    ACTIVITY_CONFIG[type] || {
      icon: Briefcase,
      color: "text-muted-foreground",
      label: type.replace(/_/g, " "),
    }
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function getActivityLink(activity: ActivityItemProps["activity"]): string | null {
  const metadata = activity.metadata || {};
  if (
    activity.reference_type === "gig" &&
    activity.reference_id
  ) {
    return `/gigs/${activity.reference_id}`;
  }
  if (
    activity.reference_type === "review" &&
    metadata.gig_id
  ) {
    return `/gigs/${metadata.gig_id}`;
  }
  return null;
}

function getActivityDescription(activity: ActivityItemProps["activity"]): string {
  const metadata = activity.metadata || {};
  const config = getActivityConfig(activity.activity_type);

  switch (activity.activity_type as ActivityType) {
    case "gig_posted":
      return metadata.gig_title
        ? `${config.label}: ${metadata.gig_title}`
        : config.label;
    case "gig_applied":
      return metadata.gig_title
        ? `${config.label}: ${metadata.gig_title}`
        : config.label;
    case "gig_completed":
      return metadata.gig_title
        ? `${config.label}: ${metadata.gig_title}`
        : config.label;
    case "review_given":
      return metadata.reviewee_name
        ? `left a ${"★".repeat(Number(metadata.rating) || 0)} review for ${metadata.reviewee_name}`
        : config.label;
    case "review_received":
      return metadata.reviewer_name
        ? `received a ${"★".repeat(Number(metadata.rating) || 0)} review from ${metadata.reviewer_name}`
        : config.label;
    default:
      return config.label;
  }
}

export function ActivityItem({ activity, showUser = false }: ActivityItemProps) {
  const config = getActivityConfig(activity.activity_type);
  const Icon = config.icon;
  const link = getActivityLink(activity);
  const description = getActivityDescription(activity);

  const content = (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className={`mt-0.5 ${config.color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          {showUser && activity.user && (
            <span className="font-medium">
              {activity.user.full_name || activity.user.username}
            </span>
          )}{" "}
          <span className="text-muted-foreground">{description}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatRelativeTime(activity.created_at)}
        </p>
      </div>
    </div>
  );

  if (link) {
    return <Link href={link}>{content}</Link>;
  }

  return content;
}
