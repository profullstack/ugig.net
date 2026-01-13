"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { MessageWithSender } from "@/types";

interface UseMessageStreamOptions {
  onMessage?: (message: MessageWithSender) => void;
}

interface UseMessageStreamReturn {
  isConnected: boolean;
  error: Error | null;
  reconnect: () => void;
}

export function useMessageStream(
  conversationId: string | null,
  options: UseMessageStreamOptions = {}
): UseMessageStreamReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const { onMessage } = options;

  // Store callback in ref to avoid stale closures
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

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
    };
  }, [conversationId, reconnectTrigger]);

  const reconnect = useCallback(() => {
    setReconnectTrigger((prev) => prev + 1);
  }, []);

  return {
    isConnected,
    error,
    reconnect,
  };
}
