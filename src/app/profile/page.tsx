import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { WorkHistoryList } from "@/components/profile/WorkHistoryList";
import { ResumeImport } from "@/components/profile/ResumeImport";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft } from "lucide-react";

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
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-primary">
            ugig.net
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </nav>
        </div>
      </header>

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
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              {profile.avatar_url ? (
                <AvatarImage src={profile.avatar_url} alt={profile.full_name || profile.username} />
              ) : (
                <AvatarFallback className="text-2xl">
                  {(profile.full_name || profile.username || "U").charAt(0).toUpperCase()}
                </AvatarFallback>
              )}
            </Avatar>
            <div>
              <form action="/api/profile/avatar" method="POST" encType="multipart/form-data">
                <input
                  type="file"
                  name="avatar"
                  accept="image/*"
                  className="block w-full text-sm text-muted-foreground
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-medium
                    file:bg-primary file:text-primary-foreground
                    hover:file:bg-primary/90
                    file:cursor-pointer cursor-pointer"
                />
              </form>
              <p className="text-xs text-muted-foreground mt-2">
                JPG, PNG or GIF. Max 2MB.
              </p>
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <div className="p-6 bg-card rounded-lg border border-border mb-8">
          <ProfileForm profile={profile} />
        </div>

        {/* Work History */}
        <WorkHistoryList />
      </main>
    </div>
  );
}
