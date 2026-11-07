import { generateObject, generateText } from "@profullstack/ai-providers";

/**
 * Text generation for the app. @profullstack/ai-providers tries c0mpute first
 * and falls back to OPENAI_API_KEY / ANTHROPIC_API_KEY when they are set, so no
 * caller should gate on a vendor key. Callers keep their own non-AI fallback
 * for when every provider fails: these helpers throw.
 *
 * Measured 2026-11-07: a short answer from the 9B peer model takes about 45 s.
 */
export const AI_LISTING_TIMEOUT_MS = 90_000;

interface ListingTagsInput {
  title: string;
  description: string;
  url: string;
}

interface ListingDescriptionInput {
  title: string;
  existingDescription: string;
  pageText: string;
  url: string;
}

function readTags(value: unknown): string[] {
  // Models answer with either { tags: [...] } or a bare array.
  const tags = Array.isArray(value) ? value : (value as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(tags)) throw new Error("no tags array in the answer");
  return tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

export async function generateListingTags({
  title,
  description,
  url,
}: ListingTagsInput): Promise<string[]> {
  const { object } = await generateObject<string[]>({
    user: `Given this website, generate 5-8 relevant tags/topics. Return only a JSON object like {"tags": ["tag1", "tag2"]}. Lowercase only. No explanation.

Title: ${title}
Description: ${description}
URL: ${url}`,
    schema: readTags,
    name: "ListingTags",
    maxTokens: 200,
    repairs: 0,
    feature: "directory.tags",
    timeoutMs: AI_LISTING_TIMEOUT_MS,
  });
  return object;
}

export async function generateListingDescription({
  title,
  existingDescription,
  pageText,
  url,
}: ListingDescriptionInput): Promise<string> {
  const { text } = await generateText({
    user: `Write a concise 1-2 sentence description for this project/website listing in a directory. Be specific about what it does. No marketing fluff. Max 200 characters.

Title: ${title}
URL: ${url}
${existingDescription ? `Existing description: ${existingDescription}` : ""}
Page content: ${pageText.substring(0, 2000)}`,
    maxTokens: 150,
    temperature: 0.3,
    feature: "directory.description",
    timeoutMs: AI_LISTING_TIMEOUT_MS,
  });
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
