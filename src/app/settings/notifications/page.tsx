"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Bell, Loader2, Save, Check } from "lucide-react";

interface NotificationSettings {
  email_new_message: boolean;
  email_new_comment: boolean;
  email_new_follower: boolean;
  email_new_application: boolean;
  email_application_status: boolean;
  email_review_received: boolean;
  email_endorsement_received: boolean;
  email_gig_updates: boolean;
  email_mention: boolean;
  email_upvote_milestone: boolean;
}

const SETTING_LABELS: { key: keyof NotificationSettings; label: string; description: string }[] = [
  { key: "email_new_message", label: "New Messages", description: "When someone sends you a message (throttled for active conversations)" },
  { key: "email_new_comment", label: "New Comments", description: "When someone comments on your post or gig" },
  { key: "email_new_follower", label: "New Followers", description: "When someone starts following you" },
  { key: "email_new_application", label: "New Applications", description: "When someone applies to your gig" },
  { key: "email_application_status", label: "Application Updates", description: "When your application status changes" },
  { key: "email_review_received", label: "Reviews Received", description: "When you receive a new review" },
  { key: "email_endorsement_received", label: "Endorsements", description: "When someone endorses your skills" },
  { key: "email_gig_updates", label: "Gig Updates", description: "Updates about gigs you're involved in" },
  { key: "email_mention", label: "Mentions", description: "When someone mentions you in a comment" },
  { key: "email_upvote_milestone", label: "Upvote Milestones", description: "When your post hits an upvote milestone" },
];

const defaults: NotificationSettings = {
  email_new_message: true,
  email_new_comment: true,
  email_new_follower: true,
  email_new_application: true,
  email_application_status: true,
  email_review_received: true,
  email_endorsement_received: true,
  email_gig_updates: true,
  email_mention: true,
  email_upvote_milestone: true,
};

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<NotificationSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notification-settings")
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.data) {
          const s: NotificationSettings = { ...defaults };
          for (const key of Object.keys(defaults) as (keyof NotificationSettings)[]) {
            if (typeof data.data[key] === "boolean") {
              s[key] = data.data[key];
            }
          }
          setSettings(s);
        }
      })
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));
  }, [router]);

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notification-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Bell className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Notification Settings</h1>
          <p className="text-muted-foreground text-sm">Choose which email notifications you receive</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {SETTING_LABELS.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between p-4 gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings[key]}
              aria-label={`${label} email notifications`}
              onClick={() => handleToggle(key)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                settings[key] ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings[key] ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3 mt-6">
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <Check className="h-4 w-4" />
            Saved
          </span>
        )}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
