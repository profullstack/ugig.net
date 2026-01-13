"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { MessageWithSender } from "@/types";

interface UseMessageStreamOptions {
  onMessage?: (message: MessageWithSender) => void;
  onTypingChange?: (isTyping: boolean, userId?: string) => void;
}

interface UseMessageStreamReturn {
  isConnected: boolean;
  error: Error | null;
  reconnect: () => void;
  sendTyping: () => void;
  isOtherTyping: boolean;
}

export function useMessageStream(
  conversationId: string | null,
  options: UseMessageStreamOptions = {}
): UseMessageStreamReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  const { onMessage, onTypingChange } = options;

  // Store callbacks in ref to avoid stale closures
  const onMessageRef = useRef(onMessage);
  const onTypingChangeRef = useRef(onTypingChange);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    onTypingChangeRef.current = onTypingChange;
  }, [onTypingChange]);

  // Poll for typing status
  useEffect(() => {
    if (!conversationId || !isConnected) return;

    const pollTyping = async () => {
      try {
        const response = await fetch(`/api/conversations/${conversationId}/typing`);
        if (response.ok) {
          const data = await response.json();
          const hasTyping = data.typing && data.typing.length > 0;
          setIsOtherTyping(hasTyping);
          onTypingChangeRef.current?.(hasTyping, data.typing?.[0]);
        }
      } catch {
        // Ignore polling errors
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollTyping, 2000);
    pollTyping(); // Initial poll

    return () => clearInterval(interval);
  }, [conversationId, isConnected]);

  useEffect(() => {
    if (!conversationId) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `/api/conversations/${conversationId}/stream`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as MessageWithSender;
        onMessageRef.current?.(message);
        // Clear typing indicator when a message is received
        setIsOtherTyping(false);
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError(new Error("Connection lost"));
      eventSource.close();
    };

    return () => {
      eventSource.close();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId, reconnectTrigger]);

  const reconnect = useCallback(() => {
    setReconnectTrigger((prev) => prev + 1);
  }, []);

  // Send typing status (throttled to every 3 seconds)
  const sendTyping = useCallback(() => {
    if (!conversationId) return;

    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;

    fetch(`/api/conversations/${conversationId}/typing`, {
      method: "POST",
    }).catch(() => {
      // Ignore typing notification errors
    });
  }, [conversationId]);

  return {
    isConnected,
    error,
    reconnect,
    sendTyping,
    isOtherTyping,
  };
}
