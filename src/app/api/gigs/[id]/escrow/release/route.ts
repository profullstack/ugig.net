import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { releaseEscrow } from "@/lib/coinpayportal";
import { getUserDid, onGigCompleted } from "@/lib/reputation-hooks";
import { z } from "zod";
import { sendEmail, testimonialReminderEmail } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/service";

const releaseSchema = z.object({
  escrow_id: z.string().uuid(),
});

// POST /api/gigs/[id]/escrow/release - Release escrow to worker
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gigId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const validationResult = releaseSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { escrow_id } = validationResult.data;

    // Get escrow — must be poster and funded
    const { data: escrow } = await (supabase as any)
      .from("gig_escrows")
      .select("*")
      .eq("id", escrow_id)
      .eq("gig_id", gigId)
      .single();

    if (!escrow) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }

    if (escrow.poster_id !== user.id) {
      return NextResponse.json(
        { error: "Only the gig poster can release escrow" },
        { status: 403 }
      );
    }

    if (escrow.status !== "funded") {
      return NextResponse.json(
        { error: `Cannot release escrow in '${escrow.status}' status. Must be 'funded'.` },
        { status: 400 }
      );
    }

    if (!escrow.coinpay_escrow_id) {
      return NextResponse.json(
        { error: "Escrow has no CoinPayPortal ID" },
        { status: 400 }
      );
    }

    // Release on CoinPayPortal
    const releaseResult = await releaseEscrow(escrow.coinpay_escrow_id);

    // Update local record
    const now = new Date().toISOString();
    const { error: updateError } = await (supabase as any)
      .from("gig_escrows")
      .update({
        status: "released",
        released_at: now,
        updated_at: now,
        metadata: {
          ...escrow.metadata,
          release_tx_hash: releaseResult.escrow.tx_hash,
        },
      })
      .eq("id", escrow_id);

    if (updateError) {
      console.error("Failed to update escrow status:", updateError);
    }

    // Update application status to completed
    await supabase
      .from("applications")
      .update({
        status: "completed" as any,
        updated_at: now,
      })
      .eq("id", escrow.application_id);

    // Get gig title for notifications
    const { data: gig } = await supabase
      .from("gigs")
      .select("title")
      .eq("id", gigId)
      .single();

    // Notify worker
    await supabase.from("notifications").insert({
      user_id: escrow.worker_id,
      type: "payment_received",
      title: "Payment released!",
      body: `$${escrow.amount_usd - escrow.platform_fee_usd} has been released for "${gig?.title || "your gig"}". Funds are on their way!`,
      data: {
        gig_id: gigId,
        escrow_id: escrow.id,
        amount_usd: escrow.amount_usd,
        platform_fee_usd: escrow.platform_fee_usd,
      },
    });

    // Email reminders to both parties to leave gig-specific testimonials
    try {
      const serviceClient = createServiceClient();

      const { data: participants } = await supabase
        .from("profiles")
        .select("id, username, full_name")
        .in("id", [escrow.poster_id, escrow.worker_id]);

      const poster = participants?.find((p) => p.id === escrow.poster_id) as
        | { id: string; username: string | null; full_name: string | null }
        | undefined;
      const worker = participants?.find((p) => p.id === escrow.worker_id) as
        | { id: string; username: string | null; full_name: string | null }
        | undefined;

      const [{ data: posterAuth }, { data: workerAuth }] = await Promise.all([
        serviceClient.auth.admin.getUserById(escrow.poster_id),
        serviceClient.auth.admin.getUserById(escrow.worker_id),
      ]);

      const posterEmail = posterAuth?.user?.email || null;
      const workerEmail = workerAuth?.user?.email || null;

      const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

      const posterName = poster?.full_name || poster?.username || "there";
      const workerName = worker?.full_name || worker?.username || "there";
      const posterProfileUrl = poster?.username ? `${baseUrl}/u/${poster.username}` : `${baseUrl}/profile`;
      const workerProfileUrl = worker?.username ? `${baseUrl}/u/${worker.username}` : `${baseUrl}/profile`;

      if (posterEmail) {
        const email = testimonialReminderEmail({
          recipientName: posterName,
          otherPartyName: workerName,
          gigTitle: gig?.title || "your completed gig",
          targetProfileUrl: workerProfileUrl,
          ownProfileUrl: posterProfileUrl,
        });
        await sendEmail({ to: posterEmail, ...email });
      }

      if (workerEmail) {
        const email = testimonialReminderEmail({
          recipientName: workerName,
          otherPartyName: posterName,
          gigTitle: gig?.title || "your completed gig",
          targetProfileUrl: posterProfileUrl,
          ownProfileUrl: workerProfileUrl,
        });
        await sendEmail({ to: workerEmail, ...email });
      }
    } catch (emailErr) {
      console.error("Failed to send testimonial reminder emails:", emailErr);
    }

    // Submit reputation receipt for completed work
    try {
      const workerDid = await getUserDid(supabase, escrow.worker_id);
      if (workerDid) {
        await onGigCompleted(workerDid, gigId);
      }
    } catch (err) {
      console.error("Reputation receipt failed (non-fatal):", err);
    }

    return NextResponse.json({
      data: {
        escrow_id: escrow.id,
        status: "released",
        released_at: now,
        amount_usd: escrow.amount_usd,
        platform_fee_usd: escrow.platform_fee_usd,
        worker_receives: escrow.amount_usd - escrow.platform_fee_usd,
      },
    });
  } catch (error) {
    console.error("Escrow release error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
