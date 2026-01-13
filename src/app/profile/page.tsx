import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { WorkHistoryList } from "@/components/profile/WorkHistoryList";
import { ResumeImport } from "@/components/profile/ResumeImport";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { Header } from "@/components/layout/Header";

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
        <div className="mb-8">
          <ResumeImport />
        </div>

        {/* Avatar Section */}
        <div className="mb-8 p-6 bg-card rounded-lg border border-border">
          <h2 className="text-lg font-semibold mb-4">Profile Picture</h2>
          <AvatarUpload
            avatarUrl={profile.avatar_url}
            fallbackText={profile.full_name || profile.username || "U"}
          />
        </div>

        {/* Profile Form */}
        <div className="p-6 bg-card rounded-lg border border-border mb-8">
          <ProfileForm key={profile.updated_at || profile.id} profile={profile} />
        </div>

        {/* Work History */}
        <WorkHistoryList />
      </main>
    </div>
  );
}
