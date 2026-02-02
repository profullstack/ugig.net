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

  // Handle "following" sort — requires auth
  if (sort === "following") {
    if (!user) {
      return (
        <div className="space-y-6">
          <Suspense fallback={null}>
            <FeedSortTabs currentSort={sort} currentTag={tag} />
          </Suspense>
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium">Log in to see your personalized feed</p>
            <p className="text-sm mt-1">Follow tags you&apos;re interested in, then come back here.</p>
          </div>
        </div>
      );
    }

    // Fetch user's followed tags
    const { data: tagFollows } = await supabase
      .from("tag_follows")
      .select("tag")
      .eq("user_id", user.id);

    const followedTags = (tagFollows || []).map((t: { tag: string }) => t.tag);

    if (followedTags.length === 0) {
      return (
        <div className="space-y-6">
          <CreatePostForm />
          <Suspense fallback={null}>
            <FeedSortTabs currentSort={sort} currentTag={tag} />
          </Suspense>
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium">No followed tags yet</p>
            <p className="text-sm mt-1">Follow some tags to see personalized content here. Look for the + icon next to tag badges.</p>
          </div>
        </div>
      );
    }

    // Fetch posts with overlapping tags
    let followQuery = supabase
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
      )
      .overlaps("tags", followedTags);

    if (tag) {
      followQuery = followQuery.contains("tags", [tag]);
    }

    followQuery = followQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: followPosts, count: followCount } = await followQuery;

    // Fetch user votes
    let userVotes: Record<string, number> = {};
    if (followPosts && followPosts.length > 0) {
      const postIds = followPosts.map((p) => p.id);
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

    const postsWithVotes = (followPosts || []).map((post) => ({
      ...post,
      user_vote: userVotes[post.id] || null,
    }));

    const totalPages = Math.ceil((followCount || 0) / limit);

    return (
      <div className="space-y-6">
        <CreatePostForm />

        <Suspense fallback={null}>
          <FeedSortTabs currentSort={sort} currentTag={tag} />
        </Suspense>

        <Suspense fallback={<FeedSkeleton />}>
          <FeedList
            initialPosts={postsWithVotes}
            showFollowButtons
            followedTags={followedTags}
            initialPagination={{
              page,
              limit,
              total: followCount || 0,
              totalPages,
            }}
          />
        </Suspense>
      </div>
    );
  }

  // Standard feed query
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

  // Fetch user votes and followed tags
  let userVotes: Record<string, number> = {};
  let followedTagsList: string[] | undefined;
  if (user) {
    if (sortedPosts.length > 0) {
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

    // Fetch followed tags for the follow buttons
    const { data: tagFollows } = await supabase
      .from("tag_follows")
      .select("tag")
      .eq("user_id", user.id);

    if (tagFollows && tagFollows.length > 0) {
      followedTagsList = tagFollows.map((t: { tag: string }) => t.tag);
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
          showFollowButtons={!!user}
          followedTags={followedTagsList}
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
