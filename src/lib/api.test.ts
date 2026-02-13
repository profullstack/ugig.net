import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  auth,
  profile,
  gigs,
  savedGigs,
  applications,
  payments,
  subscriptions,
  conversations,
  messages,
  videoCalls,
  reviews,
  notifications,
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

    it("resendConfirmation makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "Confirmation link sent." }),
      });

      await auth.resendConfirmation({ email: "test@example.com" });

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
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

    it("updateStatus makes PATCH request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ gig: { id: "123", status: "closed" } }),
      });

      await gigs.updateStatus("123", "closed");

      expect(mockFetch).toHaveBeenCalledWith("/api/gigs/123/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
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

  describe("savedGigs", () => {
    it("list makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ gigs: [] }),
      });

      await savedGigs.list();

      expect(mockFetch).toHaveBeenCalledWith("/api/saved-gigs", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("save makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ saved: { id: "saved-123" } }),
      });

      await savedGigs.save("gig-456");

      expect(mockFetch).toHaveBeenCalledWith("/api/saved-gigs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gig_id: "gig-456" }),
      });
    });

    it("unsave makes DELETE request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "Gig unsaved successfully" }),
      });

      await savedGigs.unsave("gig-456");

      expect(mockFetch).toHaveBeenCalledWith("/api/saved-gigs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gig_id: "gig-456" }),
      });
    });

    it("handles API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Gig not found" }),
      });

      const result = await savedGigs.save("invalid-id");

      expect(result.data).toBeNull();
      expect(result.error).toBe("Gig not found");
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

    it("bulkUpdateStatus makes PUT request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            updated: 3,
            applications: [{ id: "1" }, { id: "2" }, { id: "3" }],
          }),
      });

      await applications.bulkUpdateStatus(["1", "2", "3"], "rejected");

      expect(mockFetch).toHaveBeenCalledWith("/api/applications/bulk-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_ids: ["1", "2", "3"],
          status: "rejected",
        }),
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

    it("sendTyping makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await messages.sendTyping("conv-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/conversations/conv-123/typing",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    it("getTyping makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ typing: ["user-456"] }),
      });

      const result = await messages.getTyping("conv-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/conversations/conv-123/typing",
        {
          headers: { "Content-Type": "application/json" },
        }
      );
      expect(result.data).toEqual({ typing: ["user-456"] });
    });
  });

  describe("videoCalls", () => {
    it("list makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await videoCalls.list();

      expect(mockFetch).toHaveBeenCalledWith("/api/video-calls", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("list with params makes GET request with query string", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await videoCalls.list({ upcoming: true, limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/video-calls?upcoming=true&limit=10",
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    it("get makes GET request with ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: "call-123", room_id: "ugig-abc123" },
          }),
      });

      await videoCalls.get("call-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/video-calls/call-123", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("create makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: "call-123", room_id: "ugig-xyz789" },
          }),
      });

      await videoCalls.create({
        participant_id: "user-456",
        gig_id: "gig-789",
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/video-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant_id: "user-456",
          gig_id: "gig-789",
        }),
      });
    });

    it("start makes PATCH request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: "call-123", started_at: "2024-01-01T00:00:00Z" },
          }),
      });

      await videoCalls.start("call-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/video-calls/call-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
    });

    it("end makes PATCH request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: "call-123", ended_at: "2024-01-01T01:00:00Z" },
          }),
      });

      await videoCalls.end("call-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/video-calls/call-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
    });

    it("cancel makes DELETE request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "Video call canceled" }),
      });

      await videoCalls.cancel("call-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/video-calls/call-123", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("handles API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Call not found" }),
      });

      const result = await videoCalls.get("invalid-id");

      expect(result.data).toBeNull();
      expect(result.error).toBe("Call not found");
    });
  });

  describe("reviews", () => {
    it("list makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [],
            pagination: { total: 0, limit: 20, offset: 0 },
          }),
      });

      await reviews.list();

      expect(mockFetch).toHaveBeenCalledWith("/api/reviews", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("list with params makes GET request with query string", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [],
            pagination: { total: 0, limit: 10, offset: 0 },
          }),
      });

      await reviews.list({ gig_id: "gig-123", limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/reviews?gig_id=gig-123&limit=10",
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    it("get makes GET request with ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: "review-123", rating: 5 },
          }),
      });

      await reviews.get("review-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/reviews/review-123", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("getForUser makes GET request with username", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [],
            summary: { average_rating: 4.5, total_reviews: 10 },
            pagination: { total: 10, limit: 10, offset: 0 },
          }),
      });

      await reviews.getForUser("testuser", { limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/users/testuser/reviews?limit=10",
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    it("create makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: "review-123", rating: 5 },
          }),
      });

      await reviews.create({
        gig_id: "gig-123",
        reviewee_id: "user-456",
        rating: 5,
        comment: "Great work!",
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gig_id: "gig-123",
          reviewee_id: "user-456",
          rating: 5,
          comment: "Great work!",
        }),
      });
    });

    it("update makes PUT request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: "review-123", rating: 4 },
          }),
      });

      await reviews.update("review-123", { rating: 4 });

      expect(mockFetch).toHaveBeenCalledWith("/api/reviews/review-123", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: 4 }),
      });
    });

    it("delete makes DELETE request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "Review deleted" }),
      });

      await reviews.delete("review-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/reviews/review-123", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("handles API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Review not found" }),
      });

      const result = await reviews.get("invalid-id");

      expect(result.data).toBeNull();
      expect(result.error).toBe("Review not found");
    });
  });

  describe("notifications", () => {
    it("list makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            notifications: [],
            unread_count: 0,
            pagination: { total: 0, limit: 50, offset: 0 },
          }),
      });

      await notifications.list();

      expect(mockFetch).toHaveBeenCalledWith("/api/notifications", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("list with params makes GET request with query string", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            notifications: [],
            unread_count: 0,
            pagination: { total: 0, limit: 10, offset: 0 },
          }),
      });

      await notifications.list({ unread: true, limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/notifications?unread=true&limit=10",
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    it("get makes GET request with ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: "notif-123", title: "Test notification" },
          }),
      });

      await notifications.get("notif-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/notifications/notif-123", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("markRead makes PUT request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: "notif-123", read_at: "2024-01-01" },
          }),
      });

      await notifications.markRead("notif-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/notifications/notif-123", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("markAllRead makes PUT request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: "All notifications marked as read",
            count: 5,
          }),
      });

      await notifications.markAllRead();

      expect(mockFetch).toHaveBeenCalledWith("/api/notifications/read-all", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("delete makes DELETE request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await notifications.delete("notif-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/notifications/notif-123", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("handles API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Unauthorized" }),
      });

      const result = await notifications.list();

      expect(result.data).toBeNull();
      expect(result.error).toBe("Unauthorized");
    });
  });

  describe("subscriptions", () => {
    it("get makes GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { plan: "free", status: "active" },
          }),
      });

      await subscriptions.get();

      expect(mockFetch).toHaveBeenCalledWith("/api/subscriptions", {
        headers: { "Content-Type": "application/json" },
      });
    });

    it("createCheckout makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: "cs_test_123",
            url: "https://checkout.stripe.com/...",
          }),
      });

      await subscriptions.createCheckout();

      expect(mockFetch).toHaveBeenCalledWith("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("createPortalSession makes POST request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            url: "https://billing.stripe.com/...",
          }),
      });

      await subscriptions.createPortalSession();

      expect(mockFetch).toHaveBeenCalledWith("/api/subscriptions/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("cancel makes DELETE request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: "Subscription will be canceled at the end of the billing period",
          }),
      });

      await subscriptions.cancel();

      expect(mockFetch).toHaveBeenCalledWith("/api/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("reactivate makes PUT request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: "Subscription reactivated",
          }),
      });

      await subscriptions.reactivate();

      expect(mockFetch).toHaveBeenCalledWith("/api/subscriptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
    });

    it("handles API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "No subscription found" }),
      });

      const result = await subscriptions.cancel();

      expect(result.data).toBeNull();
      expect(result.error).toBe("No subscription found");
    });
  });
});
