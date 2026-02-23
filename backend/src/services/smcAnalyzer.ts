/**
 * SMC Analyzer - Smart Money Concepts
 * BOS (Break of Structure), CHoCH (Change of Character)
 * Order Blocks, Fair Value Gaps, Structure Bias
 */

import { Candle } from './technicalIndicators';

export interface SwingPoint {
  price: number;
  index: number;
  type: 'high' | 'low';
}

export interface OrderBlock {
  type: 'bullish' | 'bearish';
  high: number;
  low: number;
  index: number;
  tested?: boolean;
}

export interface FairValueGap {
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  size: number;
  index: number;
  filled?: boolean;
}

export interface SMCResult {
  trend: 'bullish' | 'bearish' | 'neutral';
  lastBos: 'bullish' | 'bearish' | null;
  lastChoch: 'bullish' | 'bearish' | null;
  orderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  swingHighs: number[];
  swingLows: number[];
  structureBias: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
}

export function analyzeSMC(candles: Candle[]): SMCResult {
  if (!candles.length || candles.length < 30) {
    return {
      trend: 'neutral',
      lastBos: null,
      lastChoch: null,
      orderBlocks: [],
      fairValueGaps: [],
      swingHighs: [],
      swingLows: [],
      structureBias: 'neutral'
    };
  }

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const opens = candles.map(c => c.open);

  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  const swingHighIndices: number[] = [];
  const swingLowIndices: number[] = [];

  findSwings(highs, lows, 5, swingHighs, swingLows, swingHighIndices, swingLowIndices);

  const trend = determineTrend(swingHighs, swingLows);
  const lastBos = detectBOS(closes, swingHighs, swingLows, swingHighIndices, swingLowIndices);
  const lastChoch = detectCHoCH(closes, swingHighs, swingLows, swingHighIndices, swingLowIndices, trend);
  const orderBlocks = findOrderBlocks(candles);
  const fairValueGaps = findFVG(candles);
  const structureBias = calcStructureBias(trend, lastBos, lastChoch);

  return {
    trend,
    lastBos,
    lastChoch,
    orderBlocks: orderBlocks.slice(-5),
    fairValueGaps: fairValueGaps.slice(-5),
    swingHighs: swingHighs.slice(-5),
    swingLows: swingLows.slice(-5),
    structureBias
  };
}

function findSwings(
  highs: number[],
  lows: number[],
  window: number,
  swingHighs: number[],
  swingLows: number[],
  swingHighIndices: number[],
  swingLowIndices: number[]
): void {
  for (let i = window; i < highs.length - window; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j !== i) {
        if (highs[j] >= highs[i]) isSwingHigh = false;
        if (lows[j] <= lows[i]) isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      swingHighs.push(highs[i]);
      swingHighIndices.push(i);
    }
    if (isSwingLow) {
      swingLows.push(lows[i]);
      swingLowIndices.push(i);
    }
  }
}

function determineTrend(swingHighs: number[], swingLows: number[]): 'bullish' | 'bearish' | 'neutral' {
  if (swingHighs.length < 2 || swingLows.length < 2) return 'neutral';

  const recentHighs = swingHighs.slice(-3);
  const recentLows = swingLows.slice(-3);

  let hhCount = 0;
  let hlCount = 0;
  let lhCount = 0;
  let llCount = 0;

  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i] > recentHighs[i - 1]) hhCount++;
    if (recentHighs[i] < recentHighs[i - 1]) lhCount++;
  }

  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i] > recentLows[i - 1]) hlCount++;
    if (recentLows[i] < recentLows[i - 1]) llCount++;
  }

  if (hhCount >= 1 && hlCount >= 1) return 'bullish';
  if (lhCount >= 1 && llCount >= 1) return 'bearish';
  return 'neutral';
}

function detectBOS(
  closes: number[],
  swingHighs: number[],
  swingLows: number[],
  swingHighIndices: number[],
  swingLowIndices: number[]
): 'bullish' | 'bearish' | null {
  if (!swingHighs.length || !swingLows.length) return null;

  const lastHigh = swingHighs[swingHighs.length - 1];
  const lastLow = swingLows[swingLows.length - 1];

  const recentCloses = closes.slice(-3);

  for (const c of recentCloses) {
    if (c > lastHigh) return 'bullish';
    if (c < lastLow) return 'bearish';
  }

  return null;
}

function detectCHoCH(
  closes: number[],
  swingHighs: number[],
  swingLows: number[],
  swingHighIndices: number[],
  swingLowIndices: number[],
  currentTrend: string
): 'bullish' | 'bearish' | null {
  if (!swingHighs.length || !swingLows.length) return null;

  const currentPrice = closes[closes.length - 1];

  if (currentTrend === 'bullish' && swingLows.length >= 2) {
    const prevLow = swingLows[swingLows.length - 2];
    if (currentPrice < prevLow) return 'bearish';
  }

  if (currentTrend === 'bearish' && swingHighs.length >= 2) {
    const prevHigh = swingHighs[swingHighs.length - 2];
    if (currentPrice > prevHigh) return 'bullish';
  }

  return null;
}

function findOrderBlocks(candles: Candle[]): OrderBlock[] {
  const orderBlocks: OrderBlock[] = [];

  if (candles.length < 10) return orderBlocks;

  for (let i = 3; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];

    const prevBody = Math.abs(prev.close - prev.open);
    const currBody = Math.abs(curr.close - curr.open);
    const nextBody = Math.abs(next.close - next.open);

    if (prev.close < prev.open && curr.close > curr.open && currBody > prevBody * 2) {
      orderBlocks.push({
        type: 'bullish',
        high: prev.high,
        low: prev.low,
        index: i - 1
      });
    }

    if (prev.close > prev.open && curr.close < curr.open && currBody > prevBody * 2) {
      orderBlocks.push({
        type: 'bearish',
        high: prev.high,
        low: prev.low,
        index: i - 1
      });
    }
  }

  return orderBlocks;
}

function findFVG(candles: Candle[]): FairValueGap[] {
  const fvgs: FairValueGap[] = [];

  if (candles.length < 3) return fvgs;

  for (let i = 2; i < candles.length; i++) {
    const candleN = candles[i];
    const candleN2 = candles[i - 2];

    if (candleN.low > candleN2.high) {
      fvgs.push({
        type: 'bullish',
        top: candleN.low,
        bottom: candleN2.high,
        size: candleN.low - candleN2.high,
        index: i
      });
    }

    if (candleN.high < candleN2.low) {
      fvgs.push({
        type: 'bearish',
        top: candleN2.low,
        bottom: candleN.high,
        size: candleN2.low - candleN.high,
        index: i
      });
    }
  }

  return fvgs;
}

function calcStructureBias(
  trend: string,
  bos: 'bullish' | 'bearish' | null,
  choch: 'bullish' | 'bearish' | null
): 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish' {
  let score = 0;

  if (trend === 'bullish') score += 2;
  else if (trend === 'bearish') score -= 2;

  if (bos === 'bullish') score += 1;
  else if (bos === 'bearish') score -= 1;

  if (choch === 'bullish') score += 2;
  else if (choch === 'bearish') score -= 2;

  if (score >= 3) return 'strong_bullish';
  if (score >= 1) return 'bullish';
  if (score <= -3) return 'strong_bearish';
  if (score <= -1) return 'bearish';
  return 'neutral';
}

export type { SMCResult as SMCAnalyzerResult };
