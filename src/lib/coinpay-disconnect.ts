/**
 * Releasing a connected CoinPay identity (#537).
 *
 * `oauth_identities` is UNIQUE(provider, provider_user_id), so one CoinPay
 * account can be attached to exactly one ugig profile. Connecting it to a
 * second profile returned `?coinpay=already_linked` and there was no unlink
 * anywhere in the UI or the API, which left the identity stranded on whichever
 * profile happened to claim it first — and the profile that actually needed it
 * for payouts permanently unable to receive one.
 *
 * The release is deliberately narrow: a caller may only detach the identity
 * attached to their own profile. Nothing here can touch another profile's link.
 */

/**
 * Just the slice of the Supabase client this module uses. `oauth_identities`
 * and `oauth_identity_events` are absent from the generated database types, so
 * the builder is untyped here exactly as it is at the other call sites.
 */
export type SupabaseLike = {
  from: (table: string) => any;
};

export interface ConnectedIdentity {
  id: string;
  provider_user_id: string | null;
  email: string | null;
}

/**
 * A payout already in flight depends on the wallet lookup this identity
 * provides, so the link is frozen until it settles. Returns a human-readable
 * reason, or null when nothing is pending.
 */
export async function findBlockingPayout(
  supabase: SupabaseLike,
  userId: string
): Promise<string | null> {
  // Bounty payouts to this user that have been invoiced but not yet paid.
  const { data: bountyRows } = await supabase
    .from("bounty_submissions")
    .select("id")
    .eq("submitter_id", userId)
    .eq("payout_status", "invoiced")
    .limit(1);

  if (Array.isArray(bountyRows) && bountyRows.length > 0) {
    return "A bounty payout to you is currently being processed. Disconnect CoinPay once it has settled.";
  }

  // Gig invoices awaiting payment, on either side: the payer's connected
  // account is what funds them, the worker's is where the money lands.
  const { data: invoiceRows } = await supabase
    .from("gig_invoices")
    .select("id")
    .or(`poster_id.eq.${userId},worker_id.eq.${userId}`)
    .eq("status", "sent")
    .limit(1);

  if (Array.isArray(invoiceRows) && invoiceRows.length > 0) {
    return "You have an invoice awaiting payment. Disconnect CoinPay once it has settled.";
  }

  return null;
}

/** The CoinPay identity currently attached to this profile, if any. */
export async function findConnectedIdentity(
  supabase: SupabaseLike,
  userId: string
): Promise<ConnectedIdentity | null> {
  const { data } = await supabase
    .from("oauth_identities")
    .select("id, provider_user_id, email")
    .eq("user_id", userId)
    .eq("provider", "coinpay")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as ConnectedIdentity | null) ?? null;
}

/**
 * Record what happened to a link. Fire-and-forget: an audit write must never be
 * the reason a disconnect fails, but it is written before the row is deleted so
 * the provider_user_id is still known.
 */
export async function logIdentityEvent(
  supabase: SupabaseLike,
  params: {
    userId: string;
    provider: string;
    providerUserId?: string | null;
    event: "connected" | "reconnected" | "disconnected" | "link_rejected";
    email?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("oauth_identity_events").insert({
      user_id: params.userId,
      provider: params.provider,
      provider_user_id: params.providerUserId ?? null,
      event: params.event,
      email: params.email ?? null,
      metadata: params.metadata ?? {},
    });
    if (error) {
      console.error("[oauth-audit] failed to record event:", error.message);
    }
  } catch (err) {
    console.error("[oauth-audit] unexpected error recording event:", err);
  }
}
