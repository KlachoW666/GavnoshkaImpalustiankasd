/**
 * BTC Correlation Filter — проверка тренда BTC перед входом в альткоины.
 * Альткоины сильно коррелируют с BTC. LONG на альткоине при падающем BTC рискован.
 */

import { logger } from '../lib/logger';
import { TtlCache } from '../lib/ttlCache';

export interface BtcTrendResult {
  trend: 'bullish' | 'bearish' | 'neutral';
  /** Изменение цены BTC за последний час (%) */
  change1h: number;
  /** Изменение цены BTC за последние 4 часа (%) */
  change4h: number;
  /** Рекомендация: снизить confidence для LONG при bearish BTC */
  confidencePenalty: number;
  /** Рекомендация: снизить confidence для SHORT при bullish BTC */
  confidencePenaltyShort: number;
}

const btcTrendCache = new TtlCache<BtcTrendResult>(60_000); // 1 мин кэш

/**
 * Определяет тренд BTC по свечам 1h и 4h.
 * @param candles1h - свечи BTC 1h (минимум 5)
 * @param candles4h - свечи BTC 4h (минимум 3)
 */
export function analyzeBtcTrend(
  candles1h: Array<{ close: number; open: number; high: number; low: number }>,
  candles4h: Array<{ close: number; open: number; high: number; low: number }>
): BtcTrendResult {
  const cached = btcTrendCache.get('btc_trend');
  if (cached) return cached;

  let change1h = 0;
  let change4h = 0;

  if (candles1h.length >= 2) {
    const prev = candles1h[candles1h.length - 2].close;
    const curr = candles1h[candles1h.length - 1].close;
    change1h = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
  }

  if (candles4h.length >= 2) {
    const prev = candles4h[candles4h.length - 2].close;
    const curr = candles4h[candles4h.length - 1].close;
    change4h = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
  }

  // EMA trend на 1h
  let ema1hBullish = false;
  let ema1hBearish = false;
  if (candles1h.length >= 21) {
    const closes = candles1h.map(c => c.close);
    const ema21 = calcEMA(closes, 21);
    const lastClose = closes[closes.length - 1];
    ema1hBullish = lastClose > ema21;
    ema1hBearish = lastClose < ema21;
  }

  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let confidencePenalty = 0;
  let confidencePenaltyShort = 0;

  // Сильный медвежий тренд BTC
  if (change1h < -1.5 || (change4h < -3 && change1h < -0.5)) {
    trend = 'bearish';
    confidencePenalty = 0.12; // -12% для LONG на альткоинах
    confidencePenaltyShort = 0; // SHORT на альткоинах OK
  }
  // Умеренный медвежий
  else if (change1h < -0.5 && ema1hBearish) {
    trend = 'bearish';
    confidencePenalty = 0.06;
    confidencePenaltyShort = 0;
  }
  // Сильный бычий тренд BTC
  else if (change1h > 1.5 || (change4h > 3 && change1h > 0.5)) {
    trend = 'bullish';
    confidencePenalty = 0;
    confidencePenaltyShort = 0.10; // -10% для SHORT на альткоинах
  }
  // Умеренный бычий
  else if (change1h > 0.5 && ema1hBullish) {
    trend = 'bullish';
    confidencePenalty = 0;
    confidencePenaltyShort = 0.05;
  }

  const result: BtcTrendResult = { trend, change1h, change4h, confidencePenalty, confidencePenaltyShort };
  btcTrendCache.set('btc_trend', result);
  return result;
}

/**
 * Применяет BTC корреляцию к confidence.
 * Не применяется к BTC-USDT (сам BTC).
 */
export function applyBtcCorrelation(
  symbol: string,
  direction: 'LONG' | 'SHORT',
  confidence: number,
  btcTrend: BtcTrendResult
): { confidence: number; btcPenaltyApplied: number } {
  // Не применяем к самому BTC
  if (symbol.toUpperCase().startsWith('BTC')) {
    return { confidence, btcPenaltyApplied: 0 };
  }

  let penalty = 0;
  if (direction === 'LONG' && btcTrend.confidencePenalty > 0) {
    penalty = btcTrend.confidencePenalty;
  } else if (direction === 'SHORT' && btcTrend.confidencePenaltyShort > 0) {
    penalty = btcTrend.confidencePenaltyShort;
  }

  if (penalty > 0) {
    const newConf = Math.max(0.45, confidence - penalty);
    logger.debug('BtcCorrelation', `${symbol} ${direction}: BTC ${btcTrend.trend}, penalty -${(penalty * 100).toFixed(0)}%`, {
      btcChange1h: btcTrend.change1h.toFixed(2),
      confBefore: (confidence * 100).toFixed(0),
      confAfter: (newConf * 100).toFixed(0)
    });
    return { confidence: newConf, btcPenaltyApplied: penalty };
  }

  return { confidence, btcPenaltyApplied: 0 };
}

function calcEMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}
