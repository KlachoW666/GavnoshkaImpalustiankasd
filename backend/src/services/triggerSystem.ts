/**
 * Trigger System
 * AI/сигнал вызывается только при срабатывании триггеров
 * volume_spike, dom_imbalance, macd_crossover, rsi_extreme,
 * strong_pattern, bos, choch, strong_trend
 */

import { TechnicalResult } from './technicalIndicators';
import { SMCResult } from './smcAnalyzer';
import { VolumeData, DOMData } from './strictConfluence';

export type TriggerType =
  | 'volume_spike'
  | 'dom_imbalance'
  | 'macd_crossover'
  | 'rsi_extreme'
  | 'strong_pattern'
  | 'bos'
  | 'choch'
  | 'strong_trend'
  | 'bb_breakout'
  | 'stoch_rsi_reversal'
  | 'adx_trend';

export interface TriggerResult {
  triggered: boolean;
  triggers: TriggerType[];
  direction: 'LONG' | 'SHORT' | null;
  strength: 'weak' | 'moderate' | 'strong';
}

export function checkTriggers(
  indicators: TechnicalResult,
  volumeData: VolumeData,
  domData: DOMData,
  structureData: SMCResult,
  patterns: string[] = []
): TriggerResult {
  const triggers: TriggerType[] = [];
  let bullishScore = 0;
  let bearishScore = 0;

  if (volumeData.volumeSpike) {
    triggers.push('volume_spike');
    if (volumeData.volumePressure.includes('buying')) bullishScore += 2;
    if (volumeData.volumePressure.includes('selling')) bearishScore += 2;
  }

  if (Math.abs(domData.pressureScore) > 50) {
    triggers.push('dom_imbalance');
    if (domData.pressureScore > 50) bullishScore += 2;
    if (domData.pressureScore < -50) bearishScore += 2;
  }

  if (indicators.macd.crossover !== 'none') {
    triggers.push('macd_crossover');
    if (indicators.macd.crossover === 'bullish') bullishScore += 2;
    if (indicators.macd.crossover === 'bearish') bearishScore += 2;
  }

  if (indicators.rsi.value <= 30 || indicators.rsi.value >= 70) {
    triggers.push('rsi_extreme');
    if (indicators.rsi.value <= 30) bullishScore += 1;
    if (indicators.rsi.value >= 70) bearishScore += 1;
  }

  if (indicators.rsi.value <= 25) bullishScore += 1;
  if (indicators.rsi.value >= 75) bearishScore += 1;

  const strongPatterns = [
    'bullish_engulfing', 'bearish_engulfing',
    'morning_star', 'evening_star',
    'three_white_soldiers', 'three_black_crows',
    'bull_marubozu', 'bear_marubozu'
  ];

  const detectedStrong = patterns.filter(p => strongPatterns.includes(p));
  if (detectedStrong.length > 0) {
    triggers.push('strong_pattern');
    const bullPatterns = ['bullish_engulfing', 'morning_star', 'three_white_soldiers', 'bull_marubozu'];
    const bearPatterns = ['bearish_engulfing', 'evening_star', 'three_black_crows', 'bear_marubozu'];
    
    if (detectedStrong.some(p => bullPatterns.includes(p))) bullishScore += 2;
    if (detectedStrong.some(p => bearPatterns.includes(p))) bearishScore += 2;
  }

  if (structureData.lastBos) {
    triggers.push('bos');
    if (structureData.lastBos === 'bullish') bullishScore += 2;
    if (structureData.lastBos === 'bearish') bearishScore += 2;
  }

  if (structureData.lastChoch) {
    triggers.push('choch');
    if (structureData.lastChoch === 'bullish') bullishScore += 3;
    if (structureData.lastChoch === 'bearish') bearishScore += 3;
  }

  if (Math.abs(indicators.trendScore) > 60) {
    triggers.push('strong_trend');
    if (indicators.trendScore > 60) bullishScore += 2;
    if (indicators.trendScore < -60) bearishScore += 2;
  }

  if (indicators.bollinger.position === 'above_upper' || indicators.bollinger.position === 'below_lower') {
    triggers.push('bb_breakout');
    if (indicators.bollinger.position === 'above_upper') bullishScore += 1;
    if (indicators.bollinger.position === 'below_lower') bearishScore += 1;
  }

  if (indicators.stochRsi.state !== 'neutral') {
    triggers.push('stoch_rsi_reversal');
    if (indicators.stochRsi.state === 'oversold') bullishScore += 1;
    if (indicators.stochRsi.state === 'overbought') bearishScore += 1;
  }

  if (indicators.adx.trendStrength === 'strong' || indicators.adx.trendStrength === 'extreme') {
    triggers.push('adx_trend');
    if (indicators.adx.direction === 'bullish') bullishScore += 1;
    if (indicators.adx.direction === 'bearish') bearishScore += 1;
  }

  const triggered = triggers.length > 0;
  let direction: 'LONG' | 'SHORT' | null = null;
  
  if (bullishScore > bearishScore && bullishScore >= 2) direction = 'LONG';
  else if (bearishScore > bullishScore && bearishScore >= 2) direction = 'SHORT';

  const totalScore = bullishScore + bearishScore;
  let strength: 'weak' | 'moderate' | 'strong' = 'weak';
  if (totalScore >= 4) strength = 'moderate';
  if (totalScore >= 7) strength = 'strong';

  return { triggered, triggers, direction, strength };
}

export function shouldCallAI(
  triggerResult: TriggerResult,
  lastAICallTime: number,
  cooldownMs: number,
  signalsThisHour: number,
  maxSignalsPerHour: number
): { allowed: boolean; reason?: string } {
  if (!triggerResult.triggered) {
    return { allowed: false, reason: 'no_triggers' };
  }

  if (triggerResult.strength === 'weak' && triggerResult.triggers.length < 2) {
    return { allowed: false, reason: 'weak_signal' };
  }

  const now = Date.now();
  if (now - lastAICallTime < cooldownMs) {
    return { allowed: false, reason: 'cooldown_active' };
  }

  if (signalsThisHour >= maxSignalsPerHour) {
    return { allowed: false, reason: 'hourly_limit_reached' };
  }

  return { allowed: true };
}

export type { TriggerResult as TriggerSystemResult };
