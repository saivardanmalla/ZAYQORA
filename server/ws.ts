import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken } from './auth.ts';

interface TrackedClient {
  ws: WebSocket;
  rooms: Set<string>;
  userId?: string;
  roleCode?: string;
  restaurantId?: string | null;
}

const clients = new Set<TrackedClient>();

export function setupWebSocketServer(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const client: TrackedClient = {
      ws,
      rooms: new Set(),
    };

    try {
      const url = new URL(req.url || '/ws', 'http://localhost');
      const token = url.searchParams.get('token');
      const publicOrderId = url.searchParams.get('orderId');

      if (token) {
        const claims = verifyToken(token);
        client.userId = claims.userId;
        client.roleCode = claims.roleCode;
        client.restaurantId = claims.restaurantId;

        if (claims.roleCode === 'PLATFORM_SUPER_ADMIN') {
          client.rooms.add('admin:platform');
        }
        if (claims.restaurantId) {
          client.rooms.add(`tenant:${claims.restaurantId}`);
        }
      }

      if (publicOrderId) {
        client.rooms.add(`order:${publicOrderId}`);
      }
    } catch {
      // Allow public order room subscription even if optional token expired
    }

    clients.add(client);

    ws.send(
      JSON.stringify({
        type: 'ws:connected',
        rooms: Array.from(client.rooms),
        timestamp: new Date().toISOString(),
      })
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; orderId?: string; token?: string };
        if (msg.type === 'subscribe:order' && msg.orderId) {
          client.rooms.add(`order:${msg.orderId}`);
        } else if (msg.type === 'auth' && msg.token) {
          const claims = verifyToken(msg.token);
          client.userId = claims.userId;
          client.roleCode = claims.roleCode;
          client.restaurantId = claims.restaurantId;
          if (claims.roleCode === 'PLATFORM_SUPER_ADMIN') {
            client.rooms.add('admin:platform');
          }
          if (claims.restaurantId) {
            client.rooms.add(`tenant:${claims.restaurantId}`);
          }
        }
      } catch {
        // Ignore malformed client messages
      }
    });

    ws.on('close', () => {
      clients.delete(client);
    });
  });

  // Heartbeat keep-alive
  setInterval(() => {
    for (const c of clients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.ping();
      }
    }
  }, 30000);
}

export function broadcastToTenant(restaurantId: string, event: string, payload: unknown): void {
  const room = `tenant:${restaurantId}`;
  const serialized = JSON.stringify({
    type: event,
    restaurantId,
    payload,
    timestamp: new Date().toISOString(),
  });
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN && (c.rooms.has(room) || c.rooms.has('admin:platform'))) {
      c.ws.send(serialized);
    }
  }
}

export function broadcastToOrder(orderId: string, event: string, payload: unknown): void {
  const room = `order:${orderId}`;
  const serialized = JSON.stringify({
    type: event,
    orderId,
    payload,
    timestamp: new Date().toISOString(),
  });
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN && c.rooms.has(room)) {
      c.ws.send(serialized);
    }
  }
}

export function broadcastToPlatformAdmin(event: string, payload: unknown): void {
  const serialized = JSON.stringify({
    type: event,
    payload,
    timestamp: new Date().toISOString(),
  });
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN && c.rooms.has('admin:platform')) {
      c.ws.send(serialized);
    }
  }
}
