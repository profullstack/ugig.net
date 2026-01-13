"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/types";

interface ProfileCompletionProps {
  profile: Profile;
  showLink?: boolean;
}

interface CompletionItem {
  label: string;
  completed: boolean;
  weight: number;
}

export function calculateProfileCompletion(profile: Profile): {
  percentage: number;
  items: CompletionItem[];
} {
  const items: CompletionItem[] = [
    {
      label: "Full name",
      completed: Boolean(profile.full_name),
      weight: 15,
    },
    {
      label: "Bio",
      completed: Boolean(profile.bio && profile.bio.length >= 20),
      weight: 20,
    },
    {
      label: "Skills",
      completed: Boolean(profile.skills && profile.skills.length >= 3),
      weight: 20,
    },
    {
      label: "AI tools",
      completed: Boolean(profile.ai_tools && profile.ai_tools.length >= 1),
      weight: 15,
    },
    {
      label: "Hourly rate",
      completed: Boolean(profile.hourly_rate),
      weight: 10,
    },
    {
      label: "Portfolio links",
      completed: Boolean(profile.portfolio_urls && profile.portfolio_urls.length >= 1),
      weight: 10,
    },
    {
      label: "Location",
      completed: Boolean(profile.location),
      weight: 5,
    },
    {
      label: "Profile picture",
      completed: Boolean(profile.avatar_url),
      weight: 5,
    },
  ];

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const completedWeight = items
    .filter((item) => item.completed)
    .reduce((sum, item) => sum + item.weight, 0);

  const percentage = Math.round((completedWeight / totalWeight) * 100);

  return { percentage, items };
}

export function ProfileCompletion({ profile, showLink = true }: ProfileCompletionProps) {
  const { percentage, items } = calculateProfileCompletion(profile);
  const incompleteItems = items.filter((item) => !item.completed);

  if (percentage === 100) {
    return null;
  }

  return (
    <div className="p-6 bg-card rounded-lg border border-border">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Profile Completion</h2>
        <span className="text-lg font-bold text-primary">{percentage}%</span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted rounded-full h-2 mb-4">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Incomplete Items */}
      {incompleteItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-2">
            Complete these to improve your profile:
          </p>
          <ul className="text-sm space-y-1">
            {incompleteItems.slice(0, 4).map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                {item.label}
              </li>
            ))}
            {incompleteItems.length > 4 && (
              <li className="text-muted-foreground">
                +{incompleteItems.length - 4} more
              </li>
            )}
          </ul>
        </div>
      )}

      {showLink && (
        <Link href="/profile" className="block mt-4">
          <Button variant="outline" className="w-full">
            Complete Profile
          </Button>
        </Link>
      )}
    </div>
  );
}
