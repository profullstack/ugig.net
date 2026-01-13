import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  auth,
  profile,
  gigs,
  applications,
  payments,
  conversations,
  messages,
} from "./api";

describe("API client", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockClear();
  });

  describe("auth", () => {
    it("signup makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: "123" } }),
      });

      const result = await auth.signup({
        email: "test@example.com",
        password: "Test1234",
        username: "testuser",
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "Test1234",
          username: "testuser",
        }),
      });
      expect(result.data).toEqual({ user: { id: "123" } });
      expect(result.error).toBeNull();
    });

    it("login makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: "123" } }),
      });

      await auth.login({
        email: "test@example.com",
        password: "Test1234",
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "Test1234",
        }),
      });
    });

    it("logout makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await auth.logout();

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("forgotPassword makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await auth.forgotPassword({ email: "test@example.com" });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });
    });

    it("resetPassword makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await auth.resetPassword({ password: "NewPass123" });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "NewPass123" }),
      });
    });

    it("getSession makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: "123" } }),
      });

      await auth.getSession();

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/session", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("handles API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Invalid credentials" }),
      });

      const result = await auth.login({
        email: "test@example.com",
        password: "wrong",
      });

      expect(result.data).toBeNull();
      expect(result.error).toBe("Invalid credentials");
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await auth.login({
        email: "test@example.com",
        password: "test",
      });

      expect(result.data).toBeNull();
      expect(result.error).toBe("Network error. Please try again.");
    });
  });

  describe("profile", () => {
    it("get makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ profile: { id: "123" } }),
      });

      await profile.get();

      expect(mockFetch).toHaveBeenCalledWith("/api/profile", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("update makes PUT request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ profile: { id: "123" } }),
      });

      await profile.update({ full_name: "Test User" });

      expect(mockFetch).toHaveBeenCalledWith("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: "Test User" }),
      });
    });

    it("getPublic makes GET request with username", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ profile: { username: "testuser" } }),
      });

      await profile.getPublic("testuser");

      expect(mockFetch).toHaveBeenCalledWith("/api/users/testuser", {
        headers: { "Content-Type": "application/json" },
      });
    });
  });

  describe("gigs", () => {
    it("list makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ gigs: [] }),
      });

      await gigs.list();

      expect(mockFetch).toHaveBeenCalledWith("/api/gigs", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("list with params makes GET request with query string", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ gigs: [] }),
      });

      const params = new URLSearchParams({ category: "Development" });
      await gigs.list(params);

      expect(mockFetch).toHaveBeenCalledWith("/api/gigs?category=Development", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("get makes GET request with ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ gig: { id: "123" } }),
      });

      await gigs.get("123");

      expect(mockFetch).toHaveBeenCalledWith("/api/gigs/123", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("create makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ gig: { id: "123" } }),
      });

      await gigs.create({ title: "Test Gig" });

      expect(mockFetch).toHaveBeenCalledWith("/api/gigs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test Gig" }),
      });
    });

    it("update makes PUT request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ gig: { id: "123" } }),
      });

      await gigs.update("123", { title: "Updated Gig" });

      expect(mockFetch).toHaveBeenCalledWith("/api/gigs/123", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated Gig" }),
      });
    });

    it("delete makes DELETE request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await gigs.delete("123");

      expect(mockFetch).toHaveBeenCalledWith("/api/gigs/123", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("getMy makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ gigs: [] }),
      });

      await gigs.getMy();

      expect(mockFetch).toHaveBeenCalledWith("/api/gigs/my", {
        headers: { "Content-Type": "application/json" },
      });
    });
  });

  describe("applications", () => {
    it("create makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ application: { id: "123" } }),
      });

      await applications.create({ gig_id: "456", cover_letter: "Test" });

      expect(mockFetch).toHaveBeenCalledWith("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gig_id: "456", cover_letter: "Test" }),
      });
    });

    it("getMy makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ applications: [] }),
      });

      await applications.getMy();

      expect(mockFetch).toHaveBeenCalledWith("/api/applications/my", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("getForGig makes GET request with gig ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ applications: [] }),
      });

      await applications.getForGig("123");

      expect(mockFetch).toHaveBeenCalledWith("/api/gigs/123/applications", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("updateStatus makes PUT request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ application: { status: "accepted" } }),
      });

      await applications.updateStatus("123", "accepted");

      expect(mockFetch).toHaveBeenCalledWith("/api/applications/123/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });
    });
  });

  describe("payments", () => {
    it("create makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            payment_id: "123",
            checkout_url: "https://pay.example.com",
          }),
      });

      await payments.create({
        type: "subscription",
        currency: "usdc_pol",
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/payments/coinpayportal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "subscription",
          currency: "usdc_pol",
        }),
      });
    });
  });

  describe("conversations", () => {
    it("list makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await conversations.list();

      expect(mockFetch).toHaveBeenCalledWith("/api/conversations", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("get makes GET request with ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "conv-123" } }),
      });

      await conversations.get("conv-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/conversations/conv-123", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("create makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "conv-123" } }),
      });

      await conversations.create({
        gig_id: "gig-123",
        recipient_id: "user-456",
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gig_id: "gig-123",
          recipient_id: "user-456",
        }),
      });
    });

    it("handles API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Conversation not found" }),
      });

      const result = await conversations.get("invalid-id");

      expect(result.data).toBeNull();
      expect(result.error).toBe("Conversation not found");
    });
  });

  describe("messages", () => {
    it("list makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], hasMore: false }),
      });

      await messages.list("conv-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/conversations/conv-123/messages",
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    it("list with cursor makes GET request with query param", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [], hasMore: false }),
      });

      await messages.list("conv-123", "2024-01-01T00:00:00Z");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/conversations/conv-123/messages?cursor=2024-01-01T00:00:00Z",
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    it("send makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ data: { id: "msg-123", content: "Hello!" } }),
      });

      await messages.send("conv-123", "Hello!");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/conversations/conv-123/messages",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Hello!" }),
        }
      );
    });

    it("markRead makes PUT request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await messages.markRead("msg-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/messages/msg-123/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("handles API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Message not found" }),
      });

      const result = await messages.markRead("invalid-id");

      expect(result.data).toBeNull();
      expect(result.error).toBe("Message not found");
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await messages.send("conv-123", "Hello!");

      expect(result.data).toBeNull();
      expect(result.error).toBe("Network error. Please try again.");
    });
  });
});
