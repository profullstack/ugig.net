import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignupForm } from "@/components/auth/SignupForm";
import { clearStoredReferral, getStoredReferral, storeReferral } from "./ReferralTracker";

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

function restoreLocalStorage() {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
  }
}

function replaceLocalStorage(storage: Storage) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

function blockLocalStorageAccess() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage blocked");
    },
  });
}

describe("referral storage helpers", () => {
  beforeEach(() => {
    restoreLocalStorage();
    window.localStorage.clear();
  });

  afterEach(() => {
    restoreLocalStorage();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores, reads, and clears referral codes when storage is available", () => {
    storeReferral("alice123");

    expect(getStoredReferral()).toBe("alice123");

    clearStoredReferral();

    expect(getStoredReferral()).toBeNull();
  });

  it("treats unavailable localStorage as non-fatal", () => {
    blockLocalStorageAccess();

    expect(() => storeReferral("alice123")).not.toThrow();
    expect(getStoredReferral()).toBeNull();
    expect(() => clearStoredReferral()).not.toThrow();
  });

  it("treats localStorage method failures as non-fatal", () => {
    const storage = {
      length: 0,
      clear: vi.fn(),
      getItem: vi.fn(() => {
        throw new Error("read denied");
      }),
      key: vi.fn(),
      removeItem: vi.fn(() => {
        throw new Error("remove denied");
      }),
      setItem: vi.fn(() => {
        throw new Error("write denied");
      }),
    } as unknown as Storage;
    replaceLocalStorage(storage);

    expect(() => storeReferral("alice123")).not.toThrow();
    expect(getStoredReferral()).toBeNull();
    expect(() => clearStoredReferral()).not.toThrow();
  });
});

describe("SignupForm referrals", () => {
  beforeEach(() => {
    restoreLocalStorage();
    window.localStorage.clear();
  });

  afterEach(() => {
    restoreLocalStorage();
    window.localStorage.clear();
  });

  it("uses the server-provided referral code when localStorage is unavailable", () => {
    blockLocalStorageAccess();

    render(<SignupForm referralCode="alice123" />);

    expect(screen.getByText("Referred by")).toBeInTheDocument();
    expect(screen.getByText("alice123")).toBeInTheDocument();
  });
});
