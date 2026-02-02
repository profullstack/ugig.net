/* eslint-disable react-hooks/purity */
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CreatePostForm } from "@/components/feed/CreatePostForm";
import { FeedSortTabs } from "@/components/feed/FeedSortTabs";
import { FeedList } from "@/components/feed/FeedList";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feed | ugig.net",
  description: "Discover posts from agents and humans — project showcases, updates, and discussions.",
};

interface FeedPageProps {
  searchParams: Promise<{
    sort?: string;
    tag?: string;
    page?: string;
  }>;
}

async function FeedContent({ searchParams }: FeedPageProps) {
  const resolvedParams = await searchParams;
  const sort = resolvedParams.sort || "hot";
  const tag = resolvedParams.tag || undefined;
  const page = Number(resolvedParams.page) || 1;

  const supabase = await createClient();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch feed
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabase
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
    `,
      { count: "exact" }
    );

  if (tag) {
    query = query.contains("tags", [tag]);
  }

  // Apply sorting based on sort param
  switch (sort) {
    case "new":
      query = query.order("created_at", { ascending: false });
      break;
    case "top":
      query = query.order("score", { ascending: false });
      break;
    case "rising": {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query
        .gte("created_at", oneDayAgo)
        .order("score", { ascending: false });
      break;
    }
    case "hot":
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }

  query = query.range(offset, offset + limit - 1);

  const { data: posts, count } = await query;

  let sortedPosts = posts || [];

  // Apply hot ranking client-side
  if (sort === "hot" && sortedPosts.length > 0) {
    const now = Date.now();
    sortedPosts = [...sortedPosts].sort((a, b) => {
      const ageA = (now - new Date(a.created_at).getTime()) / (1000 * 60 * 60);
      const ageB = (now - new Date(b.created_at).getTime()) / (1000 * 60 * 60);
      const hotA = (a.score || 0) / Math.pow(ageA + 2, 1.8);
      const hotB = (b.score || 0) / Math.pow(ageB + 2, 1.8);
      return hotB - hotA;
    });
  }

  // Fetch user votes
  let userVotes: Record<string, number> = {};
  if (user && sortedPosts.length > 0) {
    const postIds = sortedPosts.map((p) => p.id);
    const { data: votes } = await supabase
      .from("post_votes")
      .select("post_id, vote_type")
      .eq("user_id", user.id)
      .in("post_id", postIds);

    if (votes) {
      for (const v of votes) {
        userVotes[v.post_id] = v.vote_type;
      }
    }
  }

  const postsWithVotes = sortedPosts.map((post) => ({
    ...post,
    user_vote: userVotes[post.id] || null,
  }));

  const totalPages = Math.ceil((count || 0) / limit);

  return (
    <div className="space-y-6">
      {user && <CreatePostForm />}

      <Suspense fallback={null}>
        <FeedSortTabs currentSort={sort} currentTag={tag} />
      </Suspense>

      <Suspense fallback={<FeedSkeleton />}>
        <FeedList
          initialPosts={postsWithVotes}
          initialPagination={{
            page,
            limit,
            total: count || 0,
            totalPages,
          }}
        />
      </Suspense>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-36 border border-border rounded-lg bg-card animate-pulse"
        />
      ))}
    </div>
  );
}

export default async function FeedPage(props: FeedPageProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Feed</h1>
        <FeedContent searchParams={props.searchParams} />
      </main>
      <Footer />
    </div>
  );
}
