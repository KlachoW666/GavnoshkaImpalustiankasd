/**
 * Единая утилита получения цены для демо/авто-торговли.
 * OKX: /api/market/price
 */

import { api } from './api';

/** Нормализация символа: BTC-USDT, BTC/USDT, BTCUSDT → BTC-USDT */
export function normSymbol(s: string): string {
  if (!s || typeof s !== 'string') return '';
  const cleaned = s.replace(/\s/g, '').toUpperCase();
  if (cleaned.includes('-')) return cleaned.replace(/_/g, '-');
  if (cleaned.includes('/')) return cleaned.replace(/\//g, '-').replace(/_/g, '-');
  if (cleaned.endsWith('USDT')) return cleaned.slice(0, -4) + '-USDT';
  if (cleaned.endsWith('BUSD')) return cleaned.slice(0, -4) + '-BUSD';
  return cleaned;
}

interface PriceResponse {
  price?: number;
  symbol?: string;
}

/**
 * Получить актуальную цену с OKX.
 */
export async function fetchPrice(symbol: string): Promise<number | null> {
  const sym = normSymbol(symbol);
  if (!sym || !sym.includes('-')) return null;
  try {
    const data = await api.get<PriceResponse>(`/market/price/${encodeURIComponent(sym)}`);
    const price = typeof data?.price === 'number' && data.price > 0 ? data.price : null;
    return price;
  } catch {
    return null;
  }
}
