/** Platform fee rate applied to zaps and withdrawals (2%) */
export const PLATFORM_FEE_RATE = 0.02;

/** Platform wallet user ID for collecting fees */
export const PLATFORM_WALLET_USER_ID = process.env.PLATFORM_WALLET_USER_ID || "00000000-0000-0000-0000-000000000000";

/** Skill marketplace fee rates by seller subscription tier */
export const SKILL_FEE_RATES = {
  /** Free-tier sellers pay 5% */
  free: 0.05,
  /** Pro-tier sellers pay 2% */
  pro: 0.02,
} as const;

/** MCP marketplace fee rates by seller subscription tier */
export const MCP_FEE_RATES = {
  /** Free-tier sellers pay 5% */
  free: 0.05,
  /** Pro-tier sellers pay 2% */
  pro: 0.02,
} as const;

/** MCP server listing categories */
export const MCP_CATEGORIES = [
  "coding",
  "data",
  "communication",
  "devops",
  "finance",
  "search",
  "productivity",
  "ai-tools",
  "blockchain",
  "other",
] as const;

export type McpCategory = (typeof MCP_CATEGORIES)[number];

/** MCP transport types */
export const MCP_TRANSPORT_TYPES = [
  "stdio",
  "sse",
  "streamable-http",
] as const;

export type McpTransportType = (typeof MCP_TRANSPORT_TYPES)[number];

/** Skill listing categories */
export const SKILL_CATEGORIES = [
  "automation",
  "coding",
  "data",
  "devops",
  "design",
  "writing",
  "research",
  "finance",
  "marketing",
  "other",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/** Suggested popular agents for skill compatibility tags */
export const SUPPORTED_AGENT_OPTIONS = [
  "claude-code",
  "openclaw",
  "codex",
  "cursor",
  "windsurf",
  "goose",
  "aider",
  "roo-code",
  "cline",
] as const;

export type SupportedAgentOption = (typeof SUPPORTED_AGENT_OPTIONS)[number];

/** Affiliate marketplace defaults */
export const AFFILIATE_DEFAULTS = {
  /** Default commission rate (20%) */
  commissionRate: 0.20,
  /** Default cookie/attribution window in days */
  cookieDays: 30,
  /** Default settlement delay in days (hold before payout) */
  settlementDelayDays: 7,
  /** Platform cut from affiliate commissions (5% of the commission) */
  platformFeeRate: 0.05,
} as const;

/** Affiliate offer product types */
export const AFFILIATE_PRODUCT_TYPES = [
  "digital",
  "saas",
  "course",
  "service",
  "skill",
  "template",
  "api",
  "other",
] as const;

export type AffiliateProductType = (typeof AFFILIATE_PRODUCT_TYPES)[number];
