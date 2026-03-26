import { z } from "zod";
import { SKILL_CATEGORIES } from "@/lib/constants";

/**
 * Generate a URL-friendly slug from a title.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export const skillListingSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(120, "Title must be under 120 characters"),
  tagline: z
    .string()
    .max(200, "Tagline must be under 200 characters")
    .optional()
    .or(z.literal("")),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(10000),
  price_sats: z
    .number()
    .int()
    .min(0, "Price cannot be negative"),
  category: z.enum(SKILL_CATEGORIES as unknown as [string, ...string[]]).optional(),
  tags: z
    .array(z.string().max(30))
    .max(10, "Maximum 10 tags")
    .optional()
    .default([]),
  status: z.enum(["draft", "active"]).optional().default("draft"),
  source_url: z.string().url().optional().or(z.literal("")),
  skill_file_url: z.string().url("Skill file URL is required"),
  website_url: z.string().url().optional().or(z.literal("")),
  clawhub_url: z.string().url().optional().or(z.literal("")),
});

export type SkillListingInput = z.infer<typeof skillListingSchema>;

export const skillReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().or(z.literal("")),
});

export type SkillReviewInput = z.infer<typeof skillReviewSchema>;
