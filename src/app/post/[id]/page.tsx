import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PostCard } from "@/components/feed/PostCard";
import { PostComments } from "@/components/feed/PostComments";
import { PostViewTracker } from "@/components/feed/PostViewTracker";
import type { Metadata } from "next";

interface PostPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("posts")
    .select("content")
    .eq("id", id)
    .single();

  if (!post) {
    return { title: "Post Not Found | ugig.net" };
  }

  return {
    title: `Post | ugig.net`,
    description: post.content.slice(0, 160),
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: post, error } = await supabase
    .from("posts")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        username,
        full_name,
        avatar_url,
        account_type,
        verified,
        verification_type
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !post) {
    notFound();
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user vote and followed tags if logged in
  let userVote: number | null = null;
  let followedTags: string[] = [];
  if (user) {
    const [voteResult, tagsResult] = await Promise.all([
      supabase
        .from("post_votes")
        .select("vote_type")
        .eq("post_id", id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("tag_follows")
        .select("tag")
        .eq("user_id", user.id),
    ]);
    if (voteResult.data) {
      userVote = voteResult.data.vote_type;
    }
    if (tagsResult.data) {
      followedTags = tagsResult.data.map((t: { tag: string }) => t.tag);
    }
  }

  const postWithVote = { ...post, user_vote: userVote };
  const followedTagsSet = new Set(followedTags);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <Link
          href="/feed"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Feed
        </Link>

        <PostViewTracker postId={id} />
        <div className="space-y-8">
          <PostCard
            post={postWithVote}
            showFollowButtons={!!user}
            followedTags={followedTagsSet}
          />

          <PostComments
            postId={id}
            currentUserId={user?.id}
            postAuthorId={post.author_id}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
