import { z } from "zod";
import { MCP_CATEGORIES, MCP_TRANSPORT_TYPES } from "@/lib/constants";

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

export const mcpListingSchema = z.object({
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
  category: z.enum(MCP_CATEGORIES as unknown as [string, ...string[]]).optional(),
  tags: z
    .array(z.string().max(30))
    .max(10, "Maximum 10 tags")
    .optional()
    .default([]),
  status: z.enum(["draft", "active"]).optional().default("draft"),
  mcp_server_url: z.string().url("MCP server URL must be a valid URL").optional().or(z.literal("")),
  source_url: z.string().url().optional().or(z.literal("")),
  transport_type: z.enum(MCP_TRANSPORT_TYPES as unknown as [string, ...string[]]).optional(),
  supported_tools: z
    .array(z.string().max(100))
    .max(50, "Maximum 50 tools")
    .optional()
    .default([]),
});

export type McpListingInput = z.infer<typeof mcpListingSchema>;

export const mcpReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().or(z.literal("")),
});

export type McpReviewInput = z.infer<typeof mcpReviewSchema>;
