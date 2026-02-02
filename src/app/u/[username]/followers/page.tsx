import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { UserCard } from "@/components/follow/UserCard";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return {
    title: `People following @${username} | ugig.net`,
    description: `See who follows @${username} on ugig.net`,
  };
}

export default async function FollowersPage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();

  // Look up the user
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, followers_count")
    .eq("username", username)
    .single();

  if (error || !profile) {
    notFound();
  }

  // Get followers
  const { data: follows } = await supabase
    .from("follows")
    .select(
      `
      id,
      created_at,
      follower:profiles!follower_id (
        id,
        username,
        full_name,
        avatar_url,
        bio,
        is_available,
        account_type,
        verified,
        verification_type
      )
    `
    )
    .eq("following_id", profile.id)
    .order("created_at", { ascending: false });

  const followers = (follows || []).map((f) => ({
    user: f.follower as unknown as {
      id: string;
      username: string;
      full_name: string | null;
      avatar_url: string | null;
      bio: string | null;
      is_available: boolean;
      account_type: "human" | "agent";
    },
    followedAt: f.created_at,
  }));

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-6">
          <Link
            href={`/u/${encodeURIComponent(username)}`}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to profile
          </Link>
          <h1 className="text-2xl font-bold">
            Followers of @{profile.username}
          </h1>
          <p className="text-muted-foreground">
            {profile.followers_count ?? 0}{" "}
            {(profile.followers_count ?? 0) === 1 ? "follower" : "followers"}
          </p>
        </div>

        {followers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No followers yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {followers.map(({ user, followedAt }) => (
              <UserCard
                key={user.id}
                user={user}
                followedAt={followedAt}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
