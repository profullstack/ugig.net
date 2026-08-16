/**
 * Create an LNbits wallet for a user and set their ln_address.
 * Called on email confirmation (auth webhook).
 */

const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY || "";

interface LnWalletResult {
  wallet_id: string;
  adminkey: string;
  inkey: string;
  ln_address: string;
}

interface PayLink {
  id: string;
}

/**
 * Make sure the wallet has at least one lnurlp pay link, returning it.
 *
 * /.well-known/lnurlp/<username> resolves through the user's own wallet and
 * uses the link id, so the link's LNbits `username`/`domain` fields are not
 * required for the Lightning Address to work. They are only set opportunistically
 * so LNbits-side resolution matches; if the name is already claimed on the shared
 * LNbits instance we retry without it rather than leaving the wallet with no link.
 */
async function ensurePayLink(adminKey: string, lnUsername: string): Promise<PayLink | null> {
  // Wait for the lnurlp extension (systemd timer auto-enables every 10s)
  const start = Date.now();
  let existing: PayLink[] | null = null;
  while (Date.now() - start < 15000) {
    try {
      const check = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links`, {
        headers: { "X-Api-Key": adminKey, Accept: "application/json" },
      });
      if (check.status === 200) {
        existing = await check.json();
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (existing === null) {
    console.warn("[LN Wallet] lnurlp not enabled after 15s");
    return null;
  }

  // Idempotent: a wallet that already has a link is already payable.
  if (existing.length > 0) return existing[0];

  const base = {
    description: `ugig.net wallet for ${lnUsername}`,
    min: 1,
    max: 10000000,
    comment_chars: 255,
    // Lightning Addresses are reused indefinitely — never mark them single-use.
    disposable: false,
  };

  // First try claiming the LNbits-side username, then fall back to a plain link.
  for (const body of [{ ...base, username: lnUsername, domain: "ugig.net" }, base]) {
    const res = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links`, {
      method: "POST",
      headers: { "X-Api-Key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) return (await res.json()) as PayLink;

    const errText = await res.text();
    console.warn(`[LN Wallet] Pay link creation failed (${res.status}):`, errText);
  }

  return null;
}

export async function createUserLnWallet(username: string, supabase?: any, userId?: string): Promise<LnWalletResult | null> {
  const lnUsername = username.toLowerCase();
  try {
    // Reuse an existing wallet if we already made one for this user. Creating a
    // second LNbits wallet here would orphan the first one (and any pay link and
    // balance on it) when the upsert below replaces the stored credentials.
    let wallet: { id: string; adminkey: string; inkey: string } | null = null;
    if (supabase && userId) {
      try {
        const { data: stored } = await supabase
          .from("user_ln_wallets")
          .select("wallet_id, admin_key, invoice_key")
          .eq("user_id", userId)
          .maybeSingle();
        if (stored?.wallet_id && stored?.admin_key) {
          wallet = { id: stored.wallet_id, adminkey: stored.admin_key, inkey: stored.invoice_key };
          console.log(`[LN Wallet] Reusing existing wallet for ${lnUsername}`);
        }
      } catch (e) {
        console.warn("[LN Wallet] Failed to look up existing wallet:", e);
      }
    }

    if (!wallet) {
      // Create wallet on LNbits
      const res = await fetch(`${LNBITS_URL}/api/v1/account`, {
        method: "POST",
        headers: {
          "X-Api-Key": LNBITS_ADMIN_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: `ugig-${lnUsername}` }),
      });

      if (!res.ok) {
        console.error("[LN Wallet] Failed to create wallet:", await res.text());
        return null;
      }

      wallet = await res.json();
    }

    if (!wallet) return null;

    // Create a pay link (lightning address) for the wallet
    const link = await ensurePayLink(wallet.adminkey, lnUsername);

    // Only advertise an address that actually resolves. Claiming one without a
    // backing pay link makes the profile show a Lightning Address that 404s.
    const ln_address = link ? `${lnUsername}@ugig.net` : "";
    if (!link) {
      console.warn(`[LN Wallet] No pay link for ${lnUsername} — leaving ln_address unset`);
    }

    // Store wallet credentials for future use
    if (supabase && userId) {
      try {
        await supabase.from("user_ln_wallets").upsert({
          user_id: userId,
          wallet_id: wallet.id,
          admin_key: wallet.adminkey,
          invoice_key: wallet.inkey,
        }, { onConflict: "user_id" });
      } catch (e) {
        console.warn("[LN Wallet] Failed to store wallet credentials:", e);
      }
    }

    return {
      wallet_id: wallet.id,
      adminkey: wallet.adminkey,
      inkey: wallet.inkey,
      ln_address,
    };
  } catch (err) {
    console.error("[LN Wallet] Error creating wallet:", err);
    return null;
  }
}
