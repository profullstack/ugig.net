/**
 * DID (Decentralized Identifier) generation and CoinPayPortal registration.
 * Shared between signup and email confirmation flows.
 */

import { generateKeyPairSync } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { COINPAY_UA } from "@/lib/coinpay-ua";

function base58btcEncode(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  const result: string[] = [];
  const ZERO = BigInt(0);
  const FIFTY_EIGHT = BigInt(58);
  while (num > ZERO) {
    const mod = Number(num % FIFTY_EIGHT);
    result.unshift(ALPHABET[mod]);
    num = num / FIFTY_EIGHT;
  }
  for (const b of bytes) {
    if (b === 0) result.unshift("1");
    else break;
  }
  return result.join("");
}

/**
 * Generate a did:key (ed25519), store on profile, and register on CoinPayPortal.
 * Returns the DID string or null if storage failed.
 */
export async function generateAndStoreDid(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<string | null> {
  // Check if user already has a DID
  const { data: profile } = await supabase
    .from("profiles")
    .select("did")
    .eq("id", userId)
    .single();

  if (profile?.did) {
    return profile.did; // Already has one
  }

  // Generate ed25519 keypair
  const { publicKey: pubKeyObj } = generateKeyPairSync("ed25519");
  const pubKeyRaw = pubKeyObj.export({ type: "spki", format: "der" }).subarray(-32);

  // Build did:key with ed25519 multicodec prefix (0xed01)
  const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), pubKeyRaw]);
  const did = `did:key:z${base58btcEncode(multicodec)}`;

  // Store DID on the ugig profile
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ did })
    .eq("id", userId);

  if (updateError) {
    console.error("[DID] Failed to store DID on profile:", updateError);
    return null;
  }

  // Register the DID on CoinPayPortal
  const coinpayApi = process.env.COINPAY_API_URL || "https://coinpayportal.com";
  const coinpayKey = process.env.COINPAY_REPUTATION_API_KEY;

  if (coinpayKey) {
    try {
      const publicKeyB64 = Buffer.from(pubKeyRaw).toString("base64url");
      const res = await fetch(`${coinpayApi}/api/reputation/did/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${coinpayKey}`,
          "user-agent": COINPAY_UA,
        },
        body: JSON.stringify({
          did,
          public_key: publicKeyB64,
          platform: "ugig.net",
          email,
        }),
      });
      if (!res.ok) {
        console.warn(`[DID] CoinPayPortal register returned ${res.status}`);
      }
    } catch (err) {
      console.warn("[DID] CoinPayPortal DID register failed:", err);
    }
  }

  // Submit initial reputation action
  try {
    const { submitReputationAction } = await import("@/lib/reputation");
    await submitReputationAction({
      agent_did: did,
      action_category: "identity.profile_update",
      action_type: "email_confirmed",
      metadata: { platform: "ugig.net" },
    });
  } catch (err) {
    console.warn("[DID] Reputation action failed:", err);
  }

  return did;
}
