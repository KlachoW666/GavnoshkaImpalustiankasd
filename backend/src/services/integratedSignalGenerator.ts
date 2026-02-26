/**
 * Integrated Signal Generator
 * Объединяет все модули: TechnicalIndicators, SMC, Confluence, Triggers, Confidence, Risk
 */

import { TradingSignal } from '../types/signal';
import { DEFAULT_TRAILING_CONFIG } from '../lib/trailingStop';
import { logger } from '../lib/logger';
import { analyzeTechnical, TechnicalResult } from './technicalIndicators';
import { analyzeSMC, SMCResult } from './smcAnalyzer';
import { checkStrictConfluence, checkRelaxedConfluence, checkSniperConfluence, ConfluenceResult, VolumeData, DOMData } from './strictConfluence';
import { checkTriggers, TriggerResult } from './triggerSystem';
import { calculateFinalConfidence } from './confidenceScorer';
import { assessRisk, calculateRiskReward, validateSignalRisk, RiskAssessment } from './riskManager';
import { analyzeBtcTrend } from './btcCorrelation';
import { runMTFAnalysis } from './mtfAnalyzer';
import { getSymbolSentiment } from './coinglassApi';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number;
}

export interface IntegratedSignalParams {
  symbol: string;
  exchange: string;
  candles: Candle[];
  patterns?: string[];
  volumeData?: VolumeData;
  domData?: DOMData;
  mode?: 'strict' | 'relaxed';
  timeframe?: string;
}

export interface IntegratedSignalResult {
  signal: TradingSignal | null;
  confluence: ConfluenceResult;
  triggers: TriggerResult;
  indicators: TechnicalResult;
  structure: SMCResult;
  riskAssessment: RiskAssessment;
  reason: string;
}

let signalCounter = 0;

