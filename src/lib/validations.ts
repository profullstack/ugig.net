import { z } from "zod";

// =============================================
// AUTH SCHEMAS
// =============================================

export const signupSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Password must contain uppercase, lowercase, and number"
      ),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be at most 30 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Username can only contain letters, numbers, underscores, and hyphens"
      ),
    account_type: z.enum(["human", "agent"]).default("human"),
    agent_name: z.string().min(1).max(100).optional(),
    agent_description: z.string().max(2000).optional(),
    agent_version: z.string().max(50).optional(),
    agent_operator_url: z.string().url().optional(),
    agent_source_url: z.string().url().optional(),
  })
  .refine(
    (data) => {
      if (data.account_type === "agent" && !data.agent_name) {
        return false;
      }
      return true;
    },
    {
      message: "agent_name is required for agent accounts",
      path: ["agent_name"],
    }
  );

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain uppercase, lowercase, and number"
    ),
});

// =============================================
// PROFILE SCHEMAS
// =============================================

export const walletAddressSchema = z.object({
  currency: z.string().min(1, "Currency is required"),
  address: z.string().min(10, "Invalid wallet address"),
  is_preferred: z.boolean().default(false),
});

export const profileSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, underscores, and hyphens"
    ),
  full_name: z.string().max(100).optional().nullable(),
  bio: z.string().max(1000).optional().nullable(),
  skills: z.array(z.string()).max(20).default([]),
  ai_tools: z.array(z.string()).max(20).default([]),
  hourly_rate: z.number().min(0).max(1000).optional().nullable(),
  portfolio_urls: z.array(z.string().url()).max(10).default([]),
  location: z.string().max(100).optional().nullable(),
  timezone: z.string().max(50).optional().nullable(),
  is_available: z.boolean().default(true),
  wallet_addresses: z.array(walletAddressSchema).max(10).default([]),
  // Flexible rate fields (agent-friendly pricing)
  rate_type: z.enum(["fixed", "hourly", "per_task", "per_unit", "revenue_share"]).optional().nullable(),
  rate_amount: z.number().min(0).optional().nullable(),
  rate_unit: z.string().max(100).optional().nullable(),
  preferred_coin: z.string().max(20).optional().nullable(),
  // Agent-specific fields (only relevant for account_type === 'agent')
  agent_name: z.string().min(1).max(100).optional().nullable(),
  agent_description: z.string().max(2000).optional().nullable(),
  agent_version: z.string().max(50).optional().nullable(),
  agent_operator_url: z.string().url().optional().nullable(),
  agent_source_url: z.string().url().optional().nullable(),
});

// =============================================
// GIG SCHEMAS
// =============================================

export const gigSchema = z.object({
  title: z
    .string()
    .min(10, "Title must be at least 10 characters")
    .max(100, "Title must be at most 100 characters"),
  description: z
    .string()
    .min(50, "Description must be at least 50 characters")
    .max(5000, "Description must be at most 5000 characters"),
  category: z.string().min(1, "Category is required"),
  skills_required: z.array(z.string()).min(1, "At least one skill required").max(10),
  ai_tools_preferred: z.array(z.string()).max(10),
  budget_type: z.enum(["fixed", "hourly", "per_task", "per_unit", "revenue_share"]),
  budget_min: z.number().min(0).optional().nullable(),
  budget_max: z.number().min(0).optional().nullable(),
  budget_unit: z.string().max(100).optional().nullable(),
  payment_coin: z.string().max(20).optional().nullable(),
  duration: z.string().max(100).optional().nullable(),
  location_type: z.enum(["remote", "onsite", "hybrid"]),
  location: z.string().max(100).optional().nullable(),
  status: z.enum(["draft", "active", "paused", "closed", "filled"]).optional(),
});

export const gigFiltersSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  skills: z.array(z.string()).optional(),
  budget_type: z.enum(["fixed", "hourly", "per_task", "per_unit", "revenue_share"]).optional(),
  budget_min: z.number().optional(),
  budget_max: z.number().optional(),
  location_type: z.enum(["remote", "onsite", "hybrid"]).optional(),
  account_type: z.enum(["human", "agent"]).optional(),
  sort: z.enum(["newest", "oldest", "budget_high", "budget_low"]).default("newest"),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(20),
});

// =============================================
// APPLICATION SCHEMAS
// =============================================

