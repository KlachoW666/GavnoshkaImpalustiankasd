/**
 * Technical Indicators - расширенный технический анализ
 * Supertrend, ADX, Stoch RSI, CCI, Williams %R, MFI, VWAP
 * Trend Score: -100 (strong bearish) to +100 (strong bullish)
 */

import {
  EMA, SMA, RSI, MACD, BollingerBands, ATR, ADX, StochasticRSI,
  CCI, WilliamsR, MFI, VWAP, OBV
} from 'technicalindicators';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number;
}

export interface TechnicalResult {
  trendScore: number;
  momentumScore: number;
  ema: { ema9?: number; ema21?: number; ema50?: number; ema200?: number };
  emaPositions: { ema9?: 'above' | 'below'; ema21?: 'above' | 'below'; ema50?: 'above' | 'below'; ema200?: 'above' | 'below' };
  sma: { sma20?: number; sma50?: number; sma200?: number };
  supertrend: { direction: 'bullish' | 'bearish' | 'neutral'; value: number };
  adx: { value: number; trendStrength: 'weak' | 'moderate' | 'strong' | 'extreme'; direction: 'bullish' | 'bearish' };
  rsi: { value: number; state: 'oversold' | 'neutral' | 'overbought'; prev?: number };
  macd: { line?: number; signal?: number; histogram?: number; direction: 'bullish' | 'bearish' | 'neutral'; crossover: 'bullish' | 'bearish' | 'none' };
  stochRsi: { k?: number; d?: number; state: 'oversold' | 'neutral' | 'overbought' };
  cci: { value?: number; state: 'oversold' | 'neutral' | 'overbought' };
  williamsR: { value?: number; state: 'oversold' | 'neutral' | 'overbought' };
  mfi: { value?: number; state: 'oversold' | 'neutral' | 'overbought' };
  bollinger: { upper?: number; middle?: number; lower?: number; bandwidth?: number; position: string };
  atr: { value?: number; pct: number; volatility: 'low' | 'moderate' | 'high' };
  vwap: { value?: number; position: 'above' | 'below' | 'unknown' };
  obv: { value?: number; trend: 'rising' | 'falling' | 'neutral' };
  error?: string;
}

const EMA_PERIODS = [9, 21, 50, 200];
const SMA_PERIODS = [20, 50, 200];
const RSI_PERIOD = 14;
const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const BB_PERIOD = 20;
const BB_STD = 2;
const ATR_PERIOD = 14;

