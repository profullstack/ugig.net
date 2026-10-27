/**
 * Which ugig account a "Sign in with CoinPay" login opens.
 *
 * CoinPay never verifies email addresses (userinfo always says
 * email_verified=false), so anybody can register a CoinPay account with
 * somebody else's address. The CoinPay email therefore never selects an
 * existing account. A login is bound to the CoinPay `sub` through
 * `oauth_identities (provider='coinpay', provider_user_id=sub)`:
 *
 *  - identity row for this sub      -> that row's user (its OWN auth email is
 *                                      used for the session, never the
 *                                      CoinPay-supplied one)
 *  - no row, email unused on ugig   -> a new account, bound to this sub
 *  - no row, email already on ugig  -> refused ("email_in_use"): the owner signs
 *                                      in their usual way and connects CoinPay
 *                                      from Settings -> Connections while signed in
 */
import { randomBytes } from "crypto";

export type CoinpayLoginInput = {
  sub: string;
  email: string;
  name?: string | null;
  metadata: Record<string, unknown>;
};

export type CoinpayLoginResult =
  | { kind: "existing"; userId: string; email: string }
  | { kind: "created"; userId: string; email: string }
  | { kind: "email_in_use" }
  | { kind: "error"; detail: string };

type AdminSupabase = any;

export async function resolveCoinpayLogin(
  supabase: AdminSupabase,
  input: CoinpayLoginInput
): Promise<CoinpayLoginResult> {
  const { sub, email, name, metadata } = input;
  if (!sub) return { kind: "error", detail: "missing_sub" };

  const { data: identity } = await supabase
    .from("oauth_identities")
    .select("id, user_id")
    .eq("provider", "coinpay")
    .eq("provider_user_id", sub)
    .maybeSingle();

  if (identity) {
    const { data: owner, error: ownerErr } = await supabase.auth.admin.getUserById(identity.user_id);
    const ownerEmail: string | null | undefined = owner?.user?.email;
    if (ownerErr || !ownerEmail) return { kind: "error", detail: "linked_user_missing" };

    await supabase
      .from("oauth_identities")
      .update({ email, metadata, updated_at: new Date().toISOString() })
      .eq("id", identity.id);

    return { kind: "existing", userId: identity.user_id, email: ownerEmail };
  }

  // No account is bound to this CoinPay sub. Create one; never adopt an
  // existing account because its address matches the unverified CoinPay email.
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("hex"),
    email_confirm: true,
    user_metadata: { full_name: name, oauth_provider: "coinpay", coinpay_sub: sub },
  });

  if (createErr || !created?.user) {
    const code = (createErr as { code?: string } | null)?.code;
    const msg = createErr?.message || "";
    if (code === "email_exists" || /already (been )?registered|already exists/i.test(msg)) {
      return { kind: "email_in_use" };
    }
    return { kind: "error", detail: msg || "unknown" };
  }

  const userId: string = created.user.id;
  const { error: linkErr } = await supabase.from("oauth_identities").insert({
    user_id: userId,
    provider: "coinpay",
    provider_user_id: sub,
    email,
    metadata,
  });
  if (linkErr) {
    // Most likely a concurrent login for the same sub won the insert. Do not
    // leave an orphan account holding the address.
    await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
    return { kind: "error", detail: "identity_link_failed" };
  }

  return { kind: "created", userId, email: created.user.email ?? email };
}
