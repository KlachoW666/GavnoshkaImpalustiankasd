/**
 * Massive.com — рыночные данные через REST (fetch). Без @massive.com/client-js (ESM-only).
 * Свечи (/v2/aggs), снапшот тикера (/v2/snapshot/.../crypto/tickers), стакан — синтетика из цены при отсутствии book API.
 * Лимит запросов из config (0.25 с = 4/с). Документация: https://massive.com/docs/rest/quickstart
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
  // Ключи из massive.com (ClabX) работают только с api.massive.com; Polygon.io — с api.polygon.io
  return (config.massive.baseUrl || 'https://api.massive.com').replace(/\/$/, '');
}

function getApiKey(): string {
  const apiKey = config.massive.apiKey?.trim();
  if (!apiKey) {
    throw new Error('MASSIVE_API_KEY is not set. Set it in .env (Dashboard → Accessing the API).');
  }
  return apiKey;
}

async function massiveFetch(path: string, searchParams?: Record<string, string>): Promise<unknown> {
  await throttle();
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const url = new URL(path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`);
  url.searchParams.set('apiKey', apiKey);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v != null && v !== '') url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-API-Key': apiKey,
      Accept: 'application/json'
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const isUnknownKey = res.status === 401 && typeof body === 'object' && body !== null && String((body as { error?: string }).error).includes('Unknown API Key');
    const isPlanLimit = res.status === 403 && typeof body === 'object' && body !== null && String((body as { status?: string; message?: string }).message || '').includes('not entitled');
    const isRateLimit = res.status === 429;
    if (isUnknownKey || isPlanLimit || isRateLimit) {
      logger.debug('MassiveClient', isUnknownKey ? 'API 401 Unknown API Key — используйте ключ от massive.com и MASSIVE_API_BASE_URL=https://api.massive.com или от polygon.io и MASSIVE_API_BASE_URL=https://api.polygon.io; DataAggregator переключится на Bitget' : isRateLimit ? 'API 429 rate limit, DataAggregator backoff 10min' : 'API 403 plan limit, DataAggregator will use Bitget', { path: url.pathname });
    } else {
      logger.warn('MassiveClient', 'API error', {
        path: url.pathname,
        status: res.status,
        body: typeof body === 'object' ? JSON.stringify(body) : String(body)
      });
    }
    if (isUnknownKey) {
      throw new Error(
        'Massive API 401 Unknown API Key. For massive.com keys use MASSIVE_API_BASE_URL=https://api.massive.com and MASSIVE_API_KEY from massive.com dashboard (Accessing the API). Restart app after changing .env.'
      );
    }
    const msg = typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error?: string }).error)
      : res.statusText;
    throw new Error(`Massive API ${res.status}: ${typeof body === 'object' ? JSON.stringify(body) : msg}`);
  }
  return body;
}

/** Custom Bars (OHLC) — GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to} */
export async function getAggs(
  ticker: string,
  timeframe: string,
  fromMs: number,
  toMs: number,
  limit = 5000
): Promise<OHLCVCandle[]> {
  const { multiplier, timespan } = TF_TO_MULTIPLIER_TIMESPAN[timeframe] ?? { multiplier: 15, timespan: 'minute' };
  const path = `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${fromMs}/${toMs}`;
  const data = await massiveFetch(path, { limit: String(limit) }) as {
    results?: Array<{ t?: number; o?: number; h?: number; l?: number; c?: number; v?: number }>;
  };
  const results = data?.results ?? [];
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

/** Стакан L2: Massive crypto snapshot не отдаёт book — строим синтетику из цены снапшота тикера. */
export async function getOrderBookFromSnapshot(
  ticker: string
): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
  const tickerSnap = await getCryptoSnapshotTicker(ticker);
  const price = tickerSnap?.lastTrade?.p ?? tickerSnap?.min?.c ?? tickerSnap?.day?.c ?? 0;
  if (price <= 0) return { bids: [], asks: [] };
  return {
    bids: [[price * 0.999, 0.01]],
    asks: [[price * 1.001, 0.01]]
  };
}

