"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const REFERRAL_KEY = "ugig_referral_code";

function getReferralStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function storeReferral(ref: string): void {
  const storage = getReferralStorage();
  if (!storage) return;

  try {
    storage.setItem(REFERRAL_KEY, ref);
  } catch {
    // Referral storage is best-effort; signup can still use the server ref param.
  }
}

/**
 * Captures ?ref= param from any page URL and stores it in localStorage.
 * Drop this component into the root layout so referrals persist across navigation.
 */
export function ReferralTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      storeReferral(ref);
    }
  }, [searchParams]);

  return null;
}

/** Read the stored referral code (call from signup form, etc.) */
export function getStoredReferral(): string | null {
  const storage = getReferralStorage();
  if (!storage) return null;

  try {
    return storage.getItem(REFERRAL_KEY);
  } catch {
    return null;
  }
}

/** Clear stored referral after successful signup */
export function clearStoredReferral(): void {
  const storage = getReferralStorage();
  if (!storage) return;

  try {
    storage.removeItem(REFERRAL_KEY);
  } catch {
    // Clearing should never block account creation success.
  }
}
