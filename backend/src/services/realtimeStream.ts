import WebSocket from 'ws';
import { DataAggregator } from './dataAggregator';
import { toOkxInstId, normalizeSymbol } from '../lib/symbol';
import { logger } from '../lib/logger';

const OKX_WS = 'wss://ws.okx.com:8443/ws/v5/public';
const aggregator = new DataAggregator();

function toOkxChannel(tf: string): string {
  const map: Record<string, string> = {
    '1m': 'candle1m', '5m': 'candle5m', '15m': 'candle15m',
    '1h': 'candle1H', '4h': 'candle4H', '1d': 'candle1D'
  };
  return map[tf] || 'candle1m';
}

export interface CandleUpdate {
  symbol: string;
  timeframe: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed?: boolean;
}

type CandleCallback = (candle: CandleUpdate) => void;

const subscriptions = new Map<string, { ws: WebSocket; refCount: number }>();
const callbacks = new Map<string, Set<CandleCallback>>();

function subKey(symbol: string, timeframe: string): string {
  return `${normalizeSymbol(symbol).toUpperCase()}_${timeframe}`;
}

function connectOkx(symbol: string, timeframe: string): WebSocket {
  const sym = normalizeSymbol(symbol);
  const instId = toOkxInstId(symbol);
  const channel = toOkxChannel(timeframe);

  const ws = new WebSocket(OKX_WS);

  function safeSend(data: string) {
    if (ws.readyState === 1) ws.send(data);
  }

  ws.on('open', () => {
    safeSend(JSON.stringify({ op: 'subscribe', args: [{ channel, instId }] }));
  });

  ws.on('message', (data: Buffer) => {
    try {
      const json = JSON.parse(data.toString());
      if (json.event) return;
      const arr = json.data || [];
      if (arr.length === 0) return;
      const k = arr[0];
      const vals = Array.isArray(k) ? k : [k.ts, k.o, k.h, k.l, k.c, k.vol];
      const candle: CandleUpdate = {
        symbol: sym,
        timeframe,
        timestamp: Number(vals[0] ?? 0) || 0,
        open: Number(vals[1] ?? k?.o ?? 0) || 0,
        high: Number(vals[2] ?? k?.h ?? 0) || 0,
        low: Number(vals[3] ?? k?.l ?? 0) || 0,
        close: Number(vals[4] ?? k?.c ?? 0) || 0,
        volume: Number(vals[5] ?? k?.vol ?? 0) || 0,
        isClosed: (k?.confirm ?? vals[8]) === '1'
      };
      const key = subKey(symbol, timeframe);
      callbacks.get(key)?.forEach(cb => cb(candle));
    } catch {
      // ignore
    }
  });

  ws.on('error', () => {});
  ws.on('close', () => {
    const key = subKey(symbol, timeframe);
    const sub = subscriptions.get(key);
    if (sub) {
      sub.refCount--;
      if (sub.refCount <= 0) {
        subscriptions.delete(key);
      }
    }
  });

  return ws;
}

function startMockStream(symbol: string, timeframe: string, callback: CandleCallback): () => void {
  const sym = normalizeSymbol(symbol).toUpperCase();
  const tfMs: Record<string, number> = {
    '1m': 60000, '5m': 300000, '15m': 900000,
    '1h': 3600000, '4h': 14400000, '1d': 86400000
  };
  const interval = tfMs[timeframe] || 60000;
  let currentOpen = 0;

  const tick = () => {
    aggregator.getOHLCV(sym, timeframe, 2).then((candles) => {
      if (candles.length > 0) {
        const c = candles[candles.length - 1];
        const now = Math.floor(Date.now() / interval) * interval;
        const change = (Math.random() - 0.5) * c.close * 0.0005;
        const newClose = currentOpen > 0 ? currentOpen + change : c.close + change;
        if (currentOpen === 0) currentOpen = c.open;
        const high = Math.max(currentOpen, newClose) * (1 + Math.random() * 0.0002);
        const low = Math.min(currentOpen, newClose) * (1 - Math.random() * 0.0002);
        callback({
          symbol: sym,
          timeframe,
          timestamp: now,
          open: currentOpen,
          high,
          low,
          close: newClose,
          volume: c.volume * (0.9 + Math.random() * 0.2)
        });
      }
    }).catch(() => {});
  };

  tick();
  const id = setInterval(tick, 2000);
  return () => clearInterval(id);
}

export function subscribeCandle(
  symbol: string,
  timeframe: string,
  callback: CandleCallback
): () => void {
  const key = subKey(symbol, timeframe);
  if (!callbacks.has(key)) {
    callbacks.set(key, new Set());
  }
  callbacks.get(key)!.add(callback);

  if (!subscriptions.has(key)) {
    try {
      const ws = connectOkx(symbol, timeframe);
      subscriptions.set(key, { ws, refCount: 1 });
    } catch (e) {
      logger.warn('RealtimeStream', 'OKX connect failed, using mock', { error: (e as Error).message });
      const unsubMock = startMockStream(symbol, timeframe, callback);
      subscriptions.set(key, { ws: { close: () => unsubMock() } as any, refCount: 1 });
    }
  } else {
    subscriptions.get(key)!.refCount++;
  }

  return () => {
    callbacks.get(key)?.delete(callback);
    if (callbacks.get(key)?.size === 0) {
      callbacks.delete(key);
      const sub = subscriptions.get(key);
      if (sub) {
        sub.ws.close();
        subscriptions.delete(key);
      }
    }
  };
}
