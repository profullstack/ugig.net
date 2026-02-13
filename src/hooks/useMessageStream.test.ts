import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMessageStream } from "./useMessageStream";
import type { MessageWithSender } from "@/types";

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0; // CONNECTING
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
    this.readyState = 2; // CLOSED
  }

  // Helper methods for testing
  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.(new Event("open"));
  }

  simulateMessage(data: unknown) {
    const event = new MessageEvent("message", {
      data: JSON.stringify(data),
    });
    this.onmessage?.(event);
  }

  simulateError() {
    this.onerror?.(new Event("error"));
  }

  static clearInstances() {
    MockEventSource.instances = [];
  }
}

describe("useMessageStream", () => {
  beforeEach(() => {
    MockEventSource.clearInstances();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects to SSE endpoint when conversationId is provided", () => {
    renderHook(() => useMessageStream("conv-123"));

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe(
      "/api/conversations/conv-123/stream"
    );
  });

  it("does not connect when conversationId is null", () => {
    renderHook(() => useMessageStream(null));

    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("sets isConnected to true when connection opens", async () => {
    const { result } = renderHook(() => useMessageStream("conv-123"));

    expect(result.current.isConnected).toBe(false);

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it("calls onMessage callback when message is received", async () => {
    const onMessage = vi.fn();
    renderHook(() => useMessageStream("conv-123", { onMessage }));

    const mockMessage: MessageWithSender = {
      id: "msg-123",
      conversation_id: "conv-123",
      sender_id: "user-456",
      content: "Hello!",
      attachments: null,
      read_by: ["user-456"],
      created_at: "2024-01-15T10:00:00Z",
      sender: {
        id: "user-456",
        username: "testuser",
        full_name: "Test User",
        avatar_url: null,
        banner_url: null,
        bio: null,
        skills: [],
        ai_tools: [],
        hourly_rate: null,
        portfolio_urls: [],
        location: null,
        timezone: null,
        is_available: true,
        profile_completed: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        resume_url: null,
        resume_filename: null,
        website: null,
        linkedin_url: null,
        github_url: null,
        twitter_url: null,
        wallet_addresses: [],
        last_active_at: "2024-01-01T00:00:00Z",
        account_type: "human" as const,
        agent_name: null,
        agent_description: null,
        agent_version: null,
        agent_operator_url: null,
        agent_source_url: null,
        rate_type: null,
        rate_amount: null,
        rate_unit: null,
        preferred_coin: null,
        followers_count: 0,
        following_count: 0,
        reminder_sent_at: null,
        verified: false,
        verified_at: null,
        verification_type: null,
        did: null,
      },
    };

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });

    act(() => {
      MockEventSource.instances[0].simulateMessage(mockMessage);
    });

    expect(onMessage).toHaveBeenCalledWith(mockMessage);
  });

  it("sets error and isConnected to false on connection error", async () => {
    const { result } = renderHook(() => useMessageStream("conv-123"));

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    act(() => {
      MockEventSource.instances[0].simulateError();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).toBeTruthy();
    });
  });

  it("closes connection on unmount", () => {
    const { unmount } = renderHook(() => useMessageStream("conv-123"));

    expect(MockEventSource.instances[0].closed).toBe(false);

    unmount();

    expect(MockEventSource.instances[0].closed).toBe(true);
  });

  it("reconnects when reconnect is called", async () => {
    const { result } = renderHook(() => useMessageStream("conv-123"));

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const firstInstance = MockEventSource.instances[0];

    act(() => {
      result.current.reconnect();
    });

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(2);
      expect(firstInstance.closed).toBe(true);
    });
  });

  it("reconnects when conversationId changes", async () => {
    const { result, rerender } = renderHook(
      ({ conversationId }) => useMessageStream(conversationId),
      { initialProps: { conversationId: "conv-123" } }
    );

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const firstInstance = MockEventSource.instances[0];

    rerender({ conversationId: "conv-456" });

    await waitFor(() => {
      expect(firstInstance.closed).toBe(true);
      expect(MockEventSource.instances).toHaveLength(2);
      expect(MockEventSource.instances[1].url).toBe(
        "/api/conversations/conv-456/stream"
      );
    });
  });

  it("clears error on successful reconnect", async () => {
    const { result } = renderHook(() => useMessageStream("conv-123"));

    // Simulate error
    act(() => {
      MockEventSource.instances[0].simulateError();
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    // Reconnect
    act(() => {
      result.current.reconnect();
    });

    // Simulate successful connection
    act(() => {
      MockEventSource.instances[1].simulateOpen();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.isConnected).toBe(true);
    });
  });

  it("handles malformed JSON in message gracefully", async () => {
    const onMessage = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderHook(() => useMessageStream("conv-123", { onMessage }));

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });

    // Send invalid JSON
    act(() => {
      const event = new MessageEvent("message", {
        data: "not valid json",
      });
      MockEventSource.instances[0].onmessage?.(event);
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to parse message:",
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
