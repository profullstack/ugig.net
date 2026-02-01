"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ActivityFeed } from "./ActivityFeed";

interface ProfileTabsProps {
  username: string;
  defaultTab?: string;
  children: React.ReactNode;
}

export function ProfileTabs({
  username,
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
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "profile"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => handleTabChange("activity")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
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
      {activeTab === "activity" && (
        <div className="p-6 bg-card rounded-lg border border-border">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <ActivityFeed username={username} />
        </div>
      )}
    </div>
  );
}
