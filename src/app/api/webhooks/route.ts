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
