/**
 * OKX WebSocket — стакан и сделки (публичные данные)
 * С автопереподключением при разрыве
 */
import WebSocket from 'ws';
import { toOkxInstId, normalizeSymbol } from '../lib/symbol';
import { logger } from '../lib/logger';

const OKX_WS = 'wss://ws.okx.com:8443/ws/v5/public';
const RECONNECT_DELAY_MS = 3000;
const PING_INTERVAL_MS = 25000;

type Handler = (data: unknown) => void;

export function createOkxStream(symbol: string) {
  const norm = normalizeSymbol(symbol);
  const instId = toOkxInstId(symbol);
  let ws: WebSocket | null = null;
  const subs = { orderbook: new Set<Handler>(), trade: new Set<Handler>() };
  let refCount = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  function safeSend(socket: WebSocket | null, data: string) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(data);
  }

  function clearTimers() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function connect() {
    if (refCount <= 0) return;
    if (ws?.readyState === WebSocket.OPEN) return;
    if (ws?.readyState === WebSocket.CONNECTING) return;

    ws = new WebSocket(OKX_WS);

    ws.on('open', () => {
      clearTimers();
      const args: object[] = [];
      if (subs.orderbook.size) args.push({ channel: 'books5', instId });
      if (subs.trade.size) args.push({ channel: 'trades', instId });
      if (args.length) safeSend(ws, JSON.stringify({ op: 'subscribe', args }));
      pingTimer = setInterval(() => safeSend(ws, JSON.stringify({ op: 'ping' })), PING_INTERVAL_MS);
    });

    ws.on('message', (data: Buffer) => {
      try {
        const json = JSON.parse(data.toString());
        if (json.event === 'subscribe' || json.event === 'error') return;
        const arg = json.arg || {};
        const dataArr = json.data || [];
        if (arg.channel === 'books5' && dataArr[0]) {
          const d = dataArr[0];
          const bids = (d.bids || []).map((b: string[]) => [Number(b[0]), Number(b[1])]);
          const asks = (d.asks || []).map((a: string[]) => [Number(a[0]), Number(a[1])]);
          subs.orderbook.forEach((cb) => cb({ bids, asks }));
        } else if (arg.channel === 'trades' && dataArr.length) {
          for (const t of dataArr) {
            const trade = {
              price: Number(t.px ?? t.price),
              amount: Number(t.sz ?? t.size ?? t.qty ?? 0),
              time: Number(t.ts ?? t.time ?? Date.now()),
              isBuy: (t.side ?? t.buy ?? '') === 'buy'
            };
            subs.trade.forEach((cb) => cb(trade));
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on('close', () => {
      ws = null;
      clearTimers();
      if (refCount > 0) {
        reconnectTimer = setTimeout(() => {
          logger.debug('OKX-WS', `Reconnecting ${norm}`);
          connect();
        }, RECONNECT_DELAY_MS);
      }
    });
    ws.on('error', (err) => {
      logger.warn('OKX-WS', 'WebSocket error', { symbol: norm, error: (err as Error).message });
    });
  }

  function subscribe(type: 'orderbook' | 'trade', cb: Handler): () => void {
    subs[type].add(cb);
    refCount++;
    connect();
    return () => {
      subs[type].delete(cb);
      refCount--;
      if (refCount <= 0 && ws) {
        ws.close();
        ws = null;
      }
    };
  }

  return { subscribe, symbol: norm };
}

const streamCache = new Map<string, ReturnType<typeof createOkxStream>>();

export function getOkxStream(symbol: string) {
  const key = normalizeSymbol(symbol) || 'BTC-USDT';
  if (!streamCache.has(key)) streamCache.set(key, createOkxStream(symbol));
  return streamCache.get(key)!;
}
