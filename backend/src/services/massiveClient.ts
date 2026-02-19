/**
 * Massive.com — рыночные данные через официальный клиент @massive.com/client-js.
 * Свечи (getCryptoAggregates), стакан (getCryptoSnapshotTickerBook). Лимит запросов из config (0.25 с = 4/с).
 * Работаем только с Massive; fallback на Bitget не используем.
 * Документация: https://github.com/massive-com/client-js
 */

import { restClient, GetCryptoAggregatesTimespanEnum } from '@massive.com/client-js';
import { config } from '../config';
import { logger } from '../lib/logger';
import type { OHLCVCandle } from '../types/candle';

const TF_TO_MULTIPLIER_TIMESPAN: Record<string, { multiplier: number; timespan: GetCryptoAggregatesTimespanEnum }> = {
  '1m': { multiplier: 1, timespan: GetCryptoAggregatesTimespanEnum.Minute },
  '5m': { multiplier: 5, timespan: GetCryptoAggregatesTimespanEnum.Minute },
  '15m': { multiplier: 15, timespan: GetCryptoAggregatesTimespanEnum.Minute },
  '1h': { multiplier: 1, timespan: GetCryptoAggregatesTimespanEnum.Hour },
  '4h': { multiplier: 4, timespan: GetCryptoAggregatesTimespanEnum.Hour },
  '1d': { multiplier: 1, timespan: GetCryptoAggregatesTimespanEnum.Day }
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

function getRest(): ReturnType<typeof restClient> {
  const apiKey = config.massive.apiKey?.trim();
  if (!apiKey) {
    throw new Error('MASSIVE_API_KEY is not set. Set it in .env (Dashboard → Accessing the API).');
  }
  const baseUrl = (config.massive.baseUrl || 'https://api.massive.com').replace(/\/$/, '');
  return restClient(apiKey, baseUrl);
}

/** Custom Bars (OHLC) через официальный клиент. */
export async function getAggs(
  ticker: string,
  timeframe: string,
  fromMs: number,
  toMs: number,
  limit = 5000
): Promise<OHLCVCandle[]> {
  await throttle();
  const { multiplier, timespan } = TF_TO_MULTIPLIER_TIMESPAN[timeframe] ?? { multiplier: 15, timespan: GetCryptoAggregatesTimespanEnum.Minute };
  const rest = getRest();
  const response = await rest.getCryptoAggregates({
    cryptoTicker: ticker,
    multiplier,
    timespan,
    from: String(fromMs),
    to: String(toMs),
    limit
  });
  const results = (response as { results?: Array<{ t?: number; o?: number; h?: number; l?: number; c?: number; v?: number }> }).results ?? [];
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

/** Стакан L2 по тикеру (официальный клиент: deprecatedGetCryptoSnapshotTickerBook). */
export async function getOrderBookFromSnapshot(
  ticker: string
): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
  await throttle();
  const rest = getRest();
  try {
    const response = await rest.deprecatedGetCryptoSnapshotTickerBook({ ticker });
    const data = (response as { data?: { bids?: Array<{ p?: number; x?: Record<string, number> }>; asks?: Array<{ p?: number; x?: Record<string, number> }> } }).data;
    const sizeAt = (x: Record<string, number> | undefined): number =>
      x && typeof x === 'object' ? Object.values(x).reduce((s, v) => s + Number(v || 0), 0) : 0.01;
    const bids: [number, number][] = (data?.bids ?? []).map((b) => [Number(b.p ?? 0), sizeAt(b.x)] as [number, number]).filter(([p]) => p > 0);
    const asks: [number, number][] = (data?.asks ?? []).map((a) => [Number(a.p ?? 0), sizeAt(a.x)] as [number, number]).filter(([p]) => p > 0);
    return { bids, asks };
  } catch (e) {
    const msg = (e as Error).message;
    logger.warn('MassiveClient', 'Snapshot book failed, using ticker snapshot', { ticker, error: msg });
    const tickerSnap = await rest.getCryptoSnapshotTicker({ ticker });
    const t = (tickerSnap as { ticker?: { lastTrade?: { p?: number }; min?: { c?: number } } }).ticker;
    const price = t?.lastTrade?.p ?? t?.min?.c ?? 0;
    if (price <= 0) return { bids: [], asks: [] };
    return { bids: [[price * 0.999, 0.01]], asks: [[price * 1.001, 0.01]] };
  }
}

/** Снапшот одного тикера (day, min, lastTrade) для цены/объёма. */
export async function getCryptoSnapshotTicker(ticker: string): Promise<{ ticker?: string; day?: { o: number; h: number; l: number; c: number; v: number }; lastTrade?: { p: number }; min?: { c: number } } | null> {
  await throttle();
  const rest = getRest();
  const response = await rest.getCryptoSnapshotTicker({ ticker });
  return (response as { ticker?: { day?: { o: number; h: number; l: number; c: number; v: number }; lastTrade?: { p: number }; min?: { c: number } } }).ticker ?? null;
}