/** Снапшот одного тикера — GET /v2/snapshot/locale/global/markets/crypto/tickers/{ticker} */
export async function getCryptoSnapshotTicker(ticker: string): Promise<{
  ticker?: string;
  day?: { o: number; h: number; l: number; c: number; v: number };
  lastTrade?: { p: number };
  min?: { c: number };
} | null> {
  const path = `/v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent(ticker)}`;
  const data = await massiveFetch(path) as {
    ticker?: { day?: { o: number; h: number; l: number; c: number; v: number }; lastTrade?: { p: number }; min?: { c: number } };
  };
  return data?.ticker ?? null;
}

// --- Stocks (https://massive.com/stocks) ---

/** Снапшот одного тикера акций — GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker} */
export async function getStocksSnapshotTicker(ticker: string): Promise<{
  ticker?: string;
  day?: { o: number; h: number; l: number; c: number; v: number };
  lastTrade?: { p: number };
  min?: { c: number };
  prevDay?: { c: number };
} | null> {
  const path = `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`;
  const data = await massiveFetch(path) as {
    ticker?: { day?: { o: number; h: number; l: number; c: number; v: number }; lastTrade?: { p: number }; min?: { c: number }; prevDay?: { c: number } };
  };
  return data?.ticker ?? null;
}

/** Свечи для акций — тот же /v2/aggs, тикер без префикса (например AAPL). */
export async function getStocksAggs(
  ticker: string,
  timeframe: string,
  fromMs: number,
  toMs: number,
  limit = 5000
): Promise<OHLCVCandle[]> {
  return getAggs(ticker, timeframe, fromMs, toMs, limit);
}

// --- Options (https://massive.com/options) ---

/** Снапшот опционной цепочки по базовому активу — GET /v3/snapshot/options/{underlyingAsset} */
export async function getOptionChainSnapshot(underlyingTicker: string, params?: {
  strike_price?: string;
  expiration_date?: string;
  contract_type?: 'call' | 'put';
  limit?: number;
}): Promise<{ results?: Array<Record<string, unknown>> }> {
  const path = `/v3/snapshot/options/${encodeURIComponent(underlyingTicker)}`;
  const searchParams: Record<string, string> = {};
  if (params?.strike_price) searchParams.strike_price = params.strike_price;
  if (params?.expiration_date) searchParams.expiration_date = params.expiration_date;
  if (params?.contract_type) searchParams.contract_type = params.contract_type;
  if (params?.limit != null) searchParams.limit = String(Math.min(250, params.limit));
  const data = await massiveFetch(path, Object.keys(searchParams).length ? searchParams : undefined) as { results?: Array<Record<string, unknown>> };
  return data ?? { results: [] };
}

/** Список контрактов опционов — GET /v3/reference/options/contracts */
export async function getOptionsContracts(params: {
  underlying_ticker?: string;
  expiration_date?: string;
  expiration_date_gte?: string;
  expiration_date_lte?: string;
  strike_price?: number;
  contract_type?: 'call' | 'put';
  expired?: boolean;
  limit?: number;
}): Promise<{ results?: Array<Record<string, unknown>>; next_url?: string }> {
  const path = '/v3/reference/options/contracts';
  const searchParams: Record<string, string> = {};
  if (params.underlying_ticker) searchParams.underlying_ticker = params.underlying_ticker;
  if (params.expiration_date) searchParams.expiration_date = params.expiration_date;
  if (params.expiration_date_gte) searchParams['expiration_date.gte'] = params.expiration_date_gte;
  if (params.expiration_date_lte) searchParams['expiration_date.lte'] = params.expiration_date_lte;
  if (params.strike_price != null) searchParams.strike_price = String(params.strike_price);
  if (params.contract_type) searchParams.contract_type = params.contract_type;
  if (params.expired != null) searchParams.expired = String(params.expired);
  if (params.limit != null) searchParams.limit = String(Math.min(1000, params.limit));
  const data = await massiveFetch(path, searchParams) as { results?: Array<Record<string, unknown>>; next_url?: string };
  return data ?? { results: [] };
}
