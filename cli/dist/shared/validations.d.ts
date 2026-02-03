import { z } from "zod";
export declare const signupSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    username: z.ZodString;
    account_type: z.ZodDefault<z.ZodEnum<{
        human: "human";
        agent: "agent";
    }>>;
    agent_name: z.ZodOptional<z.ZodString>;
    agent_description: z.ZodOptional<z.ZodString>;
    agent_version: z.ZodOptional<z.ZodString>;
    agent_operator_url: z.ZodOptional<z.ZodString>;
    agent_source_url: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export declare const forgotPasswordSchema: z.ZodObject<{
    email: z.ZodString;
}, z.core.$strip>;
export declare const resetPasswordSchema: z.ZodObject<{
    password: z.ZodString;
}, z.core.$strip>;
export declare const walletAddressSchema: z.ZodObject<{
    currency: z.ZodString;
    address: z.ZodString;
    is_preferred: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const profileSchema: z.ZodObject<{
    username: z.ZodString;
    full_name: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    bio: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    skills: z.ZodDefault<z.ZodArray<z.ZodString>>;
    ai_tools: z.ZodDefault<z.ZodArray<z.ZodString>>;
    hourly_rate: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    portfolio_urls: z.ZodDefault<z.ZodArray<z.ZodString>>;
    location: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    timezone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    is_available: z.ZodDefault<z.ZodBoolean>;
    wallet_addresses: z.ZodDefault<z.ZodArray<z.ZodObject<{
        currency: z.ZodString;
        address: z.ZodString;
        is_preferred: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>>;
    rate_type: z.ZodNullable<z.ZodOptional<z.ZodEnum<{
        fixed: "fixed";
        hourly: "hourly";
        per_task: "per_task";
        per_unit: "per_unit";
        revenue_share: "revenue_share";
    }>>>;
    rate_amount: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    rate_unit: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    preferred_coin: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    agent_name: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    agent_description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    agent_version: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    agent_operator_url: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    agent_source_url: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const gigSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodString;
    category: z.ZodString;
    skills_required: z.ZodArray<z.ZodString>;
    ai_tools_preferred: z.ZodArray<z.ZodString>;
    budget_type: z.ZodEnum<{
        fixed: "fixed";
        hourly: "hourly";
        per_task: "per_task";
        per_unit: "per_unit";
        revenue_share: "revenue_share";
    }>;
    budget_min: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    budget_max: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    budget_unit: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    payment_coin: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    duration: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    location_type: z.ZodEnum<{
        remote: "remote";
        onsite: "onsite";
        hybrid: "hybrid";
    }>;
    location: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    status: z.ZodOptional<z.ZodEnum<{
        active: "active";
        paused: "paused";
        closed: "closed";
        filled: "filled";
        draft: "draft";
    }>>;
}, z.core.$strip>;
export declare const gigFiltersSchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
    budget_type: z.ZodOptional<z.ZodEnum<{
        fixed: "fixed";
        hourly: "hourly";
        per_task: "per_task";
        per_unit: "per_unit";
        revenue_share: "revenue_share";
    }>>;
    budget_min: z.ZodOptional<z.ZodNumber>;
    budget_max: z.ZodOptional<z.ZodNumber>;
    location_type: z.ZodOptional<z.ZodEnum<{
        remote: "remote";
        onsite: "onsite";
        hybrid: "hybrid";
    }>>;
    account_type: z.ZodOptional<z.ZodEnum<{
        human: "human";
        agent: "agent";
    }>>;
    sort: z.ZodDefault<z.ZodEnum<{
        newest: "newest";
        oldest: "oldest";
        budget_high: "budget_high";
        budget_low: "budget_low";
    }>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const applicationSchema: z.ZodObject<{
    gig_id: z.ZodString;
    cover_letter: z.ZodString;
    proposed_rate: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    proposed_timeline: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    portfolio_items: z.ZodDefault<z.ZodArray<z.ZodString>>;
    ai_tools_to_use: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const applicationStatusSchema: z.ZodObject<{
    status: z.ZodEnum<{
        accepted: "accepted";
        pending: "pending";
        reviewing: "reviewing";
        rejected: "rejected";
        withdrawn: "withdrawn";
        shortlisted: "shortlisted";
    }>;
}, z.core.$strip>;
export declare const workHistorySchema: z.ZodObject<{
    company: z.ZodString;
    position: z.ZodString;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    start_date: z.ZodString;
    end_date: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    is_current: z.ZodDefault<z.ZodBoolean>;
    location: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const portfolioItemSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    url: z.ZodUnion<[z.ZodNullable<z.ZodOptional<z.ZodString>>, z.ZodLiteral<"">]>;
    image_url: z.ZodUnion<[z.ZodNullable<z.ZodOptional<z.ZodString>>, z.ZodLiteral<"">]>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    gig_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const portfolioItemUpdateSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    url: z.ZodUnion<[z.ZodNullable<z.ZodOptional<z.ZodString>>, z.ZodLiteral<"">]>;
    image_url: z.ZodUnion<[z.ZodNullable<z.ZodOptional<z.ZodString>>, z.ZodLiteral<"">]>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    gig_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const gigCommentSchema: z.ZodObject<{
    content: z.ZodString;
    parent_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const gigCommentUpdateSchema: z.ZodObject<{
    content: z.ZodString;
}, z.core.$strip>;
export declare const postCommentSchema: z.ZodObject<{
    content: z.ZodString;
    parent_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const postCommentUpdateSchema: z.ZodObject<{
    content: z.ZodString;
}, z.core.$strip>;
export declare const messageSchema: z.ZodObject<{
    content: z.ZodString;
}, z.core.$strip>;
export declare const conversationCreateSchema: z.ZodObject<{
    gig_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    recipient_id: z.ZodString;
}, z.core.$strip>;
export declare const createApiKeySchema: z.ZodObject<{
    name: z.ZodString;
    expires_at: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const revokeApiKeySchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const postSchema: z.ZodObject<{
    content: z.ZodString;
    url: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    post_type: z.ZodDefault<z.ZodEnum<{
        link: "link";
        text: "text";
        showcase: "showcase";
    }>>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const postUpdateSchema: z.ZodObject<{
    content: z.ZodOptional<z.ZodString>;
    url: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const feedFiltersSchema: z.ZodObject<{
    sort: z.ZodDefault<z.ZodEnum<{
        top: "top";
        hot: "hot";
        new: "new";
        rising: "rising";
        following: "following";
    }>>;
    tag: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const endorseSchema: z.ZodObject<{
    skill: z.ZodString;
    comment: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
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
export type PostCommentInput = z.infer<typeof postCommentSchema>;
export type PostCommentUpdateInput = z.infer<typeof postCommentUpdateSchema>;
export type PostInput = z.infer<typeof postSchema>;
export type PostUpdateInput = z.infer<typeof postUpdateSchema>;
export type FeedFiltersInput = z.infer<typeof feedFiltersSchema>;
export type EndorseInput = z.infer<typeof endorseSchema>;
export type PortfolioItemInput = z.infer<typeof portfolioItemSchema>;
export type PortfolioItemUpdateInput = z.infer<typeof portfolioItemUpdateSchema>;
