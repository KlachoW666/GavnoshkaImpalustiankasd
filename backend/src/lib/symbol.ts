/**
 * OKX symbol normalization — single source of truth.
 * OKX futures: BTC-USDT-SWAP, instId: BTC-USDT-SWAP
 */

/** Маппинг символов для OKX (переименования/отсутствующие пары) */
const OKX_SYMBOL_MAP: Record<string, string> = {
  MATIC: 'POL' // Polygon rebrand на OKX
};

/**
 * Normalize to internal format: BTC-USDT (always with hyphen)
 */
export function normalizeSymbol(symbol: string): string {
  if (!symbol || typeof symbol !== 'string') return '';
  let s = symbol.replace(/\s/g, '').replace(/_/g, '-').replace(/-SWAP$/i, '').replace(/:USDT$/i, '').toUpperCase();
  if (s.includes('/')) s = s.replace('/', '-');
  if (s.endsWith('USDT') && !s.includes('-')) s = s.slice(0, -4) + '-USDT';
  return s;
}

/**
 * Convert to OKX ccxt format: BTC/USDT:USDT (с учётом маппинга для OKX)
 */
export function toOkxCcxtSymbol(symbol: string): string {
  const s = normalizeSymbol(symbol);
  if (!s || !s.includes('-')) return '';
  let [base, quote] = s.split('-');
  base = OKX_SYMBOL_MAP[base] ?? base;
  return `${base}/${quote}:USDT`;
}

/**
 * Convert to OKX WebSocket instId: BTC-USDT-SWAP
 */
export function toOkxInstId(symbol: string): string {
  const s = normalizeSymbol(symbol);
  if (!s) return '';
  return s.includes('-') ? `${s}-SWAP` : `${s}-USDT-SWAP`;
}

/**
 * Massive.com (Polygon) ticker: BTC-USDT -> X:BTCUSD
 */
export function toMassiveTicker(symbol: string): string {
  const s = normalizeSymbol(symbol);
  if (!s || !s.includes('-')) return 'X:BTCUSD';
  const [base, quote] = s.split('-');
  const q = (OKX_SYMBOL_MAP[quote] ?? quote).replace(/USDT/i, 'USD');
  const b = OKX_SYMBOL_MAP[base] ?? base;
  return `X:${b}${q}`;
}

/**
 * Massive.com Stocks — тикер акции: AAPL, AAPL-USD -> AAPL
 * Документация: https://massive.com/stocks
 */
export function toMassiveStocksTicker(symbol: string): string {
  if (!symbol || typeof symbol !== 'string') return '';
  const s = symbol.replace(/\s/g, '').toUpperCase();
  if (s.includes('-')) {
    const base = s.split('-')[0] ?? s;
    return base;
  }
  return s;
}

/**
 * Проверка: похоже на тикер акции (буквы, 1–5 символов, без дефиса или с -USD).
 */
export function isLikelyStocksSymbol(symbol: string): boolean {
  const s = (symbol || '').trim().toUpperCase();
  if (!s) return false;
  if (s.includes('-') && !s.endsWith('-USD')) return false;
  const base = s.includes('-') ? s.split('-')[0] ?? s : s;
  return /^[A-Z]{1,5}$/.test(base);
}

/**
 * Bitget WebSocket / REST instId: BTC-USDT -> BTCUSDT
 */
export function toBitgetInstId(symbol: string): string {
  const s = normalizeSymbol(symbol);
  if (!s || !s.includes('-')) return s ? s.replace('-', '') : 'BTCUSDT';
  return s.replace('-', '');
}

/**
 * Validate symbol format (basic check)
 */
export function isValidSymbol(symbol: string): boolean {
  const s = normalizeSymbol(symbol);
  return s.length >= 4 && s.includes('-') && /^[A-Z0-9]+-[A-Z0-9]+$/.test(s);
}
