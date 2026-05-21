"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const REFERRAL_KEY = "ugig_referral_code";

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
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
    const storage = getLocalStorage();
    if (ref) {
      try {
        storage?.setItem(REFERRAL_KEY, ref);
      } catch {
        // Some privacy modes expose localStorage but reject writes.
      }
    }
  }, [searchParams]);

  return null;
}

/** Read the stored referral code (call from signup form, etc.) */
export function getStoredReferral(): string | null {
  try {
    return getLocalStorage()?.getItem(REFERRAL_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Clear stored referral after successful signup */
export function clearStoredReferral(): void {
  try {
    getLocalStorage()?.removeItem(REFERRAL_KEY);
  } catch {
    // Ignore storage cleanup failures so signup completion can continue.
  }
}
