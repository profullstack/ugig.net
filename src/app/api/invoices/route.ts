import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { paymentTransactions } from "@/lib/payments/receipt";

// GET /api/invoices?role=sent|received|all
// Returns invoices where the current user is worker (sent) and/or poster (received).
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const role = new URL(request.url).searchParams.get("role") ?? "all";

    let query = (supabase as any)
      .from("gig_invoices")
      .select(
        `
        *,
        gig:gigs (id, title, poster_id),
        worker:profiles!worker_id (id, username, full_name, avatar_url),
        poster:profiles!poster_id (id, username, full_name, avatar_url)
      `
      )
      .order("created_at", { ascending: false });

    if (role === "sent") {
      query = query.eq("worker_id", user.id);
    } else if (role === "received") {
      query = query.eq("poster_id", user.id);
    } else {
      query = query.or(`worker_id.eq.${user.id},poster_id.eq.${user.id}`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Both the worker and the poster read this endpoint, so the on-chain
    // receipt travels with every invoice — neither side has to ask the other
    // for the transaction id.
    const invoices = ((data || []) as Record<string, unknown>[]).map((invoice) => ({
      ...invoice,
      transactions: paymentTransactions(invoice.metadata),
    }));

    return NextResponse.json({ data: invoices });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
