/**
 * Ограничитель частоты запросов к Bitget REST API.
 * Bitget: ~10 req/s на endpoint; глобально ограничиваем N запросов в секунду,
 * чтобы не получать 429 при пиках (стакан + свечи + объём параллельно).
 */

const DEFAULT_MAX_PER_SECOND = 6;
const WINDOW_MS = 1000;

let timestamps: number[] = [];
let maxPerSecond = DEFAULT_MAX_PER_SECOND;

function prune(now: number): void {
  const cutoff = now - WINDOW_MS;
  timestamps = timestamps.filter((t) => t > cutoff);
}

/**
 * Дождаться разрешения на один запрос (не более maxPerSecond в секунду).
 * Вызывать перед каждым вызовом exchange.fetchOHLCV / fetchOrderBook / fetchTicker.
 */
export function acquire(): Promise<void> {
  const now = Date.now();
  prune(now);
  if (timestamps.length < maxPerSecond) {
    timestamps.push(now);
    return Promise.resolve();
  }
  const oldest = timestamps[0];
  const waitMs = WINDOW_MS - (now - oldest) + 1;
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const t = Date.now();
      prune(t);
      timestamps.push(t);
      resolve();
    }, Math.max(1, waitMs));
  });
}

/**
 * Задать лимит (запросов в секунду). По умолчанию 6.
 */
export function setMaxPerSecond(n: number): void {
  maxPerSecond = Math.max(1, Math.min(20, n));
}
