// Constants
export const GIG_CATEGORIES = [
    "Development",
    "Design",
    "Writing & Content",
    "Data",
    "Marketing",
    "Business",
];
export const AI_TOOLS = [
    "ChatGPT",
    "Claude",
    "Gemini",
    "GitHub Copilot",
    "Cursor",
    "Midjourney",
    "DALL-E",
    "Stable Diffusion",
    "Runway",
    "ElevenLabs",
    "Notion AI",
    "Other",
];
export const SKILLS = [
    // Development
    "JavaScript",
    "TypeScript",
    "Python",
    "React",
    "Next.js",
    "Node.js",
    "PostgreSQL",
    "MongoDB",
    "AWS",
    "Docker",
    "GraphQL",
    "REST APIs",
    "Machine Learning",
    // Design & Creative
    "UI/UX Design",
    "Figma",
    "Graphic Design",
    "Video Editing",
    "Photography",
    "Animation",
    "3D Modeling",
    // Writing & Content
    "Technical Writing",
    "Copywriting",
    "Content Writing",
    "SEO",
    "Translation",
    "Blogging",
    // Marketing & Business
    "Social Media Marketing",
    "Email Marketing",
    "Data Analysis",
    "Project Management",
    "Sales",
    "Customer Support",
    // Audio & Music
    "Audio Production",
    "Music Composition",
    "Voiceover",
    "Podcast Production",
    // Other
    "Virtual Assistant",
    "Research",
    "Bookkeeping",
    "Legal",
    "Teaching",
];
// Common payment coins for gigs and profiles
export const PAYMENT_COINS = [
    "BTC",
    "SATS",
    "LN",
    "SOL",
    "ETH",
    "USDC",
    "USDT",
    "POL",
];
/** Coins where amounts are denominated in sats instead of USD */
export const SATS_COINS = new Set(["SATS", "LN", "BTC"]);
/** Format a budget amount based on payment coin */
export function formatBudgetAmount(amount, paymentCoin) {
    if (paymentCoin && SATS_COINS.has(paymentCoin)) {
        // For BTC: if amount looks like sats (>= 1000 or is an integer), show as sats
        // Otherwise show as BTC
        if (paymentCoin === "BTC" && amount < 1) {
            return `₿${amount}`;
        }
        return `${amount.toLocaleString()} sats`;
    }
    // Default: USD
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
/** Get the currency label for display */
export function getBudgetCurrencyLabel(paymentCoin) {
    if (!paymentCoin)
        return "USD";
    if (paymentCoin === "SATS" || paymentCoin === "LN")
        return "sats";
    return paymentCoin;
}
// Supported wallet currencies (matches CoinPayPortal)
export const WALLET_CURRENCIES = [
    { id: "usdc_pol", name: "USDC (Polygon)", symbol: "USDC" },
    { id: "usdc_sol", name: "USDC (Solana)", symbol: "USDC" },
    { id: "usdc_eth", name: "USDC (Ethereum)", symbol: "USDC" },
    { id: "usdt", name: "USDT", symbol: "USDT" },
    { id: "pol", name: "Polygon", symbol: "POL" },
    { id: "sol", name: "Solana", symbol: "SOL" },
    { id: "btc", name: "Bitcoin", symbol: "BTC" },
    { id: "eth", name: "Ethereum", symbol: "ETH" },
];
//# sourceMappingURL=types.js.map