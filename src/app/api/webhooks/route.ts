import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { z } from "zod";
import { randomBytes } from "crypto";

const VALID_EVENTS = [
  "application.new",
  "message.new",
  "gig.update",
  "review.new",
] as const;

/**
 * Validate webhook URL for SSRF protection.
 * Blocks private IPs, localhost, metadata endpoints.
 */
function isAllowedWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be HTTPS in production
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      return false;
    }

    // Block non-http(s) protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    ) {
      return false;
    }

    // Block cloud metadata endpoints
    if (
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal" ||
      hostname.endsWith(".internal")
    ) {
      return false;
    }

    // Block private IP ranges
    const ipPatterns = [
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/,
      /^0\.0\.0\.0$/,
      /^127\.\d+\.\d+\.\d+$/,
    ];

    for (const pattern of ipPatterns) {
      if (pattern.test(hostname)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

const createWebhookSchema = z.object({
  url: z.string().url("Must be a valid URL").max(2048),
  events: z
    .array(z.enum(VALID_EVENTS))
    .min(1, "Must subscribe to at least one event"),
  active: z.boolean().optional().default(true),
});

// GET /api/webhooks - List user's webhooks
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const { data: webhooks, error } = await supabase
      .from("webhooks")
      .select("id, url, events, active, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: webhooks });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/webhooks - Register a new webhook
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const validationResult = createWebhookSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { url, events, active } = validationResult.data;

    // SSRF protection: validate URL before allowing registration
    if (!isAllowedWebhookUrl(url)) {
      return NextResponse.json(
        { error: "Invalid webhook URL. Must be a public HTTPS endpoint." },
        { status: 400 }
      );
    }

    // Limit webhooks per user to 10
    const { count } = await supabase
      .from("webhooks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (count !== null && count >= 10) {
      return NextResponse.json(
        { error: "Maximum of 10 webhooks allowed per user" },
        { status: 400 }
      );
    }

    // Generate a signing secret
    const secret = randomBytes(32).toString("hex");

    const { data: webhook, error } = await supabase
      .from("webhooks")
      .insert({
        user_id: user.id,
        url,
        secret,
        events,
        active,
      })
      .select("id, url, secret, events, active, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: webhook }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