export function generateIntegratedSignal(params: IntegratedSignalParams): IntegratedSignalResult {
  const {
    symbol,
    exchange,
    candles,
    patterns = [],
    volumeData = { volumePressure: 'neutral', delta: 0, buySellRatio: 1, volumeSpike: false, cvdDirection: 'neutral' },
    domData = { domSignal: 'balanced', pressureScore: 0, imbalance: 0, bidWalls: 0, askWalls: 0 },
    mode = 'strict',
    timeframe = '5m'
  } = params;

  const emptyResult = (reason: string): IntegratedSignalResult => ({
    signal: null,
    confluence: { passed: false, direction: null, matchedFactors: [], mismatchedFactors: [], score: 0 },
    triggers: { triggered: false, triggers: [], direction: null, strength: 'weak' },
    indicators: { trendScore: 0, momentumScore: 0, ema: {}, emaPositions: {}, sma: {}, supertrend: { direction: 'neutral', value: 0 }, adx: { value: 0, trendStrength: 'weak', direction: 'bullish' }, rsi: { value: 50, state: 'neutral' }, macd: { direction: 'neutral', crossover: 'none' }, stochRsi: { state: 'neutral' }, cci: { state: 'neutral' }, williamsR: { state: 'neutral' }, mfi: { state: 'neutral' }, bollinger: { position: 'unknown' }, atr: { pct: 0, volatility: 'low' }, vwap: { position: 'unknown' }, obv: { trend: 'neutral' } },
    structure: { trend: 'neutral', lastBos: null, lastChoch: null, orderBlocks: [], fairValueGaps: [], swingHighs: [], swingLows: [], structureBias: 'neutral' },
    riskAssessment: { recommendedLeverage: 10, maxLeverage: 10, atrPct: 0, volatilityLevel: 'low', riskPerTrade: 1, maxPositionSizePct: 30 },
    reason
  });

  if (!candles.length || candles.length < 50) {
    return emptyResult('Недостаточно данных для анализа (требуется минимум 50 свечей)');
  }

  const indicators = analyzeTechnical(candles);
  if (indicators.error) {
    return emptyResult(`Ошибка технического анализа: ${indicators.error}`);
  }

  const structure = analyzeSMC(candles);

  const confluence = mode === 'strict'
    ? checkStrictConfluence(symbol, indicators, volumeData, domData, structure)
    : checkRelaxedConfluence(indicators, volumeData, domData, structure);

  if (!confluence.passed) {
    return { ...emptyResult(`Confluence не пройден: ${confluence.mismatchedFactors.join(', ') || 'недостаточно совпадений'}`), confluence, triggers: checkTriggers(indicators, volumeData, domData, structure, patterns), indicators, structure };
  }

  const triggers = checkTriggers(indicators, volumeData, domData, structure, patterns);

  if (!triggers.triggered) {
    return { ...emptyResult('Нет активных триггеров'), confluence, triggers, indicators, structure };
  }

  if (!confluence.direction) {
    return { ...emptyResult('Направление не определено'), confluence, triggers, indicators, structure };
  }

  const direction = confluence.direction;
  const currentPrice = candles[candles.length - 1].close;
  const atrValue = indicators.atr.value ?? currentPrice * 0.01;

  const riskAssessment = assessRisk(indicators);
  const recommendedLeverage = riskAssessment.recommendedLeverage;

  const slPct = indicators.atr.volatility === 'high' ? 0.006 : indicators.atr.volatility === 'moderate' ? 0.008 : 0.01;
  const slDistance = Math.min(atrValue * 1.5, currentPrice * slPct);

  const stopLoss = direction === 'LONG'
    ? currentPrice - slDistance
    : currentPrice + slDistance;

  const risk = Math.abs(currentPrice - stopLoss);
  const rrMin = 2.0;

  const takeProfit1 = direction === 'LONG'
    ? currentPrice + risk * rrMin
    : currentPrice - risk * rrMin;
  const takeProfit2 = direction === 'LONG'
    ? currentPrice + risk * (rrMin + 1.2)
    : currentPrice - risk * (rrMin + 1.2);
  const takeProfit3 = direction === 'LONG'
    ? currentPrice + risk * (rrMin + 2.5)
    : currentPrice - risk * (rrMin + 2.5);

  const rr = calculateRiskReward(currentPrice, stopLoss, [
    { price: takeProfit1, percentage: 40 },
    { price: takeProfit2, percentage: 35 },
    { price: takeProfit3, percentage: 25 }
  ]);

  const baseConfidence = 0.70 + (confluence.score * 0.05) + (triggers.strength === 'strong' ? 0.1 : triggers.strength === 'moderate' ? 0.05 : 0);
  const adjustedConfidence = calculateFinalConfidence(
    baseConfidence,
    direction,
    indicators,
    structure,
    confluence,
    rr
  );

  if (adjustedConfidence < 0.65) {
    return { ...emptyResult(`Confidence слишком низкий: ${(adjustedConfidence * 100).toFixed(0)}%`), confluence, triggers, indicators, structure, riskAssessment };
  }

  const validation = validateSignalRisk(currentPrice, stopLoss, [takeProfit1, takeProfit2, takeProfit3], recommendedLeverage, riskAssessment);
  if (!validation.valid) {
    return { ...emptyResult(`Валидация риска не пройдена: ${validation.errors.join(', ')}`), confluence, triggers, indicators, structure, riskAssessment };
  }

  signalCounter++;
  const id = `sig_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${String(signalCounter).padStart(3, '0')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

  const signal: TradingSignal = {
    id,
    timestamp: now.toISOString(),
    symbol,
    exchange,
    direction,
    entry_price: Math.round(currentPrice * 100) / 100,
    stop_loss: Math.round(stopLoss * 100) / 100,
    take_profit: [
      Math.round(takeProfit1 * 100) / 100,
      Math.round(takeProfit2 * 100) / 100,
      Math.round(takeProfit3 * 100) / 100
    ],
    risk_reward: Math.round(rr * 10) / 10,
    confidence: Math.round(adjustedConfidence * 100) / 100,
    timeframe,
    triggers: triggers.triggers,
    expires_at: expiresAt.toISOString(),
    trailing_stop_config: {
      initial_stop: stopLoss,
      trail_step_pct: DEFAULT_TRAILING_CONFIG.trailStepPct,
      activation_profit_pct: DEFAULT_TRAILING_CONFIG.activationProfitPct
    }
  };

  logger.info('IntegratedSignalGenerator', `Signal generated: ${symbol} ${direction}`, {
    confidence: adjustedConfidence,
    confluenceScore: confluence.score,
    triggers: triggers.triggers.length,
    leverage: recommendedLeverage
  });

  return {
    signal,
    confluence,
    triggers,
    indicators,
    structure,
    riskAssessment,
    reason: `Сигнал ${direction}: confluence ${confluence.score}/5, triggers: ${triggers.triggers.join(', ')}, confidence: ${(adjustedConfidence * 100).toFixed(0)}%`
  };
}

export function quickAnalyze(candles: Candle[]): {
  direction: 'LONG' | 'SHORT' | null;
  confidence: number;
  trendScore: number;
  structureBias: string;
  triggers: string[];
} {
  if (candles.length < 50) {
    return { direction: null, confidence: 0, trendScore: 0, structureBias: 'neutral', triggers: [] };
  }

  const indicators = analyzeTechnical(candles);
  const structure = analyzeSMC(candles);

  const volumeData: VolumeData = {
    volumePressure: 'neutral',
    delta: 0,
    buySellRatio: 1,
    volumeSpike: false,
    cvdDirection: 'neutral'
  };

  const domData: DOMData = {
    domSignal: 'balanced',
    pressureScore: 0,
    imbalance: 0,
    bidWalls: 0,
    askWalls: 0
  };

  const triggers = checkTriggers(indicators, volumeData, domData, structure, []);
  const confluence = checkRelaxedConfluence(indicators, volumeData, domData, structure);

  return {
    direction: confluence.direction,
    confidence: confluence.passed ? 0.6 + confluence.score * 0.08 : 0,
    trendScore: indicators.trendScore,
    structureBias: structure.structureBias,
    triggers: triggers.triggers
  };
}

export interface SniperSignalParams extends IntegratedSignalParams {
  btcCandles1h: Candle[];
  btcCandles4h: Candle[];
}

/**
 * Sniper Mode Signal Generator
 * Implementing the 5-Level Fail-Fast MLFS (Multi-Layered Filtering System).
 */
export async function generateSniperSignal(params: SniperSignalParams): Promise<IntegratedSignalResult | null> {
  const {
    symbol,
    exchange,
    candles,
    btcCandles1h,
    btcCandles4h,
    patterns = [],
    volumeData = { volumePressure: 'neutral', delta: 0, buySellRatio: 1, volumeSpike: false, cvdDirection: 'neutral' },
    domData = { domSignal: 'balanced', pressureScore: 0, imbalance: 0, bidWalls: 0, askWalls: 0 },
    timeframe = '5m'
  } = params;

  const emptyResult = (reason: string): IntegratedSignalResult => ({
    signal: null,
    confluence: { passed: false, direction: null, matchedFactors: [], mismatchedFactors: [], score: 0 },
    triggers: { triggered: false, triggers: [], direction: null, strength: 'weak' },
    indicators: { trendScore: 0, momentumScore: 0, ema: {}, emaPositions: {}, sma: {}, supertrend: { direction: 'neutral', value: 0 }, adx: { value: 0, trendStrength: 'weak', direction: 'bullish' }, rsi: { value: 50, state: 'neutral' }, macd: { direction: 'neutral', crossover: 'none' }, stochRsi: { state: 'neutral' }, cci: { state: 'neutral' }, williamsR: { state: 'neutral' }, mfi: { state: 'neutral' }, bollinger: { position: 'unknown' }, atr: { pct: 0, volatility: 'low' }, vwap: { position: 'unknown' }, obv: { trend: 'neutral' } },
    structure: { trend: 'neutral', lastBos: null, lastChoch: null, orderBlocks: [], fairValueGaps: [], swingHighs: [], swingLows: [], structureBias: 'neutral' },
    riskAssessment: { recommendedLeverage: 10, maxLeverage: 10, atrPct: 0, volatilityLevel: 'low', riskPerTrade: 1, maxPositionSizePct: 30 },
    reason
  });

  if (!candles.length || candles.length < 50) return emptyResult('Skipped: Insufficient candles');

  const indicators = analyzeTechnical(candles);
  if (indicators.error) return emptyResult(`Skipped: TA Error: ${indicators.error}`);

  const structure = analyzeSMC(candles);

  // LEVEL 4 (DOM & Clusters) - Strict Confluence & Tape checks
  const confluence = checkSniperConfluence(symbol, indicators, volumeData, domData, structure);
  if (!confluence.passed || !confluence.direction) {
    return emptyResult(`Level 4 (DOM/SMC) Failed: ${confluence.mismatchedFactors.join(', ')}`);
  }

  const direction = confluence.direction;

  // LEVEL 5.1 (SMC Structure Strict Check)
  // Must have an active BOS or CHoCH in the direction of the trade
  if (direction === 'LONG' && structure.lastBos !== 'bullish' && structure.lastChoch !== 'bullish') {
    return emptyResult('Level 5 (SMC) Failed: No Bullish BOS or CHoCH');
  }
  if (direction === 'SHORT' && structure.lastBos !== 'bearish' && structure.lastChoch !== 'bearish') {
    return emptyResult('Level 5 (SMC) Failed: No Bearish BOS or CHoCH');
  }

  // LEVEL 1 (Macro BTC Filter)
  if (btcCandles1h.length > 5 && btcCandles4h.length > 3) {
    const btcTrend = analyzeBtcTrend(btcCandles1h, btcCandles4h);
    if (direction === 'LONG' && btcTrend.blockLong) return emptyResult('Level 1 (BTC) Failed: Bearish BTC blocks LONG');
    if (direction === 'SHORT' && btcTrend.blockShort) return emptyResult('Level 1 (BTC) Failed: Bullish BTC blocks SHORT');
  }

  // Calculate Risk (LEVEL 5.2 - Risk/Reward)
  const currentPrice = candles[candles.length - 1].close;
  const atrValue = indicators.atr.value ?? currentPrice * 0.01;
  const slPct = indicators.atr.volatility === 'high' ? 0.005 : indicators.atr.volatility === 'moderate' ? 0.007 : 0.01;
  const slDistance = Math.min(atrValue * 1.5, currentPrice * slPct);

  const stopLoss = direction === 'LONG' ? currentPrice - slDistance : currentPrice + slDistance;
  const risk = Math.abs(currentPrice - stopLoss);

  // Sniper mode enforces Minimum 2.5 R:R
  const rrMin = 2.5;
  const takeProfit1 = direction === 'LONG' ? currentPrice + risk * rrMin : currentPrice - risk * rrMin;
  const takeProfit2 = direction === 'LONG' ? currentPrice + risk * (rrMin + 1.0) : currentPrice - risk * (rrMin + 1.0);
  const takeProfit3 = direction === 'LONG' ? currentPrice + risk * (rrMin + 2.5) : currentPrice - risk * (rrMin + 2.5);

  const rr = calculateRiskReward(currentPrice, stopLoss, [
    { price: takeProfit1, percentage: 40 },
    { price: takeProfit2, percentage: 35 },
    { price: takeProfit3, percentage: 25 }
  ]);

  if (rr < 2.5) {
    return emptyResult(`Level 5 (Risk) Failed: R:R ${rr.toFixed(2)} is less than 2.5`);
  }

  // LEVEL 2 (MTF Alignment) - Expensive, do this only after local checks pass
  const mtf = await runMTFAnalysis(symbol, ['5m', '15m', '1h', '4h']);
  if (!mtf.isPerfectAlignment || mtf.direction !== direction) {
    return emptyResult(`Level 2 (MTF) Failed: Not perfectly aligned for ${direction} (Alignment: ${mtf.alignCount}/${mtf.totalTfs})`);
  }

  // LEVEL 1.5 (CoinGlass Retail Sentiment) - External API Request
  const sentiment = await getSymbolSentiment(symbol);
  if (sentiment) {
    if (direction === 'LONG' && sentiment.longShortRatio > 2.5) {
      return emptyResult(`Level 1.5 (CoinGlass) Failed: Retail is too Long (${sentiment.longShortRatio.toFixed(2)})`);
    }
    if (direction === 'SHORT' && sentiment.longShortRatio < 0.4) {
      return emptyResult(`Level 1.5 (CoinGlass) Failed: Retail is too Short (${sentiment.longShortRatio.toFixed(2)})`);
    }
  }

  // All checks passed - High Confidence Trade
  const triggers = checkTriggers(indicators, volumeData, domData, structure, patterns);
  const riskAssessment = assessRisk(indicators);
  const recommendedLeverage = riskAssessment.recommendedLeverage;

  const baseConfidence = 0.85 + (confluence.score * 0.03);
  const adjustedConfidence = calculateFinalConfidence(
    baseConfidence,
    direction,
    indicators,
    structure,
    confluence,
    rr
  ); // For Sniper Mode, this should be > 0.90 usually.

  signalCounter++;
  const id = `sniper_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${String(signalCounter).padStart(3, '0')}`;
  const now = new Date();

  const signal: TradingSignal = {
    id,
    timestamp: now.toISOString(),
    symbol,
    exchange,
    direction,
    entry_price: Math.round(currentPrice * 100) / 100,
    stop_loss: Math.round(stopLoss * 100) / 100,
    take_profit: [
      Math.round(takeProfit1 * 100) / 100,
      Math.round(takeProfit2 * 100) / 100,
      Math.round(takeProfit3 * 100) / 100
    ],
    risk_reward: Math.round(rr * 10) / 10,
    confidence: Math.round(adjustedConfidence * 100) / 100,
    timeframe,
    triggers: triggers.triggers,
    expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    trailing_stop_config: {
      initial_stop: stopLoss,
      trail_step_pct: DEFAULT_TRAILING_CONFIG.trailStepPct,
      activation_profit_pct: DEFAULT_TRAILING_CONFIG.activationProfitPct
    }
  };

  logger.info('SniperSignalGenerator', `SNIPER SIGNAL GENERATED: ${symbol} ${direction}`, {
    confidence: adjustedConfidence,
    rr,
    mtfAlignment: mtf.isPerfectAlignment,
    sentimentRatio: sentiment?.longShortRatio
  });

  return {
    signal,
    confluence,
    triggers,
    indicators,
    structure,
    riskAssessment,
    reason: `Sniper Signal ${direction}: Passed ALL MLFS levels. R:R ${rr.toFixed(1)}, Confidence ${(adjustedConfidence * 100).toFixed(0)}%.`
  };
}
