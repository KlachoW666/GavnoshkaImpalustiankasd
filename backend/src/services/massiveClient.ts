/**
 * Massive.com (Polygon) REST client — свечи и снапшот для рыночных данных.
 * Интервал запросов из config (по умолчанию 0.25 сек = 4 запроса/с) — стакан, объём, график, перекупленность и прочие данные обновляются каждые 0.25 с.
 * Учётные данные только из config (env); не хранить ключи в коде.
 */

import { config } from '../config';
import { logger } from '../lib/logger';
import type { OHLCVCandle } from '../types/candle';

const TF_TO_MULTIPLIER_TIMESPAN: Record<string, { multiplier: number; timespan: string }> = {
  '1m': { multiplier: 1, timespan: 'minute' },
  '5m': { multiplier: 5, timespan: 'minute' },
  '15m': { multiplier: 15, timespan: 'minute' },
  '1h': { multiplier: 1, timespan: 'hour' },
  '4h': { multiplier: 4, timespan: 'hour' },
  '1d': { multiplier: 1, timespan: 'day' }
};

let lastRequestAt = 0;

function getMinIntervalMs(): number {
  const rps = Math.max(1, config.massive.rateLimitPerSecond);
  return Math.floor(1000 / rps);
}

async function throttle(): Promise<void> {
  const minIntervalMs = getMinIntervalMs();
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < minIntervalMs) {
    await new Promise((r) => setTimeout(r, minIntervalMs - elapsed));
  }
  lastRequestAt = Date.now();
}

function getBaseUrl(): string {
  const url = config.massive.baseUrl.replace(/\/$/, '');
  return url || 'https://api.polygon.io';
}

async function request<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const apiKey = config.massive.apiKey?.trim();
  if (!apiKey) {
    throw new Error('MASSIVE_API_KEY is not set. Set it in .env (e.g. MASSIVE_API_KEY=your-key).');
  }
  await throttle();
  const base = getBaseUrl();
  const search = new URLSearchParams();
  search.set('apiKey', apiKey);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') search.set(k, String(v));
    }
  }
  const url = `${base}${path}?${search.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    logger.warn('MassiveClient', 'API error', { path, status: res.status, body: text.slice(0, 200) });
    throw new Error(`Massive API ${res.status}: ${text.slice(0, 100)}`);
  }
  return res.json() as Promise<T>;
}

/** Custom Bars (OHLC): GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to} */
export async function getAggs(
  ticker: string,
  timeframe: string,
  fromMs: number,
  toMs: number,
  limit = 5000
): Promise<OHLCVCandle[]> {
  const { multiplier, timespan } = TF_TO_MULTIPLIER_TIMESPAN[timeframe] ?? { multiplier: 15, timespan: 'minute' };
  const path = `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${fromMs}/${toMs}`;
  const data = await request<{ results?: Array<{ t?: number; o?: number; h?: number; l?: number; c?: number; v?: number }> }>(
    path,
    { limit }
  );
  const results = data.results ?? [];
  return results
    .map((r) => ({
      timestamp: Number(r.t ?? 0),
      open: Number(r.o ?? 0),
      high: Number(r.h ?? 0),
      low: Number(r.l ?? 0),
      close: Number(r.c ?? 0),
      volume: Number(r.v ?? 0)
    }))
    .filter((c) => c.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Full Market Snapshot (crypto): GET /v2/snapshot/locale/global/markets/crypto/tickers */
export async function getSnapshotV2(
  tickers: string[]
): Promise<Array<{ ticker: string; day?: { o: number; h: number; l: number; c: number; v: number }; lastTrade?: { p: number }; min?: { c: number } }>> {
  const list = tickers.length ? tickers.join(',') : undefined;
  const data = await request<{ tickers?: Array<{ ticker: string; day?: { o: number; h: number; l: number; c: number; v: number }; lastTrade?: { p: number }; min?: { c: number } }> }>(
    '/v2/snapshot/locale/global/markets/crypto/tickers',
    list ? { tickers: list } : undefined
  );
  return data.tickers ?? [];
}

/** Unified Snapshot (last_quote = best bid/ask): GET /v3/snapshot, type=crypto. REST не отдаёт полный L2 стакан — только лучший bid/ask. */
export async function getSnapshotV3(
  tickers: string[]
): Promise<
  Array<{
    ticker: string;
    last_quote?: { bid?: number; ask?: number; bid_size?: number; ask_size?: number };
    last_trade?: { price?: number };
  }>
> {
  if (!tickers.length) return [];
  const data = await request<{
    results?: Array<{
      ticker: string;
      last_quote?: { bid?: number; ask?: number; bid_size?: number; ask_size?: number };
      last_trade?: { price?: number };
    }>;
  }>('/v3/snapshot', {
    'ticker.any_of': tickers.join(','),
    type: 'crypto'
  });
  return data.results ?? [];
}

/** Стакан: по Massive/Polygon REST доступен только лучший bid/ask (last_quote). Возвращаем один уровень. */
export async function getOrderBookFromSnapshot(
  ticker: string
): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
  const list = await getSnapshotV3([ticker]);
  const item = list.find((r) => r.ticker === ticker);
  const b = item?.last_quote?.bid ?? 0;
  const a = item?.last_quote?.ask ?? 0;
  const bSize = item?.last_quote?.bid_size ?? 0.01;
  const aSize = item?.last_quote?.ask_size ?? 0.01;
  const bids: [number, number][] = b > 0 ? [[b, bSize]] : [];
  const asks: [number, number][] = a > 0 ? [[a, aSize]] : [];
  return { bids, asks };
}
