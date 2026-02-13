/**
 * CryptoPanic API — новости и сентимент для криптовалют.
 * https://cryptopanic.com/developers/api/
 * Используется в анализе перед открытием ордера (контекст для внешнего ИИ).
 */

import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { config } from '../config';
import { getProxy } from '../db/proxies';
import { logger } from '../lib/logger';

function getProxyUrl(): string {
  return getProxy(config.proxyList) || config.proxy || '';
}

const CRYPTOPANIC_BASE = 'https://api.cryptopanic.com/v1/posts/';
const REQUEST_TIMEOUT_MS = 15000;

export interface CryptoPanicPost {
  title: string;
  url: string;
  published_at: string;
  currencies?: Array<{ code: string }>;
  votes?: { positive?: number; negative?: number; important?: number };
  kind?: string;
}

export interface CryptoPanicResult {
  results?: CryptoPanicPost[];
  count?: number;
  next?: string;
}

/** Извлечь тикер из символа (BTC-USDT-SWAP -> BTC, ETH/USDT -> ETH) */
export function symbolToCurrency(symbol: string): string {
  const s = (symbol ?? '').trim();
  if (!s) return 'BTC';
  const part = s.split(/[-/]/)[0]?.toUpperCase();
  return part && part.length <= 5 ? part : 'BTC';
}

/** Получить краткий контекст новостей для символа (для промпта ИИ). */
export async function fetchNewsContext(
  apiKey: string,
  symbol: string,
  limit: number = 5
): Promise<string | null> {
  if (!apiKey?.trim()) return null;
  const currency = symbolToCurrency(symbol);
  const proxyUrl = getProxyUrl();
  const dispatcher = proxyUrl && proxyUrl.startsWith('http') ? new ProxyAgent(proxyUrl) : undefined;

  const params = new URLSearchParams({
    auth_token: apiKey.trim(),
    currencies: currency,
    filter: 'important',
    public: 'true'
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${CRYPTOPANIC_BASE}?${params.toString()}`;
    const res = await undiciFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'TradingBot/1.0 (https://cryptopanic.com)' },
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {})
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      logger.warn('cryptopanic', 'CryptoPanic API error', { status: res.status, body: err.slice(0, 150) });
      return null;
    }

    const data = (await res.json()) as CryptoPanicResult;
    const results = data.results ?? [];
    const posts = results.slice(0, limit);

    if (posts.length === 0) {
      return null;
    }

    const lines = posts.map((p, i) => {
      const title = (p.title ?? '').slice(0, 120);
      const votes = p.votes;
      const pos = votes?.positive ?? 0;
      const neg = votes?.negative ?? 0;
      const sent = pos + neg > 0 ? (pos / (pos + neg) >= 0.6 ? 'bullish' : neg / (pos + neg) >= 0.6 ? 'bearish' : 'neutral') : '';
      return `${i + 1}. ${title}${sent ? ` [${sent}]` : ''}`;
    });

    return `CryptoPanic новости (${currency}): ${lines.join('; ')}`;
  } catch (e) {
    clearTimeout(timeout);
    const err = e as Error;
    const cause = err.cause ? (typeof err.cause === 'object' && 'message' in err.cause ? String((err.cause as Error).message) : String(err.cause)) : undefined;
    logger.warn('cryptopanic', 'CryptoPanic fetch failed', { error: err.message, cause, symbol });
    return null;
  }
}
