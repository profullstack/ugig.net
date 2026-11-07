import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateListingTags } from "@/lib/ai";

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "is", "it", "its", "be", "as", "was", "are",
  "from", "has", "have", "this", "that", "your", "you", "we", "our",
]);

/**
 * POST /api/directory/backfill-tags
 *
 * Backfill AI-generated tags for listings that have empty or null tags.
 * Admin only — requires ADMIN_SECRET header.
 */
export async function POST(request: NextRequest) {
  const adminSecret = request.headers.get("x-admin-secret");
  if (!adminSecret || adminSecret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch listings with empty or null tags
  const { data: listings, error } = await supabase
    .from("project_listings" as any)
    .select("id, title, description, url, tags")
    .eq("status", "active")
    .or("tags.is.null,tags.eq.{}");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!listings || listings.length === 0) {
    return NextResponse.json({ updated: 0, message: "No listings need tags" });
  }

  let updated = 0;
  const errors: string[] = [];

  // Process in batches of 10
  for (let i = 0; i < listings.length; i += 10) {
    const batch = (listings as any[]).slice(i, i + 10);

    const results = await Promise.allSettled(
      batch.map(async (listing: any) => {
        const tags = await generateTagsForListing(
          listing.title,
          listing.description || "",
          listing.url
        );

        if (tags.length === 0) return;

        const { error: updateError } = await supabase
          .from("project_listings" as any)
          .update({ tags } as any)
          .eq("id", listing.id);

        if (updateError) {
          throw new Error(`${listing.id}: ${updateError.message}`);
        }
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        updated++;
      } else {
        errors.push(r.reason?.message || "Unknown error");
      }
    }

    // Small delay between batches to avoid rate limits
    if (i + 10 < listings.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return NextResponse.json({
    total: listings.length,
    updated,
    errors: errors.length > 0 ? errors : undefined,
  });
}

async function generateTagsForListing(
  title: string,
  description: string,
  url: string
): Promise<string[]> {
  try {
    return await generateListingTags({ title, description, url });
  } catch {
    return fallbackTags(title);
  }
}

function fallbackTags(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[\s\-—|:,./]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 5);
}
