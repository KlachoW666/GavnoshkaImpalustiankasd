import { WebSocketServer, WebSocket } from 'ws';
import { TradingSignal } from './types/signal';
import { addSignal } from './routes/signals';
import { subscribeCandle } from './services/realtimeStream';
import { getOkxStream } from './services/okxStream';
import { logger } from './lib/logger';
import { findSessionUserId } from './db/authDb';

const AUTH_TIMEOUT_MS = 5000;

type ExtWebSocket = WebSocket & { unsubCandles?: Map<string, () => void>; unsubStream?: () => void; userId?: string; authenticated?: boolean };

export function createWebSocketServer(server: import('http').Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: ExtWebSocket) => {
    ws.unsubCandles = new Map();
    ws.authenticated = false;
    logger.debug('WS', 'Client connected');

    const authTimer = setTimeout(() => {
      if (!ws.authenticated) {
        logger.warn('WS', 'Client did not authenticate within timeout, closing');
        ws.close(4001, 'Authentication required');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth' && msg.token) {
          const token = String(msg.token).trim();
          const userId = findSessionUserId(token);
          if (userId) {
            ws.userId = userId;
            ws.authenticated = true;
            clearTimeout(authTimer);
            ws.send(JSON.stringify({ type: 'auth', ok: true }));
          } else {
            ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'Invalid token' }));
          }
          return;
        }

        if (!ws.authenticated) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }

        if (msg.type === 'subscribe_candle' && msg.symbol && msg.timeframe) {
          const key = `${msg.symbol}_${msg.timeframe}`;
          if (ws.unsubCandles?.has(key)) return;
          const unsub = subscribeCandle(msg.symbol, msg.timeframe, (candle) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'candle', data: candle }));
          });
          ws.unsubCandles?.set(key, unsub);
        } else if (msg.type === 'unsubscribe_candle' && msg.symbol && msg.timeframe) {
          const key = `${msg.symbol}_${msg.timeframe}`;
          ws.unsubCandles?.get(key)?.();
          ws.unsubCandles?.delete(key);
        } else if (msg.type === 'subscribe_market' && msg.symbol) {
          ws.unsubStream?.();
          const stream = getOkxStream(msg.symbol);
          const unsubOb = stream.subscribe('orderbook', (ob) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'orderbook', data: ob }));
          });
          const unsubTr = stream.subscribe('trade', (tr) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'trade', data: tr }));
          });
          ws.unsubStream = () => {
            unsubOb();
            unsubTr();
          };
        } else if (msg.type === 'unsubscribe_market') {
          ws.unsubStream?.();
          ws.unsubStream = undefined;
        }
      } catch (err) {
        logger.warn('WS', `Message parse error: ${(err as Error).message}`);
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      ws.unsubCandles?.forEach((fn) => fn());
      ws.unsubCandles?.clear();
      ws.unsubStream?.();
      logger.debug('WS', 'Client disconnected');
    });
  });

  const broadcastSignal = (signal: TradingSignal, breakdown?: unknown, targetUserId?: string) => {
    addSignal(signal);
    if (targetUserId == null) return;
    const payload = breakdown ? { signal, breakdown } : signal;
    const msg = JSON.stringify({ type: 'signal', data: payload });
    wss.clients.forEach((c) => {
      if (c.readyState === 1 && (c as ExtWebSocket).userId === targetUserId) c.send(msg);
    });
  };
  const broadcastBreakout = (data: unknown) => {
    const msg = JSON.stringify({ type: 'BREAKOUT_ALERT', data });
    wss.clients.forEach((c) => {
      if (c.readyState === 1 && (c as ExtWebSocket).authenticated) c.send(msg);
    });
  };
  (global as any).__broadcastSignal = broadcastSignal;
  (global as any).__broadcastBreakout = broadcastBreakout;
  return { broadcastSignal, broadcastBreakout };
}

export function getBroadcastSignal(): ((s: TradingSignal, b?: unknown, targetUserId?: string) => void) | null {
  return (global as any).__broadcastSignal ?? null;
}

export function getBroadcastBreakout(): ((data: unknown) => void) | null {
  return (global as any).__broadcastBreakout ?? null;
}
