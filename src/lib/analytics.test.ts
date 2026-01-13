import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  trackEvent,
  trackCheckout,
  trackSignup,
  trackGigCreated,
  trackApplicationSubmitted,
} from "./analytics";

describe("analytics", () => {
  const mockDatafast = vi.fn();

  beforeEach(() => {
    // Set up window.datafast mock
    vi.stubGlobal("window", {
      datafast: mockDatafast,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockDatafast.mockClear();
  });

  describe("trackEvent", () => {
    it("calls datafast with event name", () => {
      trackEvent("test_event");
      expect(mockDatafast).toHaveBeenCalledWith("test_event", undefined);
    });

    it("calls datafast with event name and data", () => {
      const data = { key: "value" };
      trackEvent("test_event", data);
      expect(mockDatafast).toHaveBeenCalledWith("test_event", data);
    });

    it("does not throw when window.datafast is undefined", () => {
      vi.stubGlobal("window", {});
      expect(() => trackEvent("test_event")).not.toThrow();
    });
  });

  describe("trackCheckout", () => {
    it("calls trackEvent with initiate_checkout event", () => {
      const data = { name: "Test", email: "test@example.com", product_id: "123" };
      trackCheckout(data);
      expect(mockDatafast).toHaveBeenCalledWith("initiate_checkout", data);
    });

    it("handles partial data", () => {
      trackCheckout({ email: "test@example.com" });
      expect(mockDatafast).toHaveBeenCalledWith("initiate_checkout", {
        email: "test@example.com",
      });
    });
  });

  describe("trackSignup", () => {
    it("calls trackEvent with signup event", () => {
      const data = { email: "test@example.com", username: "testuser" };
      trackSignup(data);
      expect(mockDatafast).toHaveBeenCalledWith("signup", data);
    });
  });

  describe("trackGigCreated", () => {
    it("calls trackEvent with gig_created event", () => {
      const data = { gig_id: "123", category: "Development" };
      trackGigCreated(data);
      expect(mockDatafast).toHaveBeenCalledWith("gig_created", data);
    });
  });

  describe("trackApplicationSubmitted", () => {
    it("calls trackEvent with application_submitted event", () => {
      const data = { gig_id: "123", application_id: "456" };
      trackApplicationSubmitted(data);
      expect(mockDatafast).toHaveBeenCalledWith("application_submitted", data);
    });
  });
});
