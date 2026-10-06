import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();

    // Browser session: unchanged, the full auth user.
    // API key / Bearer / AgentPass: who the key belongs to, so an agent can
    // ask "who am I" with the same route the web app uses.
    let user: unknown = sessionUser;
    let client = supabase;
    let userId = sessionUser?.id ?? null;
    if (!sessionUser) {
      const auth = await getAuthContext(request);
      if (!auth) {
        return NextResponse.json({ user: null, profile: null });
      }
      user = { id: auth.user.id, email: auth.user.email ?? null, auth_method: auth.user.authMethod };
      client = auth.supabase as typeof supabase;
      userId = auth.user.id;
    }

    // Fetch the user's profile
    const { data: profile } = await client
      .from("profiles")
      .select("*")
      .eq("id", userId as string)
      .single();

    return NextResponse.json({
      user,
      profile,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
