import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { WorkHistoryList } from "@/components/profile/WorkHistoryList";
import { ResumeImport } from "@/components/profile/ResumeImport";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { BannerUpload } from "@/components/profile/BannerUpload";
import { Header } from "@/components/layout/Header";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { EmailVerifiedBadge } from "@/components/ui/EmailVerifiedBadge";
import { BadgeCheck, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Edit Profile | ugig.net",
  description: "Update your profile information",
};

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/profile");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Edit Profile</h1>
          <p className="text-muted-foreground">
            Update your profile information to help clients find you
          </p>
        </div>

        {/* Resume Import */}
        <div className="mb-6">
          <ResumeImport />
        </div>

        {/* Banner Section */}
        <div className="mb-6 p-6 bg-card rounded-lg border border-border shadow-sm">
          <div className="pb-3 mb-4 border-b border-border">
            <h2 className="text-lg font-semibold">Profile Banner</h2>
          </div>
          <BannerUpload bannerUrl={profile.banner_url} />
        </div>

        {/* Avatar Section */}
        <div className="mb-6 p-6 bg-card rounded-lg border border-border shadow-sm">
          <div className="pb-3 mb-4 border-b border-border">
            <h2 className="text-lg font-semibold">Profile Picture</h2>
          </div>
          <AvatarUpload
            avatarUrl={profile.avatar_url}
            fallbackText={profile.full_name || profile.username || "U"}
          />
        </div>

        {/* Profile Form */}
        <div className="p-6 bg-card rounded-lg border border-border shadow-sm mb-6">
          <div className="pb-3 mb-6 border-b border-border">
            <h2 className="text-lg font-semibold">Profile Information</h2>
          </div>
          <ProfileForm key={profile.updated_at || profile.id} profile={profile} />
        </div>

        {/* Verification Section */}
        <div className="p-6 bg-card rounded-lg border border-border shadow-sm mb-6">
          <div className="pb-3 mb-4 border-b border-border">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-blue-500" />
              Verification
            </h2>
          </div>
          {!!(profile as Record<string, unknown>).email_confirmed_at && (
            <div className="flex items-center gap-2 mb-3">
              <EmailVerifiedBadge size="default" showLabel />
              <span className="text-sm text-muted-foreground">
                — Email address confirmed
              </span>
            </div>
          )}
          {profile.verified ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <VerifiedBadge
                  verificationType={profile.verification_type}
                  size="default"
                  showLabel
                />
                <span className="text-sm text-muted-foreground">
                  — Your verified badge is visible on your profile
                </span>
              </div>
              <Link
                href="/settings/verification"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Details <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Get verified to build trust and stand out from the crowd.
              </p>
              <Link
                href="/settings/verification"
                className="text-sm text-primary hover:underline flex items-center gap-1 font-medium"
              >
                Get Verified <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>

        {/* Work History */}
        <WorkHistoryList key={profile.updated_at || profile.id} />
      </main>
    </div>
  );
}
