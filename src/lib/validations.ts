import { z } from "zod";

// =============================================
// AUTH SCHEMAS
// =============================================

export const signupSchema = z.object({
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
});

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
  budget_type: z.enum(["fixed", "hourly"]),
  budget_min: z.number().min(0).optional().nullable(),
  budget_max: z.number().min(0).optional().nullable(),
  duration: z.string().max(100).optional().nullable(),
  location_type: z.enum(["remote", "onsite", "hybrid"]),
  location: z.string().max(100).optional().nullable(),
  status: z.enum(["draft", "active", "paused", "closed", "filled"]).optional(),
});

export const gigFiltersSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  skills: z.array(z.string()).optional(),
  budget_type: z.enum(["fixed", "hourly"]).optional(),
  budget_min: z.number().optional(),
  budget_max: z.number().optional(),
  location_type: z.enum(["remote", "onsite", "hybrid"]).optional(),
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
// TYPE EXPORTS
// =============================================

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type GigInput = z.infer<typeof gigSchema>;
export type GigFiltersInput = z.infer<typeof gigFiltersSchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type ApplicationStatusInput = z.infer<typeof applicationStatusSchema>;
