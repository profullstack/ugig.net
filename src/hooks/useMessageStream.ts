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
  const [connectedConversationId, setConnectedConversationId] = useState<
    string | null
  >(null);
  const [connectionError, setConnectionError] = useState<{
    conversationId: string;
    error: Error;
  } | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const [otherTypingState, setOtherTypingState] = useState({
    conversationId: null as string | null,
    isTyping: false,
  });
  const eventSourceRef = useRef<EventSource | null>(null);
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

  const isConnected =
    conversationId !== null && connectedConversationId === conversationId;
  const error =
    connectionError?.conversationId === conversationId
      ? connectionError.error
      : null;
  const isOtherTyping =
    conversationId !== null &&
    otherTypingState.conversationId === conversationId &&
    otherTypingState.isTyping;

  // Poll for typing status
  useEffect(() => {
    if (!conversationId || !isConnected) return;

    let cancelled = false;

    const pollTyping = async () => {
      try {
        const response = await fetch(`/api/conversations/${conversationId}/typing`);
        if (response.ok) {
          const data = await response.json();
          if (cancelled) return;

          const hasTyping = Boolean(data.typing?.length);
          setOtherTypingState({
            conversationId,
            isTyping: hasTyping,
          });
          onTypingChangeRef.current?.(hasTyping, data.typing?.[0]);
        }
      } catch {
        // Ignore polling errors
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollTyping, 2000);
    pollTyping(); // Initial poll

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId, isConnected]);

  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!conversationId) {
      return;
    }

    const eventSource = new EventSource(
      `/api/conversations/${conversationId}/stream`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnectedConversationId(conversationId);
      setConnectionError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as MessageWithSender;
        onMessageRef.current?.(message);
        // Clear typing indicator when a message is received
        setOtherTypingState({
          conversationId,
          isTyping: false,
        });
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    eventSource.onerror = () => {
      setConnectedConversationId(null);
      setConnectionError({
        conversationId,
        error: new Error("Connection lost"),
      });
      eventSource.close();
    };

    return () => {
      eventSource.close();
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
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
