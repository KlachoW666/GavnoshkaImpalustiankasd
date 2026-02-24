/**
 * Reusable WebSocket hook with exponential backoff reconnection.
 * Message routing by type; cleanup on unmount.
 */

import { useEffect, useRef, useCallback } from 'react';

function getWsUrl(): string {
  const apiBase =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) as string | undefined;
  const origin = apiBase ? new URL(apiBase).origin : `${location.protocol}//${location.host}`;
  return origin.replace(/^http/, 'ws') + '/ws';
}

export type WsMessageHandler = (data: unknown, type: string) => void;

export interface UseWebSocketOptions {
  /** Auth token — sent as { type: 'auth', token } on open */
  token: string | null;
  /** Called for each parsed message; type from msg.type, data from msg.data */
  onMessage?: WsMessageHandler;
  /** Max reconnection delay in ms */
  maxReconnectDelay?: number;
  /** Whether connection is enabled */
  enabled?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions): void {
  const { token, onMessage, maxReconnectDelay = 30_000, enabled = true } = options;
  const onMessageRef = useRef(onMessage);
  const reconnectAttemptRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!enabled) return;
    const url = getWsUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      if (token) ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type?: string; data?: unknown };
        const type = msg.type ?? 'message';
        const data = msg.data;
        onMessageRef.current?.(data, type);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (!enabled) return;
      const delay = Math.min(
        maxReconnectDelay,
        1000 * 2 ** Math.min(reconnectAttemptRef.current, 10)
      );
      reconnectAttemptRef.current += 1;
      timeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // close will trigger reconnect
    };
  }, [token, enabled, maxReconnectDelay]);

  useEffect(() => {
    connect();
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      reconnectAttemptRef.current = 0;
    };
  }, [connect]);
}
