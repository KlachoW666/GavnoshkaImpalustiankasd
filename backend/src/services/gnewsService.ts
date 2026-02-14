/**
 * GNews API — альтернатива CryptoPanic, новости по крипто-символам.
 * https://gnews.io/ — 80k+ источников, free tier 100 req/day.
 * Используется при недоступности CryptoPanic (ENOTFOUND, DNS).
 */

import { fetch as undiciFetch } from 'undici';
import { logger } from '../lib/logger';
import { symbolToCurrency } from './cryptopanicService';

const GNEWS_BASE = 'https://gnews.io/api/v4/search';
const REQUEST_TIMEOUT_MS = 20000;

/** Сопоставление тикеров с именами для поиска */
const TICKER_TO_NAME: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  XRP: 'Ripple XRP',
  ADA: 'Cardano',
  DOGE: 'Dogecoin',
  AVAX: 'Avalanche',
  DOT: 'Polkadot',
  LINK: 'Chainlink',
  UNI: 'Uniswap',
  MATIC: 'Polygon',
  ATOM: 'Cosmos',
  LTC: 'Litecoin',
  BNB: 'Binance',
  NEAR: 'NEAR Protocol',
  APT: 'Aptos',
  SUI: 'Sui',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  TON: 'Toncoin'
};

function getSearchQuery(currency: string): string {
  const name = TICKER_TO_NAME[currency] ?? currency;
  return `${currency} ${name} cryptocurrency`;
}

interface GNewsArticle {
  title?: string;
  description?: string;
  url?: string;
  publishedAt?: string;
}

interface GNewsResponse {
  totalArticles?: number;
  articles?: GNewsArticle[];
}

/**
 * Получить краткий контекст новостей для символа (совместимый с CryptoPanic).
 * Формат строки: "GNews (BTC): 1. Title; 2. Title; ..."
 */
export async function fetchNewsContext(
  apiKey: string,
  symbol: string,
  limit: number = 5
): Promise<string | null> {
  if (!apiKey?.trim()) return null;
  const currency = symbolToCurrency(symbol);
  const q = getSearchQuery(currency);

  const params = new URLSearchParams({
    q,
    lang: 'en',
    max: String(Math.min(limit, 10)),
    apikey: apiKey.trim()
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${GNEWS_BASE}?${params.toString()}`;
    const res = await undiciFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'TradingBot/1.0 (https://gnews.io)' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      logger.warn('gnews', 'GNews API error', { status: res.status, body: err.slice(0, 100) });
      return null;
    }

    const data = (await res.json()) as GNewsResponse;
    const articles = data.articles ?? [];

    if (articles.length === 0) return null;

    const lines = articles.slice(0, limit).map((a, i) => {
      const title = (a.title ?? a.description ?? '').slice(0, 120);
      return `${i + 1}. ${title}`;
    });

    return `GNews (${currency}): ${lines.join('; ')}`;
  } catch (e) {
    clearTimeout(timeout);
    const err = e as Error;
    const cause = (e as { cause?: unknown }).cause != null ? String((e as { cause?: unknown }).cause) : undefined;
    logger.warn('gnews', 'GNews fetch failed', { error: err.message, cause, symbol });
    return null;
  }
}
