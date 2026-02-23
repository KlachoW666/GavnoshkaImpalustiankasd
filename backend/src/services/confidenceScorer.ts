/**
 * Confidence Scorer
 * Корректировка уверенности сигнала на основе совпадения факторов
 */

import { TechnicalResult } from './technicalIndicators';
import { SMCResult } from './smcAnalyzer';
import { ConfluenceResult } from './strictConfluence';

export interface ConfidenceAdjustment {
  baseConfidence: number;
  adjustedConfidence: number;
  adjustments: {
    factor: string;
    delta: number;
    reason: string;
  }[];
}

export function adjustConfidence(
  baseConfidence: number,
  direction: 'LONG' | 'SHORT',
  indicators: TechnicalResult,
  structureData: SMCResult,
  confluenceResult: ConfluenceResult,
  riskReward: number
): ConfidenceAdjustment {
  const adjustments: { factor: string; delta: number; reason: string }[] = [];
  let adjustment = 0;

  const trendScore = indicators.trendScore;
  if (direction === 'LONG' && trendScore > 30) {
    adjustment += 0.05;
    adjustments.push({ factor: 'trend', delta: 0.05, reason: 'LONG совпадает с восходящим трендом' });
  } else if (direction === 'SHORT' && trendScore < -30) {
    adjustment += 0.05;
    adjustments.push({ factor: 'trend', delta: 0.05, reason: 'SHORT совпадает с нисходящим трендом' });
  } else if (direction === 'LONG' && trendScore < -30) {
    adjustment -= 0.15;
    adjustments.push({ factor: 'trend', delta: -0.15, reason: 'LONG против сильного нисходящего тренда' });
  } else if (direction === 'SHORT' && trendScore > 30) {
    adjustment -= 0.15;
    adjustments.push({ factor: 'trend', delta: -0.15, reason: 'SHORT против сильного восходящего тренда' });
  }

  const st = indicators.supertrend.direction;
  if (direction === 'LONG' && st === 'bullish') {
    adjustment += 0.05;
    adjustments.push({ factor: 'supertrend', delta: 0.05, reason: 'Supertrend bullish' });
  } else if (direction === 'SHORT' && st === 'bearish') {
    adjustment += 0.05;
    adjustments.push({ factor: 'supertrend', delta: 0.05, reason: 'Supertrend bearish' });
  } else if (direction === 'LONG' && st === 'bearish') {
    adjustment -= 0.10;
    adjustments.push({ factor: 'supertrend', delta: -0.10, reason: 'LONG против Supertrend' });
  } else if (direction === 'SHORT' && st === 'bullish') {
    adjustment -= 0.10;
    adjustments.push({ factor: 'supertrend', delta: -0.10, reason: 'SHORT против Supertrend' });
  }

  const structBias = structureData.structureBias;
  if (direction === 'LONG' && structBias.includes('bullish')) {
    adjustment += 0.08;
    adjustments.push({ factor: 'structure', delta: 0.08, reason: 'Структура бычья' });
  } else if (direction === 'SHORT' && structBias.includes('bearish')) {
    adjustment += 0.08;
    adjustments.push({ factor: 'structure', delta: 0.08, reason: 'Структура медвежья' });
  } else if (direction === 'LONG' && structBias.includes('bearish')) {
    adjustment -= 0.10;
    adjustments.push({ factor: 'structure', delta: -0.10, reason: 'LONG против структуры' });
  } else if (direction === 'SHORT' && structBias.includes('bullish')) {
    adjustment -= 0.10;
    adjustments.push({ factor: 'structure', delta: -0.10, reason: 'SHORT против структуры' });
  }

  if (structureData.lastBos === 'bullish' && direction === 'LONG') {
    adjustment += 0.03;
    adjustments.push({ factor: 'bos', delta: 0.03, reason: 'BOS bullish подтверждает LONG' });
  } else if (structureData.lastBos === 'bearish' && direction === 'SHORT') {
    adjustment += 0.03;
    adjustments.push({ factor: 'bos', delta: 0.03, reason: 'BOS bearish подтверждает SHORT' });
  }

  if (structureData.lastChoch === 'bullish' && direction === 'LONG') {
    adjustment += 0.05;
    adjustments.push({ factor: 'choch', delta: 0.05, reason: 'CHoCH bullish - смена характера' });
  } else if (structureData.lastChoch === 'bearish' && direction === 'SHORT') {
    adjustment += 0.05;
    adjustments.push({ factor: 'choch', delta: 0.05, reason: 'CHoCH bearish - смена характера' });
  }

  if (indicators.adx.trendStrength === 'strong' || indicators.adx.trendStrength === 'extreme') {
    adjustment += 0.05;
    adjustments.push({ factor: 'adx', delta: 0.05, reason: `ADX ${indicators.adx.trendStrength}` });
  }

  if (indicators.macd.crossover !== 'none') {
    if ((indicators.macd.crossover === 'bullish' && direction === 'LONG') ||
        (indicators.macd.crossover === 'bearish' && direction === 'SHORT')) {
      adjustment += 0.03;
      adjustments.push({ factor: 'macd_crossover', delta: 0.03, reason: `MACD ${indicators.macd.crossover} crossover` });
    }
  }

  if (indicators.rsi.state !== 'neutral') {
    if ((indicators.rsi.state === 'oversold' && direction === 'LONG') ||
        (indicators.rsi.state === 'overbought' && direction === 'SHORT')) {
      adjustment += 0.02;
      adjustments.push({ factor: 'rsi', delta: 0.02, reason: `RSI ${indicators.rsi.state}` });
    }
  }

  if (riskReward >= 3.0) {
    adjustment += 0.05;
    adjustments.push({ factor: 'rr', delta: 0.05, reason: `R:R >= 3.0 (${riskReward.toFixed(1)})` });
  } else if (riskReward < 1.5) {
    adjustment -= 0.10;
    adjustments.push({ factor: 'rr', delta: -0.10, reason: `R:R < 1.5 (${riskReward.toFixed(1)})` });
  }

  if (confluenceResult.passed) {
    adjustment += 0.05;
    adjustments.push({ factor: 'confluence', delta: 0.05, reason: `Confluence passed (${confluenceResult.score}/5)` });
  }

  if (confluenceResult.mismatchedFactors.length > 0) {
    adjustment -= 0.02 * confluenceResult.mismatchedFactors.length;
    adjustments.push({ factor: 'mismatches', delta: -0.02 * confluenceResult.mismatchedFactors.length, reason: `${confluenceResult.mismatchedFactors.length} mismatched factors` });
  }

  if (indicators.atr.volatility === 'high') {
    adjustment -= 0.03;
    adjustments.push({ factor: 'volatility', delta: -0.03, reason: 'Высокая волатильность' });
  }

  const adjustedConfidence = Math.max(0, Math.min(1, baseConfidence + adjustment));

  return {
    baseConfidence,
    adjustedConfidence: Math.round(adjustedConfidence * 1000) / 1000,
    adjustments
  };
}

export function calculateFinalConfidence(
  baseConfidence: number,
  direction: 'LONG' | 'SHORT',
  indicators: TechnicalResult,
  structureData: SMCResult,
  confluenceResult: ConfluenceResult,
  riskReward: number
): number {
  const result = adjustConfidence(
    baseConfidence,
    direction,
    indicators,
    structureData,
    confluenceResult,
    riskReward
  );
  return result.adjustedConfidence;
}

export type { ConfidenceAdjustment as ConfidenceScorerResult };
