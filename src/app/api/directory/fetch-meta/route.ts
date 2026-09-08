import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import OpenAI from "openai";
import crypto from "crypto";


/**
 * POST /api/directory/fetch-meta
 *
 * Fetches title, description, logo (og:image/favicon), banner (og:image/twitter:image),
 * homepage screenshot, and keywords/tags from a given URL.
 */
export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url } = body;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ugig-bot/1.0; +https://ugig.net)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Site returned ${res.status}` },
        { status: 422 }
      );
    }

    const html = (await res.text()).substring(0, 200000); // limit to 200KB

    // Extract meta tags
    const title =
      extractMeta(html, 'property="og:title"') ||
      extractMeta(html, 'name="title"') ||
      extractTitle(html) ||
      "";

    const description =
      extractMeta(html, 'property="og:description"') ||
      extractMeta(html, 'name="description"') ||
      "";

    const ogImage = extractMeta(html, 'property="og:image"') || "";

    const twitterImage =
      extractMeta(html, 'name="twitter:image"') ||
      extractMeta(html, 'name="twitter:image:src"') ||
      "";

    const keywords = extractMeta(html, 'name="keywords"') || "";

    // --- Logo detection ---
    const logoCandidates = [
      `${parsedUrl.origin}/logo.svg`,
      `${parsedUrl.origin}/logo.png`,
      `${parsedUrl.origin}/favicon.svg`,
      `${parsedUrl.origin}/favicon.png`,
    ];

    let logo_url = "";
    for (const candidate of logoCandidates) {
      try {
        const logoRes = await fetch(candidate, {
          method: "HEAD",
          signal: AbortSignal.timeout(3000),
          redirect: "follow",
        });
        if (logoRes.ok) {
          logo_url = candidate;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!logo_url) {
      const faviconHref = extractFavicon(html);
      if (faviconHref) {
        try {
          logo_url = new URL(faviconHref, url).href;
        } catch {
          logo_url = faviconHref;
        }
      }
    }

    if (!logo_url && ogImage) {
      try {
        logo_url = new URL(ogImage, url).href;
      } catch {
        logo_url = ogImage;
      }
    }

    if (!logo_url) {
      logo_url = `${parsedUrl.origin}/favicon.ico`;
    }

    // --- Banner detection ---
    // Priority: og:image > twitter:image > fallback banner files
    let banner_url = "";

    // Use og:image as banner if it exists
    if (ogImage) {
      try {
        banner_url = new URL(ogImage, url).href;
      } catch {
        banner_url = ogImage;
      }
    }

    // Fallback to twitter:image
    if (!banner_url && twitterImage) {
      try {
        banner_url = new URL(twitterImage, url).href;
      } catch {
        banner_url = twitterImage;
      }
    }

    // Fallback: try common banner file paths
    if (!banner_url) {
      const bannerCandidates = [
        `${parsedUrl.origin}/banner.png`,
        `${parsedUrl.origin}/banner.jpg`,
        `${parsedUrl.origin}/banner.svg`,
      ];
      for (const candidate of bannerCandidates) {
        try {
          const bannerRes = await fetch(candidate, {
            method: "HEAD",
            signal: AbortSignal.timeout(3000),
            redirect: "follow",
          });
          if (bannerRes.ok) {
            banner_url = candidate;
            break;
          }
        } catch {
          // try next
        }
      }
    }

    // --- Homepage screenshot via Microlink ---
    let screenshot_url = "";
    try {
      screenshot_url = await captureScreenshot(url);
    } catch {
      // Screenshot is optional — don't fail the whole request
    }

    // Parse tags from keywords
    let tags: string[] = keywords
      ? keywords
          .split(",")
          .map((t: string) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 10)
      : [];

    // Extract visible text for AI context
    const pageText = extractVisibleText(html).substring(0, 3000);

    // If description is missing or too short, generate with AI
    let finalDescription = description;
    if (!finalDescription || finalDescription.length < 50) {
      finalDescription = await generateDescriptionWithAI(title, finalDescription, pageText, url);
    }

    // If we got fewer than 3 tags from meta keywords, use AI to generate them
    if (tags.length < 3) {
      const aiTags = await generateTagsWithAI(title, finalDescription, url);
      const merged = [...new Set([...tags, ...aiTags])].slice(0, 10);
      tags = merged;
    }

    return NextResponse.json({
      title: title.substring(0, 100),
      description: finalDescription.substring(0, 500),
      logo_url,
      banner_url,
      screenshot_url,
      tags,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/**
 * Capture a homepage screenshot via Microlink API and upload to Supabase storage.
 */
async function captureScreenshot(url: string): Promise<string> {
  const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(microlinkUrl, {
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return "";

    // The embed=screenshot.url mode redirects to the image directly
    const contentType = res.headers.get("content-type") || "";

    let imageBuffer: Buffer;

    if (contentType.startsWith("image/")) {
      // Direct image response (embed mode)
      imageBuffer = Buffer.from(await res.arrayBuffer());
    } else {
      // JSON response — extract screenshot URL and fetch the image
      const data = await res.json();
      const screenshotUrl =
        data?.data?.screenshot?.url || data?.screenshot?.url;
      if (!screenshotUrl) return "";

      const imgRes = await fetch(screenshotUrl, {
        signal: AbortSignal.timeout(10000),
      });
      if (!imgRes.ok) return "";
      imageBuffer = Buffer.from(await imgRes.arrayBuffer());
    }

    if (imageBuffer.length === 0) return "";

    // Upload to Supabase storage
    const urlHash = crypto.createHash("md5").update(url).digest("hex");
    const filePath = `${urlHash}/${Date.now()}.png`;

    // The memoised service client, not a fresh createClient(): see
    // lib/auth/api-key.ts for why a per-request client leaks.
    const sb = createServiceClient();
    const { error } = await sb.storage
      .from("directory-screenshots")
      .upload(filePath, imageBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (error) return "";

    const {
      data: { publicUrl },
    } = sb.storage.from("directory-screenshots").getPublicUrl(filePath);

    return publicUrl;
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function extractMeta(html: string, attr: string): string {
  const regex = new RegExp(
    `<meta[^>]*${attr.replace(/"/g, '["\']')}[^>]*content=["']([^"']*)["'][^>]*/?>`,
    "i"
  );
  const match = html.match(regex);
  if (match) return decodeEntities(match[1]);

  const regex2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*${attr.replace(/"/g, '["\']')}[^>]*/?>`,
    "i"
  );
  const match2 = html.match(regex2);
  if (match2) return decodeEntities(match2[1]);

  return "";
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : "";
}

function extractFavicon(html: string): string {
  const match = html.match(
    /<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']*)["'][^>]*\/?>/i
  );
  if (match) return match[1];

  const match2 = html.match(
    /<link[^>]*href=["']([^"']*)["'][^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*\/?>/i
  );
  return match2 ? match2[1] : "";
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

/**
 * Generate tags for a website using OpenAI based on title, description, and URL.
 * Falls back to extracting words from the title if AI fails.
 */
async function generateTagsWithAI(
  title: string,
  description: string,
  url: string
): Promise<string[]> {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `Given this website, generate 5-8 relevant tags/topics. Return only a JSON array of lowercase tag strings. No explanation.

Title: ${title}
Description: ${description}
URL: ${url}`;

    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 200,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI timeout")), 5000)
      ),
    ]);

    const content = response.choices[0]?.message?.content;
    if (!content) return fallbackTags(title);

    const parsed = JSON.parse(content);
    // Handle both { tags: [...] } and raw array shapes
    const arr = Array.isArray(parsed) ? parsed : parsed.tags;
    if (!Array.isArray(arr)) return fallbackTags(title);

    return arr
      .filter((t: unknown) => typeof t === "string")
      .map((t: string) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);
  } catch {
    return fallbackTags(title);
  }
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "is", "it", "its", "be", "as", "was", "are",
  "from", "has", "have", "this", "that", "your", "you", "we", "our",
]);

function fallbackTags(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[\s\-—|:,./]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 5);
}

/**
 * Strip HTML tags, scripts, styles and extract visible text content.
 */
function extractVisibleText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generate a concise project description using AI based on page content.
 */
async function generateDescriptionWithAI(
  title: string,
  existingDesc: string,
  pageText: string,
  url: string
): Promise<string> {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `Write a concise 1-2 sentence description for this project/website listing in a directory. Be specific about what it does. No marketing fluff. Max 200 characters.

Title: ${title}
URL: ${url}
${existingDesc ? `Existing description: ${existingDesc}` : ""}
Page content: ${pageText.substring(0, 2000)}`;

    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.3,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI timeout")), 5000)
      ),
    ]);

    const content = response.choices[0]?.message?.content?.trim();
    if (content && content.length > 20) return content;
    return existingDesc || `${title} — visit ${new URL(url).hostname} to learn more.`;
  } catch {
    return existingDesc || `${title} — visit ${new URL(url).hostname} to learn more.`;
  }
}
