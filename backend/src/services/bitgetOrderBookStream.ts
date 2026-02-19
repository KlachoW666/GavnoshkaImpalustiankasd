/**
 * Bitget WebSocket — поток стакана (глубина) для real-time обновлений (150ms по умолчанию для books15).
 * Снижает нагрузку на REST: стакан берётся из потока при наличии подписки.
 */

import WebSocket from 'ws';
import { logger } from '../lib/logger';
import { toBitgetInstId } from '../lib/symbol';

const WS_URL = 'wss://ws.bitget.com/v2/ws/public';
const PING_INTERVAL_MS = 25_000;
const MAX_SUBSCRIPTIONS = 40;

export interface OrderBookSnapshot {
  bids: [number, number][];
  asks: [number, number][];
  ts: number;
}

type Resolve = (value: void) => void;
let ws: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
const cache = new Map<string, OrderBookSnapshot>();
const subscribed = new Set<string>();
let connectPromise: Promise<void> | null = null;
let resolveConnect: Resolve | null = null;

function parseLevels(arr: [string, string][] | undefined): [number, number][] {
  if (!Array.isArray(arr)) return [];
  return arr.map(([p, a]) => [Number(p), Number(a)] as [number, number]).filter(([p, a]) => Number.isFinite(p) && Number.isFinite(a));
}

function ensureConnected(): Promise<void> {
  if (ws?.readyState === WebSocket.OPEN) return Promise.resolve();
  if (connectPromise) return connectPromise as Promise<void>;
  connectPromise = new Promise<void>((resolve) => {
    resolveConnect = resolve;
  });
  try {
    ws = new WebSocket(WS_URL);
    ws.on('open', () => {
      logger.info('BitgetOrderBookStream', 'WebSocket connected');
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ op: 'ping' }));
          } catch (_) { /* ignore */ }
        }
      }, PING_INTERVAL_MS);
      resolveConnect?.();
      resolveConnect = null;
      connectPromise = null;
    });
    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'pong' || msg.op === 'pong') return;
        if (msg.event === 'subscribe' && msg.arg?.instId) return;
        const arg = msg.arg;
        const action = msg.action;
        const payload = msg.data?.[0];
        if (!arg?.instId || !payload) return;
        const instId = arg.instId as string;
        const bids = parseLevels(payload.bids);
        const asks = parseLevels(payload.asks);
        const ts = Number(payload.ts ?? msg.ts ?? Date.now());
        if (bids.length > 0 || asks.length > 0) {
          cache.set(instId, { bids, asks, ts });
        }
      } catch (_) { /* ignore parse errors */ }
    });
    ws.on('close', () => {
      ws = null;
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      connectPromise = null;
      logger.warn('BitgetOrderBookStream', 'WebSocket closed, will reconnect on next use');
    });
    ws.on('error', (err) => {
      logger.warn('BitgetOrderBookStream', (err as Error).message);
    });
  } catch (err) {
    logger.warn('BitgetOrderBookStream', (err as Error).message);
    connectPromise = null;
    resolveConnect?.();
  }
  return connectPromise ?? Promise.resolve();
}

function subscribe(instId: string): void {
  if (subscribed.has(instId) || subscribed.size >= MAX_SUBSCRIPTIONS) return;
  if (ws?.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({
      op: 'subscribe',
      args: [{ instType: 'USDT-FUTURES', channel: 'books15', instId }]
    }));
    subscribed.add(instId);
  } catch (err) {
    logger.warn('BitgetOrderBookStream', `Subscribe ${instId} failed`, { error: (err as Error).message });
  }
}

/**
 * Получить последний снимок стакана по символу (из потока).
 * Символ в формате BTC-USDT или BTCUSDT.
 * Возвращает null, если подписки нет или данных ещё не было.
 */
export function getOrderBookFromStream(symbol: string): OrderBookSnapshot | null {
  const instId = symbol.includes('-') ? toBitgetInstId(symbol) : symbol.toUpperCase();
  return cache.get(instId) ?? null;
}

/**
 * Подписаться на стакан по символу и дождаться первого снимка (или таймаута).
 * Символ в формате BTC-USDT.
 */
export async function subscribeAndGetOrderBook(symbol: string, timeoutMs = 5000): Promise<OrderBookSnapshot | null> {
  const instId = toBitgetInstId(symbol);
  await ensureConnected();
  if (cache.has(instId)) return cache.get(instId) ?? null;
  subscribe(instId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = cache.get(instId);
    if (snap) return snap;
    await new Promise((r) => setTimeout(r, 150));
  }
  return cache.get(instId) ?? null;
}

/**
 * Подписаться на стакан по списку символов (без ожидания данных).
 */
export async function subscribeSymbols(symbols: string[]): Promise<void> {
  await ensureConnected();
  for (const sym of symbols) {
    const instId = sym.includes('-') ? toBitgetInstId(sym) : sym.toUpperCase();
    subscribe(instId);
  }
}
