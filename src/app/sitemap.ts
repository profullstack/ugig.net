import type { MetadataRoute } from "next";
import { buildSitemapBlogEntries } from "@profullstack/autoblog/feeds";
import { createServiceClient } from "@/lib/supabase/service";

export const revalidate = 3600; // regenerate at most once per hour (ISR)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = getStaticPages();

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return staticPages;
  }

  try {
    // Run all queries in parallel to cut total latency
    const [
      { data: gigs },
      { data: skills },
      { data: users },
      { data: posts },
      { data: affiliateOffers },
      { data: blogPosts },
    ] = await Promise.all([
      supabase
        .from("gigs" as any)
        .select("id, updated_at")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1000),
      supabase
        .from("skill_listings" as any)
        .select("slug, updated_at")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1000),
      supabase
        .from("profiles" as any)
        .select("username, updated_at")
        .not("username", "is", null)
        // Spam-flagged profiles are noindexed (lib/seo/profile-metadata.ts);
        // listing them here also let ~460 of them crowd real profiles out of
        // the 2000-row cap.
        .eq("is_spam", false)
        .order("updated_at", { ascending: false })
        .limit(2000),
      supabase
        .from("posts" as any)
        .select("id, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1000),
      supabase
        .from("affiliate_offers" as any)
        .select("slug, updated_at")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1000),
      supabase
        .from("blog_posts" as any)
        .select("slug, published_at")
        .order("published_at", { ascending: false })
        .limit(500),
    ]);

    const safeDate = (v: string | null | undefined) =>
      v ? new Date(v) : new Date();

    const gigPages: MetadataRoute.Sitemap = (gigs || []).map((gig: any) => ({
      url: `${BASE_URL}/gigs/${gig.id}`,
      lastModified: safeDate(gig.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const skillPages: MetadataRoute.Sitemap = (skills || []).map((skill: any) => ({
      url: `${BASE_URL}/skills/${skill.slug}`,
      lastModified: safeDate(skill.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const userPages: MetadataRoute.Sitemap = (users || []).map((user: any) => ({
      url: `${BASE_URL}/u/${user.username}`,
      lastModified: safeDate(user.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    const postPages: MetadataRoute.Sitemap = (posts || []).map((post: any) => ({
      url: `${BASE_URL}/post/${post.id}`,
      lastModified: safeDate(post.updated_at),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));

    const affiliatePages: MetadataRoute.Sitemap = (affiliateOffers || []).map((offer: any) => ({
      url: `${BASE_URL}/affiliates/${offer.slug}`,
      lastModified: safeDate(offer.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    const blogPages = buildSitemapBlogEntries({
      posts: ((blogPosts as unknown) as Array<{ slug: string; published_at: string }> | null ?? []).map((p) => ({
        slug: p.slug,
        title: p.slug,
        publishedAt: p.published_at,
      })),
      baseUrl: BASE_URL,
    });

    return [
      ...staticPages,
      ...gigPages,
      ...skillPages,
      ...userPages,
      ...postPages,
      ...affiliatePages,
      ...blogPages,
    ];
  } catch {
    // Fall back to static pages if any DB query fails
    return staticPages;
  }
}

function getStaticPages(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/gigs`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/skills`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/for-hire`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/candidates`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/agents`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/affiliates`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/feed`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${BASE_URL}/blog`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/tags`, changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE_URL}/leaderboard`, changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE_URL}/leaderboard/zaps`, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE_URL}/skills/library`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/search`, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/docs`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/docs/cli`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/for-employers`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/for-candidates`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/login`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${BASE_URL}/signup`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
