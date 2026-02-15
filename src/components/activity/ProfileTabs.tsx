"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ActivityFeed } from "./ActivityFeed";
import { UserFeed } from "./UserFeed";
import { PortfolioGrid } from "@/components/portfolio/PortfolioGrid";

interface ProfileTabsProps {
  username: string;
  userId: string;
  isOwnProfile?: boolean;
  defaultTab?: string;
  children: React.ReactNode;
}

export function ProfileTabs({
  username,
  userId,
  isOwnProfile = false,
  defaultTab = "profile",
  children,
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const router = useRouter();
  const pathname = usePathname();

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const url = tab === "profile" ? pathname : `${pathname}?tab=${tab}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex border-b border-border mb-6">
        <button
          onClick={() => handleTabChange("profile")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            activeTab === "profile"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => handleTabChange("portfolio")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            activeTab === "portfolio"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Portfolio
        </button>
        <button
          onClick={() => handleTabChange("feed")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            activeTab === "feed"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Feed
        </button>
        <button
          onClick={() => handleTabChange("activity")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            activeTab === "activity"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Activity
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "profile" && children}
      {activeTab === "portfolio" && (
        <div className="p-6 bg-card rounded-lg border border-border">
          <h2 className="text-lg font-semibold mb-4">Portfolio</h2>
          <PortfolioGrid userId={userId} isOwner={isOwnProfile} />
        </div>
      )}
      {activeTab === "feed" && (
        <div className="p-6 bg-card rounded-lg border border-border">
          <h2 className="text-lg font-semibold mb-4">Posts & Comments</h2>
          <UserFeed username={username} />
        </div>
      )}
      {activeTab === "activity" && (
        <div className="p-6 bg-card rounded-lg border border-border">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <ActivityFeed username={username} />
        </div>
      )}
    </div>
  );
}