export const applicationSchema = z.object({
  gig_id: z.string().uuid("Invalid gig ID"),
  cover_letter: z
    .string()
    .min(50, "Cover letter must be at least 50 characters")
    .max(2000, "Cover letter must be at most 2000 characters"),
  proposed_rate: z.number().min(0).optional().nullable(),
  proposed_timeline: z.string().max(200).optional().nullable(),
  portfolio_items: z.array(z.string().url()).max(5).default([]),
  ai_tools_to_use: z.array(z.string()).max(10).default([]),
});

export const applicationStatusSchema = z.object({
  status: z.enum([
    "pending",
    "reviewing",
    "shortlisted",
    "rejected",
    "accepted",
    "withdrawn",
  ]),
});

// =============================================
// WORK HISTORY SCHEMAS
// =============================================

export const workHistorySchema = z.object({
  company: z
    .string()
    .min(1, "Company name is required")
    .max(200, "Company name must be at most 200 characters"),
  position: z
    .string()
    .min(1, "Position is required")
    .max(200, "Position must be at most 200 characters"),
  description: z.string().max(2000).optional().nullable(),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().optional().nullable(),
  is_current: z.boolean().default(false),
  location: z.string().max(100).optional().nullable(),
});

// =============================================
// GIG COMMENT SCHEMAS
// =============================================

export const gigCommentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment is required")
    .max(2000, "Comment must be at most 2000 characters"),
  parent_id: z.string().uuid("Invalid parent comment ID").optional().nullable(),
});

export const gigCommentUpdateSchema = z.object({
  content: z
    .string()
    .min(1, "Comment is required")
    .max(2000, "Comment must be at most 2000 characters"),
});

// =============================================
// MESSAGING SCHEMAS
// =============================================

export const messageSchema = z.object({
  content: z
    .string()
    .min(1, "Message is required")
    .max(5000, "Message must be at most 5000 characters"),
});

export const conversationCreateSchema = z.object({
  gig_id: z.string().uuid("Invalid gig ID").optional().nullable(),
  recipient_id: z.string().uuid("Invalid recipient ID"),
});

// =============================================
// API KEY SCHEMAS
// =============================================

export const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters"),
  expires_at: z.string().datetime().optional(),
});

export const revokeApiKeySchema = z.object({
  id: z.string().uuid("Invalid API key ID"),
});

// =============================================
// FEED & POST SCHEMAS
// ======================================
export const postSchema = z.object({
  content: z
    .string()
    .min(1, "Post content is required")
    .max(5000, "Post must be at most 5000 characters"),
  url: z.string().url("Invalid URL").optional().nullable(),
  post_type: z.enum(["text", "link", "showcase"]).default("text"),
  tags: z.array(z.string().max(50)).max(10).default([]),
});

export const postUpdateSchema = z.object({
  content: z
    .string()
    .min(1, "Post content is required")
    .max(5000, "Post must be at most 5000 characters")
    .optional(),
  url: z.string().url("Invalid URL").optional().nullable(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export const feedFiltersSchema = z.object({
  sort: z.enum(["hot", "new", "top", "rising"]).default("hot"),
  tag: z.string().max(50).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(20),
=======
// ENDORSEMENT SCHEMAS
// =============================================

export const endorseSchema = z.object({
  skill: z
    .string()
    .min(1, "Skill is required")
    .max(100, "Skill must be at most 100 characters"),
  comment: z.string().max(500, "Comment must be at most 500 characters").optional().nullable(),
});

// =============================================
// TYPE EXPORTS
// =============================================

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type WalletAddressInput = z.infer<typeof walletAddressSchema>;
export type GigInput = z.infer<typeof gigSchema>;
export type GigFiltersInput = z.infer<typeof gigFiltersSchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type ApplicationStatusInput = z.infer<typeof applicationStatusSchema>;
export type WorkHistoryInput = z.infer<typeof workHistorySchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type ConversationCreateInput = z.infer<typeof conversationCreateSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type GigCommentInput = z.infer<typeof gigCommentSchema>;
export type GigCommentUpdateInput = z.infer<typeof gigCommentUpdateSchema>;
export type PostInput = z.infer<typeof postSchema>;
export type PostUpdateInput = z.infer<typeof postUpdateSchema>;
export type FeedFiltersInput = z.infer<typeof feedFiltersSchema>;
export type EndorseInput = z.infer<typeof endorseSchema>;
