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

export async function createUserLnWallet(username: string, supabase?: any, userId?: string): Promise<LnWalletResult | null> {
  const lnUsername = username.toLowerCase();
  try {
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

    const wallet = await res.json();

    // Create a pay link (lightning address) for the wallet
    // Wait for lnurlp extension (systemd timer auto-enables every 10s)
    const start = Date.now();
    let extReady = false;
    while (Date.now() - start < 15000) {
      try {
        const check = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links`, {
          headers: { "X-Api-Key": wallet.adminkey },
        });
        if (check.status === 200) { extReady = true; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!extReady) {
      console.warn("[LN Wallet] lnurlp not enabled after 15s");
    }

    const payLinkRes = await fetch(`${LNBITS_URL}/lnurlp/api/v1/links`, {
      method: "POST",
      headers: {
        "X-Api-Key": wallet.adminkey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: `ugig.net wallet for ${lnUsername}`,
        min: 1,
        max: 10000000,
        comment_chars: 255,
        username: lnUsername,
        domain: "ugig.net",
      }),
    });

    let ln_address = "";
    if (payLinkRes.ok) {
      ln_address = `${lnUsername}@ugig.net`;
    } else {
      const errText = await payLinkRes.text();
      // If username already taken on LNbits, the address already exists
      if (errText.includes("already") || errText.includes("unique")) {
        ln_address = `${lnUsername}@ugig.net`;
        console.warn("[LN Wallet] Pay link username already exists, reusing:", ln_address);
      } else {
        console.warn("[LN Wallet] Pay link creation failed:", errText);
      }
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
