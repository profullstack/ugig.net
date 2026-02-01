import type { Tables } from "./database.js";
export type { Database, Tables, TablesInsert, TablesUpdate, Enums } from "./database.js";
export type Profile = Tables<"profiles">;
export type Gig = Tables<"gigs">;
export type Application = Tables<"applications">;
export type Conversation = Tables<"conversations">;
export type Message = Tables<"messages">;
export type Subscription = Tables<"subscriptions">;
export type GigUsage = Tables<"gig_usage">;
export type Review = Tables<"reviews">;
export type Notification = Tables<"notifications">;
export type VideoCall = Tables<"video_calls">;
export type WorkHistory = Tables<"work_history">;
export type ApiKey = Tables<"api_keys">;
export type AgentProfile = Profile & {
    account_type: "agent";
    agent_name: string;
    agent_description: string | null;
    agent_version: string | null;
    agent_operator_url: string | null;
    agent_source_url: string | null;
};
export type GigWithPoster = Gig & {
    poster: Profile;
};
export type ApplicationWithDetails = Application & {
    gig: Gig;
    applicant: Profile;
};
export type ConversationWithParticipants = Conversation & {
    participants: Profile[];
    gig?: Gig | null;
};
export type MessageWithSender = Message & {
    sender: Profile;
};
export type ConversationWithPreview = Conversation & {
    participants: Profile[];
    gig?: Pick<Gig, "id" | "title"> | null;
    last_message?: Pick<Message, "content" | "sender_id" | "created_at"> | null;
    unread_count: number;
};
export type ReviewWithUsers = Review & {
    reviewer: Profile;
    reviewee: Profile;
};
export type VideoCallWithParticipants = VideoCall & {
    initiator: Profile;
    participants: Profile[];
    gig?: Pick<Gig, "id" | "title"> | null;
};
export type ActionResult<T = void> = {
    success: boolean;
    data?: T;
    error?: string;
};
export type PaginatedResult<T> = {
    data: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
};
export type GigFormData = {
    title: string;
    description: string;
    category: string;
    skills_required: string[];
    ai_tools_preferred: string[];
    budget_type: "fixed" | "hourly";
    budget_min?: number;
    budget_max?: number;
    duration?: string;
    location_type: "remote" | "onsite" | "hybrid";
    location?: string;
};
export type ApplicationFormData = {
    cover_letter: string;
    proposed_rate?: number;
    proposed_timeline?: string;
    portfolio_items: string[];
    ai_tools_to_use: string[];
};
export type ProfileFormData = {
    username: string;
    full_name?: string;
    bio?: string;
    skills: string[];
    ai_tools: string[];
    hourly_rate?: number;
    portfolio_urls: string[];
    location?: string;
    timezone?: string;
    is_available: boolean;
    website?: string;
    linkedin_url?: string;
    github_url?: string;
    twitter_url?: string;
};
export type WorkHistoryFormData = {
    company: string;
    position: string;
    description?: string;
    start_date: string;
    end_date?: string;
    is_current: boolean;
    location?: string;
};
export type GigFilters = {
    search?: string;
    category?: string;
    skills?: string[];
    ai_tools?: string[];
    budget_min?: number;
    budget_max?: number;
    budget_type?: "fixed" | "hourly";
    location_type?: "remote" | "onsite" | "hybrid";
    posted_within?: "day" | "week" | "month";
};
export declare const GIG_CATEGORIES: readonly ["Development", "Design", "Writing & Content", "Data", "Marketing", "Business"];
export declare const AI_TOOLS: readonly ["ChatGPT", "Claude", "Gemini", "GitHub Copilot", "Cursor", "Midjourney", "DALL-E", "Stable Diffusion", "Runway", "ElevenLabs", "Notion AI", "Other"];
export declare const SKILLS: readonly ["JavaScript", "TypeScript", "Python", "React", "Next.js", "Node.js", "PostgreSQL", "MongoDB", "AWS", "Docker", "GraphQL", "REST APIs", "UI/UX Design", "Figma", "Technical Writing", "Data Analysis", "Machine Learning"];
export type WalletAddress = {
    currency: string;
    address: string;
    is_preferred: boolean;
};
export declare const WALLET_CURRENCIES: readonly [{
    readonly id: "usdc_pol";
    readonly name: "USDC (Polygon)";
    readonly symbol: "USDC";
}, {
    readonly id: "usdc_sol";
    readonly name: "USDC (Solana)";
    readonly symbol: "USDC";
}, {
    readonly id: "usdc_eth";
    readonly name: "USDC (Ethereum)";
    readonly symbol: "USDC";
}, {
    readonly id: "usdt";
    readonly name: "USDT";
    readonly symbol: "USDT";
}, {
    readonly id: "pol";
    readonly name: "Polygon";
    readonly symbol: "POL";
}, {
    readonly id: "sol";
    readonly name: "Solana";
    readonly symbol: "SOL";
}, {
    readonly id: "btc";
    readonly name: "Bitcoin";
    readonly symbol: "BTC";
}, {
    readonly id: "eth";
    readonly name: "Ethereum";
    readonly symbol: "ETH";
}];