export function analyzeTechnical(candles: Candle[]): TechnicalResult {
  if (!candles.length || candles.length < 50) {
    return {
      trendScore: 0,
      momentumScore: 0,
      ema: {},
      emaPositions: {},
      sma: {},
      supertrend: { direction: 'neutral', value: 0 },
      adx: { value: 0, trendStrength: 'weak', direction: 'bullish' },
      rsi: { value: 50, state: 'neutral' },
      macd: { direction: 'neutral', crossover: 'none' },
      stochRsi: { state: 'neutral' },
      cci: { state: 'neutral' },
      williamsR: { state: 'neutral' },
      mfi: { state: 'neutral' },
      bollinger: { position: 'unknown' },
      atr: { pct: 0, volatility: 'low' },
      vwap: { position: 'unknown' },
      obv: { trend: 'neutral' },
      error: 'insufficient_data'
    };
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const currentPrice = closes[closes.length - 1];

  const result: TechnicalResult = {
    trendScore: 0,
    momentumScore: 0,
    ema: {},
    emaPositions: {},
    sma: {},
    supertrend: { direction: 'neutral', value: 0 },
    adx: { value: 0, trendStrength: 'weak', direction: 'bullish' },
    rsi: { value: 50, state: 'neutral' },
    macd: { direction: 'neutral', crossover: 'none' },
    stochRsi: { state: 'neutral' },
    cci: { state: 'neutral' },
    williamsR: { state: 'neutral' },
    mfi: { state: 'neutral' },
    bollinger: { position: 'unknown' },
    atr: { pct: 0, volatility: 'low' },
    vwap: { position: 'unknown' },
    obv: { trend: 'neutral' }
  };

  try {
    result.ema = calcEMA(closes, currentPrice, result);
    result.sma = calcSMA(closes, currentPrice);
    result.supertrend = calcSupertrend(candles);
    result.adx = calcADX(highs, lows, closes);
    result.rsi = calcRSI(closes);
    result.macd = calcMACD(closes);
    result.stochRsi = calcStochRSI(closes);
    result.cci = calcCCI(highs, lows, closes);
    result.williamsR = calcWilliamsR(highs, lows, closes);
    result.mfi = calcMFI(highs, lows, closes, volumes);
    result.bollinger = calcBollinger(closes, currentPrice);
    result.atr = calcATR(candles);
    result.vwap = calcVWAP(candles, currentPrice);
    result.obv = calcOBV(closes, volumes);

    result.trendScore = calcTrendScore(result);
    result.momentumScore = calcMomentumScore(result);
  } catch (e) {
    result.error = (e as Error).message;
  }

  return result;
}

function calcEMA(closes: number[], currentPrice: number, result: TechnicalResult): { ema9?: number; ema21?: number; ema50?: number; ema200?: number } {
  const emaValues: { ema9?: number; ema21?: number; ema50?: number; ema200?: number } = {};
  
  for (const period of EMA_PERIODS) {
    if (closes.length < period) continue;
    const ema = new EMA({ period, values: closes });
    const values = ema.getResult();
    if (values.length > 0) {
      const val = values[values.length - 1];
      (emaValues as any)[`ema${period}`] = round(val, 6);
      (result.emaPositions as any)[`ema${period}`] = currentPrice > val ? 'above' : 'below';
    }
  }
  
  return emaValues;
}

function calcSMA(closes: number[], currentPrice: number): { sma20?: number; sma50?: number; sma200?: number } {
  const smaValues: { sma20?: number; sma50?: number; sma200?: number } = {};
  
  for (const period of SMA_PERIODS) {
    if (closes.length < period) continue;
    const sma = new SMA({ period, values: closes });
    const values = sma.getResult();
    if (values.length > 0) {
      (smaValues as any)[`sma${period}`] = round(values[values.length - 1], 6);
    }
  }
  
  return smaValues;
}

function calcSupertrend(candles: Candle[]): { direction: 'bullish' | 'bearish' | 'neutral'; value: number } {
  const period = 10;
  const multiplier = 3;
  
  if (candles.length < period + 1) return { direction: 'neutral', value: 0 };
  
  const atrVals = new ATR({ period, high: candles.map(c => c.high), low: candles.map(c => c.low), close: candles.map(c => c.close) }).getResult();
  if (atrVals.length === 0) return { direction: 'neutral', value: 0 };
  
  const atr = atrVals[atrVals.length - 1];
  const high = candles[candles.length - 1].high;
  const low = candles[candles.length - 1].low;
  const close = candles[candles.length - 1].close;
  
  const hl2 = (high + low) / 2;
  const upperBand = hl2 + multiplier * atr;
  const lowerBand = hl2 - multiplier * atr;
  
  const prevClose = candles[candles.length - 2].close;
  const prevUpper = hl2 + multiplier * atrVals[atrVals.length - 2];
  const prevLower = hl2 - multiplier * atrVals[atrVals.length - 2];
  
  let supertrend = lowerBand;
  let direction: 'bullish' | 'bearish' = 'bullish';
  
  if (close <= prevUpper) {
    supertrend = upperBand;
    direction = 'bearish';
  } else if (close >= prevLower) {
    supertrend = lowerBand;
    direction = 'bullish';
  }
  
  return { direction, value: round(supertrend, 6) };
}

function calcADX(highs: number[], lows: number[], closes: number[]): { value: number; trendStrength: 'weak' | 'moderate' | 'strong' | 'extreme'; direction: 'bullish' | 'bearish' } {
  const period = 14;
  
  if (closes.length < period * 2) {
    return { value: 0, trendStrength: 'weak', direction: 'bullish' };
  }
  
  const adx = new ADX({ period, high: highs, low: lows, close: closes });
  const values = adx.getResult();
  
  if (values.length === 0) return { value: 0, trendStrength: 'weak', direction: 'bullish' };
  
  const last = values[values.length - 1] as any;
  const adxVal = last.adx || 0;
  const pdi = last.pdi || 0;
  const mdi = last.mdi || 0;
  
  let strength: 'weak' | 'moderate' | 'strong' | 'extreme' = 'weak';
  if (adxVal > 25) strength = 'moderate';
  if (adxVal > 50) strength = 'strong';
  if (adxVal > 75) strength = 'extreme';
  
  return {
    value: round(adxVal, 2),
    trendStrength: strength,
    direction: pdi > mdi ? 'bullish' : 'bearish'
  };
}

function calcRSI(closes: number[]): { value: number; state: 'oversold' | 'neutral' | 'overbought'; prev?: number } {
  const period = RSI_PERIOD;
  
  if (closes.length < period + 1) return { value: 50, state: 'neutral' };
  
  const rsi = new RSI({ period, values: closes });
  const values = rsi.getResult();
  
  if (values.length === 0) return { value: 50, state: 'neutral' };
  
  const val = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : undefined;
  
  let state: 'oversold' | 'neutral' | 'overbought' = 'neutral';
  if (val <= RSI_OVERSOLD) state = 'oversold';
  else if (val >= RSI_OVERBOUGHT) state = 'overbought';
  
  return { value: round(val, 2), state, prev: prev ? round(prev, 2) : undefined };
}

function calcMACD(closes: number[]): { line?: number; signal?: number; histogram?: number; direction: 'bullish' | 'bearish' | 'neutral'; crossover: 'bullish' | 'bearish' | 'none' } {
  const macd = new MACD({ values: closes, fastPeriod: MACD_FAST, slowPeriod: MACD_SLOW, signalPeriod: MACD_SIGNAL, SimpleMAOscillator: false, SimpleMASignal: false });
  const values = macd.getResult();
  
  if (values.length < 2) return { direction: 'neutral', crossover: 'none' };
  
  const last = values[values.length - 1] as any;
  const prev = values[values.length - 2] as any;
  
  const histogram = last.histogram || 0;
  const prevHistogram = prev.histogram || 0;
  
  let crossover: 'bullish' | 'bearish' | 'none' = 'none';
  if (histogram > 0 && prevHistogram <= 0) crossover = 'bullish';
  else if (histogram < 0 && prevHistogram >= 0) crossover = 'bearish';
  
  return {
    line: round(last.MACD, 6),
    signal: round(last.signal, 6),
    histogram: round(histogram, 6),
    direction: histogram > 0 ? 'bullish' : 'bearish',
    crossover
  };
}

function calcStochRSI(closes: number[]): { k?: number; d?: number; state: 'oversold' | 'neutral' | 'overbought' } {
  if (closes.length < 20) return { state: 'neutral' };
  
  const stochRsi = new StochasticRSI({ values: closes, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3 });
  const values = stochRsi.getResult();
  
  if (values.length === 0) return { state: 'neutral' };
  
  const last = values[values.length - 1] as any;
  const k = last.stochRSI;
  const d = last.stochRSID || k;
  
  let state: 'oversold' | 'neutral' | 'overbought' = 'neutral';
  if (k <= 20) state = 'oversold';
  else if (k >= 80) state = 'overbought';
  
  return { k: round(k, 2), d: round(d, 2), state };
}

function calcCCI(highs: number[], lows: number[], closes: number[]): { value?: number; state: 'oversold' | 'neutral' | 'overbought' } {
  if (closes.length < 20) return { state: 'neutral' };
  
  const cci = new CCI({ high: highs, low: lows, close: closes, period: 20 });
  const values = cci.getResult();
  
  if (values.length === 0) return { state: 'neutral' };
  
  const val = values[values.length - 1];
  
  let state: 'oversold' | 'neutral' | 'overbought' = 'neutral';
  if (val > 100) state = 'overbought';
  else if (val < -100) state = 'oversold';
  
  return { value: round(val, 2), state };
}

function calcWilliamsR(highs: number[], lows: number[], closes: number[]): { value?: number; state: 'oversold' | 'neutral' | 'overbought' } {
  if (closes.length < 14) return { state: 'neutral' };
  
  const wr = new WilliamsR({ high: highs, low: lows, close: closes, period: 14 });
  const values = wr.getResult();
  
  if (values.length === 0) return { state: 'neutral' };
  
  const val = values[values.length - 1];
  
  let state: 'oversold' | 'neutral' | 'overbought' = 'neutral';
  if (val < -80) state = 'oversold';
  else if (val > -20) state = 'overbought';
  
  return { value: round(val, 2), state };
}

function calcMFI(highs: number[], lows: number[], closes: number[], volumes: number[]): { value?: number; state: 'oversold' | 'neutral' | 'overbought' } {
  if (closes.length < 14) return { state: 'neutral' };
  
  const mfi = new MFI({ high: highs, low: lows, close: closes, volume: volumes, period: 14 });
  const values = mfi.getResult();
  
  if (values.length === 0) return { state: 'neutral' };
  
  const val = values[values.length - 1];
  
  let state: 'oversold' | 'neutral' | 'overbought' = 'neutral';
  if (val <= 20) state = 'oversold';
  else if (val >= 80) state = 'overbought';
  
  return { value: round(val, 2), state };
}

function calcBollinger(closes: number[], currentPrice: number): { upper?: number; middle?: number; lower?: number; bandwidth?: number; position: string } {
  if (closes.length < BB_PERIOD) return { position: 'unknown' };
  
  const bb = new BollingerBands({ period: BB_PERIOD, stdDev: BB_STD, values: closes });
  const values = bb.getResult();
  
  if (values.length === 0) return { position: 'unknown' };
  
  const last = values[values.length - 1] as any;
  const upper = last.upper;
  const middle = last.middle;
  const lower = last.lower;
  const bandwidth = last.pb || 0;
  
  let position = 'middle';
  if (currentPrice >= upper) position = 'above_upper';
  else if (currentPrice <= lower) position = 'below_lower';
  else if (currentPrice > middle) position = 'upper_half';
  else position = 'lower_half';
  
  return {
    upper: round(upper, 6),
    middle: round(middle, 6),
    lower: round(lower, 6),
    bandwidth: round(bandwidth, 4),
    position
  };
}

function calcATR(candles: Candle[]): { value?: number; pct: number; volatility: 'low' | 'moderate' | 'high' } {
  if (candles.length < ATR_PERIOD) return { pct: 0, volatility: 'low' };
  
  const atr = new ATR({ period: ATR_PERIOD, high: candles.map(c => c.high), low: candles.map(c => c.low), close: candles.map(c => c.close) });
  const values = atr.getResult();
  
  if (values.length === 0) return { pct: 0, volatility: 'low' };
  
  const atrVal = values[values.length - 1];
  const price = candles[candles.length - 1].close;
  const atrPct = price > 0 ? (atrVal / price) * 100 : 0;
  
  let volatility: 'low' | 'moderate' | 'high' = 'low';
  if (atrPct > 2) volatility = 'high';
  else if (atrPct > 1) volatility = 'moderate';
  
  return { value: round(atrVal, 6), pct: round(atrPct, 3), volatility };
}

function calcVWAP(candles: Candle[], currentPrice: number): { value?: number; position: 'above' | 'below' | 'unknown' } {
  if (candles.length < 10) return { position: 'unknown' };
  
  const vwap = new VWAP({ high: candles.map(c => c.high), low: candles.map(c => c.low), close: candles.map(c => c.close), volume: candles.map(c => c.volume) });
  const values = vwap.getResult();
  
  if (values.length === 0) return { position: 'unknown' };
  
  const vwapVal = values[values.length - 1] as number;
  
  return { value: round(vwapVal, 6), position: currentPrice > vwapVal ? 'above' : 'below' };
}

function calcOBV(closes: number[], volumes: number[]): { value?: number; trend: 'rising' | 'falling' | 'neutral' } {
  if (closes.length < 10) return { trend: 'neutral' };
  
  const obv = new OBV({ close: closes, volume: volumes });
  const values = obv.getResult();
  
  if (values.length < 5) return { trend: 'neutral' };
  
  const current = values[values.length - 1];
  const prev = values[values.length - 5];
  
  return { value: round(current, 2), trend: current > prev ? 'rising' : current < prev ? 'falling' : 'neutral' };
}

function calcTrendScore(ind: TechnicalResult): number {
  let score = 0;
  
  if (ind.emaPositions.ema9 === 'above') score += 5;
  else if (ind.emaPositions.ema9 === 'below') score -= 5;
  
  if (ind.emaPositions.ema21 === 'above') score += 5;
  else if (ind.emaPositions.ema21 === 'below') score -= 5;
  
  if (ind.emaPositions.ema50 === 'above') score += 5;
  else if (ind.emaPositions.ema50 === 'below') score -= 5;
  
  if (ind.emaPositions.ema200 === 'above') score += 5;
  else if (ind.emaPositions.ema200 === 'below') score -= 5;
  
  if (ind.supertrend.direction === 'bullish') score += 15;
  else if (ind.supertrend.direction === 'bearish') score -= 15;
  
  if (ind.adx.direction === 'bullish') score += 10;
  else if (ind.adx.direction === 'bearish') score -= 10;
  
  if (ind.macd.direction === 'bullish') score += 10;
  else if (ind.macd.direction === 'bearish') score -= 10;
  
  if (ind.vwap.position === 'above') score += 5;
  else if (ind.vwap.position === 'below') score -= 5;
  
  return Math.max(-100, Math.min(100, score));
}

function calcMomentumScore(ind: TechnicalResult): number {
  let score = 0;
  
  const rsi = ind.rsi.value;
  score += (rsi - 50) * 1.5;
  
  if (ind.stochRsi.state === 'overbought') score += 15;
  else if (ind.stochRsi.state === 'oversold') score -= 15;
  
  if (ind.macd.crossover === 'bullish') score += 20;
  else if (ind.macd.crossover === 'bearish') score -= 20;
  
  if (ind.cci.state === 'overbought') score += 10;
  else if (ind.cci.state === 'oversold') score -= 10;
  
  return Math.max(-100, Math.min(100, round(score, 1)));
}

function round(val: number, decimals: number): number {
  const mult = Math.pow(10, decimals);
  return Math.round(val * mult) / mult;
}

export type { TechnicalResult as TechnicalIndicatorsResult };
