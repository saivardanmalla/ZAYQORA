import { useEffect, useRef } from 'react';

const TOKEN_STORAGE_KEY = 'zayqora_jwt_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body as T;
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((cents || 0) / 100);
}

export interface WsMessage {
  type: string;
  restaurantId?: string;
  orderId?: string;
  payload?: unknown;
  timestamp?: string;
}

export function useZayqoraSocket(
  opts: { token?: string | null; orderId?: string | null; enabled?: boolean },
  onEvent: (msg: WsMessage) => void
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (opts.enabled === false) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams();
      if (opts.token) params.set('token', opts.token);
      if (opts.orderId) params.set('orderId', opts.orderId);
      const url = `${protocol}//${window.location.host}/ws?${params.toString()}`;
      ws = new WebSocket(url);

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as WsMessage;
          handlerRef.current(parsed);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!closed) {
          retryTimer = window.setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      ws?.close();
    };
  }, [opts.token, opts.orderId, opts.enabled]);
}
