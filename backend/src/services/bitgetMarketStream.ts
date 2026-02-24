/**
 * Bitget WebSocket — свечи (kline) и тикер (last, volume) для снижения нагрузки на REST.
 * Одно соединение, подписки на candle1m/5m/15m/1H/4H/1D и ticker.
 */

import WebSocket from 'ws';
import { logger } from '../lib/logger';
import { toBitgetInstId } from '../lib/symbol';
import type { OHLCVCandle } from '../types/candle';

const WS_URL = 'wss://ws.bitget.com/v2/ws/public';
const PING_INTERVAL_MS = 25_000;
const RECONNECT_DELAY_MS = 3_000;
const MAX_CHANNELS = 48;
const CANDLE_CHANNELS = ['candle1m', 'candle5m', 'candle15m', 'candle1H', 'candle4H', 'candle1D'] as const;
const TF_TO_CHANNEL: Record<string, string> = {
  '1m': 'candle1m', '5m': 'candle5m', '15m': 'candle15m',
  '1h': 'candle1H', '4h': 'candle4H', '1d': 'candle1D'
};
const MAX_CANDLES_CACHED = 500;

export interface TickerSnapshot {
  last: number;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
  ts: number;
}

interface CandleCacheEntry {
  candles: OHLCVCandle[];
  ts: number;
}

let ws: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
const candleCache = new Map<string, CandleCacheEntry>();
const tickerCache = new Map<string, TickerSnapshot>();
const subscribedChannels = new Set<string>();
let connectPromise: Promise<void> | null = null;

function ensureConnected(): Promise<void> {
  if (ws?.readyState === WebSocket.OPEN) return Promise.resolve();
  if (connectPromise) return connectPromise;
  connectPromise = new Promise<void>((resolve) => {
    try {
      ws = new WebSocket(WS_URL);
      ws.on('open', () => {
        logger.info('BitgetMarketStream', 'WebSocket connected (candles+ticker)');
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ op: 'ping' })); } catch (_) { /* ignore */ }
          }
        }, PING_INTERVAL_MS);
        resolve();
        connectPromise = null;
      });
      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === 'pong' || msg.op === 'pong') return;
          if (msg.event === 'subscribe' && msg.arg?.instId) return;

          const arg = msg.arg;
          const channel = arg?.channel as string | undefined;
          const instId = arg?.instId as string | undefined;
          const payload = msg.data?.[0];
          if (!instId) return;

          if (channel?.startsWith('candle')) {
            const row = Array.isArray(payload) ? payload : payload?.candle ?? (payload && [payload.ts ?? payload[0], payload.o ?? payload.open ?? payload[1], payload.h ?? payload.high ?? payload[2], payload.l ?? payload.low ?? payload[3], payload.c ?? payload.close ?? payload[4], payload.vol ?? payload.volume ?? payload[5]]);
            if (row && row.length >= 5) {
              const ts = Number(row[0]);
              const open = Number(row[1]);
              const high = Number(row[2]);
              const low = Number(row[3]);
              const close = Number(row[4]);
              const volume = Number(row[5] ?? 0);
              if (!Number.isFinite(ts) || !Number.isFinite(close)) return;
              const key = `${instId}_${channel}`;
              let entry = candleCache.get(key);
              if (!entry) {
                entry = { candles: [], ts: Date.now() };
                candleCache.set(key, entry);
              }
              const arr = entry.candles;
              const idx = arr.findIndex((c) => c.timestamp === ts);
              const candle: OHLCVCandle = { timestamp: ts, open, high, low, close, volume };
              if (idx >= 0) {
                arr[idx] = candle;
              } else {
                arr.push(candle);
                arr.sort((a, b) => a.timestamp - b.timestamp);
                if (arr.length > MAX_CANDLES_CACHED) arr.shift();
              }
              entry.ts = Date.now();
            }
            return;
          }

          if (channel === 'ticker' && payload) {
            const last = Number(payload.last ?? payload.lastPr ?? payload.close);
            const vol = Number(payload.vol ?? payload.volume24h ?? payload.baseVolume ?? 0);
            const high24h = Number(payload.high24h ?? payload.high ?? 0);
            const low24h = Number(payload.low24h ?? payload.low ?? 0);
            if (Number.isFinite(last)) {
              tickerCache.set(instId, {
                last,
                volume24h: Number.isFinite(vol) ? vol : undefined,
                high24h: Number.isFinite(high24h) ? high24h : undefined,
                low24h: Number.isFinite(low24h) ? low24h : undefined,
                ts: Date.now()
              });
            }
          }
        } catch (_) { /* ignore */ }
      });
      ws.on('close', () => {
        ws = null;
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        connectPromise = null;
        const toResubscribe = Array.from(subscribedChannels);
        subscribedChannels.clear();
        logger.debug('BitgetMarketStream', 'WebSocket closed, reconnecting in 3s');
        setTimeout(() => {
          ensureConnected().then(() => {
            for (const key of toResubscribe) {
              const i = key.lastIndexOf('_');
              if (i > 0) subscribeChannel(key.slice(0, i), key.slice(i + 1));
            }
          }).catch(() => {});
        }, RECONNECT_DELAY_MS);
      });
      ws.on('error', (err) => logger.warn('BitgetMarketStream', (err as Error).message));
    } catch (err) {
      connectPromise = null;
      resolve();
    }
  });
  return connectPromise;
}

function channelKey(instId: string, channel: string): string {
  return `${instId}_${channel}`;
}

function subscribeChannel(instId: string, channel: string): void {
  const key = channelKey(instId, channel);
  if (subscribedChannels.has(key) || subscribedChannels.size >= MAX_CHANNELS) return;
  if (ws?.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({
      op: 'subscribe',
      args: [{ instType: 'USDT-FUTURES', channel, instId }]
    }));
    subscribedChannels.add(key);
  } catch (err) {
    logger.warn('BitgetMarketStream', `Subscribe ${channel} ${instId} failed`, { error: (err as Error).message });
  }
}

/**
 * Подписаться на свечи и тикер по списку символов (без ожидания данных).
 */
export async function subscribeMarketSymbols(symbols: string[]): Promise<void> {
  await ensureConnected();
  const instIds = new Set(symbols.map((s) => s.includes('-') ? toBitgetInstId(s) : s.toUpperCase()));
  for (const instId of instIds) {
    for (const ch of CANDLE_CHANNELS) subscribeChannel(instId, ch);
    subscribeChannel(instId, 'ticker');
  }
}

/**
 * Получить свечи из потока (если есть и свежие по ttlMs).
 */
export function getCandlesFromStream(symbol: string, timeframe: string, ttlMs: number): OHLCVCandle[] | null {
  const channel = TF_TO_CHANNEL[timeframe.toLowerCase()];
  if (!channel) return null;
  const instId = symbol.includes('-') ? toBitgetInstId(symbol) : symbol.toUpperCase();
  const key = channelKey(instId, channel);
  const entry = candleCache.get(key);
  if (!entry || entry.candles.length === 0) return null;
  if (Date.now() - entry.ts > ttlMs) return null;
  return entry.candles;
}

/**
 * Получить тикер из потока (last, volume24h).
 */
export function getTickerFromStream(symbol: string, ttlMs = 5_000): TickerSnapshot | null {
  const instId = symbol.includes('-') ? toBitgetInstId(symbol) : symbol.toUpperCase();
  const t = tickerCache.get(instId);
  if (!t || Date.now() - t.ts > ttlMs) return null;
  return t;
}
