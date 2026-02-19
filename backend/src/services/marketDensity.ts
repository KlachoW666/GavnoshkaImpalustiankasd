/**
 * Плотность рынка по стакану — спред, глубина, доступный объём для корректировки размера позиции.
 * Используется перед открытием позиции в executeSignal.
 */

export interface OrderBookInput {
  bids: [number, number][];
  asks: [number, number][];
}

export interface MarketDensityResult {
  spreadPct: number;
  midPrice: number;
  depthBidUsd: number;
  depthAskUsd: number;
  imbalance: number;
  /** Объём в USD в зоне 0.5% от mid (на стороне исполнения: ask для LONG, bid для SHORT) */
  availableVolumeUsdIn05Pct: number;
}

function sumVolumeUsdInRange(levels: [number, number][], midPrice: number, percentRange: number): number {
  const threshold = midPrice * (percentRange / 100);
  return levels
    .filter(([p]) => Math.abs(p - midPrice) <= threshold)
    .reduce((s, [p, a]) => s + p * a, 0);
}

/**
 * Вычислить метрики плотности по стакану.
 * depthBidUsd / depthAskUsd — сумма (price * qty) в зоне 0.5% от mid.
 * availableVolumeUsdIn05Pct — для LONG = depthAskUsd (лимит на покупку), для SHORT = depthBidUsd (лимит на продажу). Caller передаёт direction и использует нужную сторону.
 */
export function computeDensity(ob: OrderBookInput, direction?: 'LONG' | 'SHORT'): MarketDensityResult {
  const bids = ob.bids || [];
  const asks = ob.asks || [];
  if (bids.length === 0 || asks.length === 0) {
    return {
      spreadPct: 999,
      midPrice: 0,
      depthBidUsd: 0,
      depthAskUsd: 0,
      imbalance: 0,
      availableVolumeUsdIn05Pct: 0
    };
  }
  const bestBid = bids[0][0];
  const bestAsk = asks[0][0];
  const midPrice = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;
  const spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  const depthBidUsd = sumVolumeUsdInRange(bids, midPrice, 0.5);
  const depthAskUsd = sumVolumeUsdInRange(asks, midPrice, 0.5);
  const totalBid = bids.reduce((s, [, a]) => s + a, 0);
  const totalAsk = asks.reduce((s, [, a]) => s + a, 0);
  const totalVol = totalBid + totalAsk;
  const imbalance = totalVol > 0 ? (totalBid - totalAsk) / totalVol : 0;

  const availableVolumeUsdIn05Pct = direction === 'SHORT' ? depthBidUsd : depthAskUsd;

  return {
    spreadPct,
    midPrice,
    depthBidUsd,
    depthAskUsd,
    imbalance,
    availableVolumeUsdIn05Pct
  };
}
