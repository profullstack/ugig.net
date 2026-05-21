// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredReferral,
  getStoredReferral,
  ReferralTracker,
} from "./ReferralTracker";

let searchParams = new URLSearchParams();
const originalLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

function createStorageMock(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe("ReferralTracker", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createStorageMock(),
    });
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(window, "localStorage", originalLocalStorage);
    }
    vi.restoreAllMocks();
  });

  it("stores referral codes from the query string", async () => {
    searchParams = new URLSearchParams("ref=invite-123");

    render(<ReferralTracker />);

    await waitFor(() => {
      expect(window.localStorage.getItem("ugig_referral_code")).toBe("invite-123");
    });
  });

  it("reads and clears stored referral codes", () => {
    window.localStorage.setItem("ugig_referral_code", "invite-456");

    expect(getStoredReferral()).toBe("invite-456");

    clearStoredReferral();

    expect(getStoredReferral()).toBeNull();
  });

  it("does not throw when localStorage is unavailable", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });
    searchParams = new URLSearchParams("ref=invite-789");

    expect(() => render(<ReferralTracker />)).not.toThrow();
    expect(getStoredReferral()).toBeNull();
    expect(() => clearStoredReferral()).not.toThrow();
  });

  it("does not throw when localStorage rejects writes", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }),
      removeItem: vi.fn(),
    } as unknown as Storage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
    searchParams = new URLSearchParams("ref=invite-999");

    expect(() => render(<ReferralTracker />)).not.toThrow();
    expect(storage.setItem).toHaveBeenCalledWith("ugig_referral_code", "invite-999");
  });
});
