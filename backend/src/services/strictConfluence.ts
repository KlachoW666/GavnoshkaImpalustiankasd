/**
 * Strict Confluence Checker
 * Проверка совпадения 4 факторов: Trend, Volume, DOM, Structure
 * Сигнал разрешён ТОЛЬКО если все 4 фактора смотрят в одну сторону
 */

import { TechnicalResult } from './technicalIndicators';
import { SMCResult } from './smcAnalyzer';

export interface VolumeData {
  volumePressure: 'strong_buying' | 'buying' | 'neutral' | 'selling' | 'strong_selling' | 'high_activity';
  delta: number;
  buySellRatio: number;
  volumeSpike: boolean;
  cvdDirection: 'bullish' | 'bearish' | 'neutral';
}

export interface DOMData {
  domSignal: 'strong_buy_pressure' | 'moderate_buy_pressure' | 'balanced' | 'moderate_sell_pressure' | 'strong_sell_pressure';
  pressureScore: number;
  imbalance: number;
  bidWalls: number;
  askWalls: number;
}

export interface ConfluenceResult {
  passed: boolean;
  direction: 'LONG' | 'SHORT' | null;
  matchedFactors: string[];
  mismatchedFactors: string[];
  score: number;
}

export function checkStrictConfluence(
  pair: string,
  indicators: TechnicalResult,
  volumeData: VolumeData,
  domData: DOMData,
  structureData: SMCResult
): ConfluenceResult {
  const matchedFactors: string[] = [];
  const mismatchedFactors: string[] = [];

  const trendScore = indicators.trendScore;
  const supertrend = indicators.supertrend.direction;
  const volumePressure = volumeData.volumePressure;
  const domSignal = domData.domSignal;
  const structureBias = structureData.structureBias;

  const longConditions = {
    trend: trendScore > 30,
    supertrend: supertrend === 'bullish',
    volume: ['buying', 'strong_buying'].includes(volumePressure),
    dom: ['moderate_buy_pressure', 'strong_buy_pressure'].includes(domSignal),
    structure: structureBias.includes('bullish')
  };

  const shortConditions = {
    trend: trendScore < -30,
    supertrend: supertrend === 'bearish',
    volume: ['selling', 'strong_selling'].includes(volumePressure),
    dom: ['moderate_sell_pressure', 'strong_sell_pressure'].includes(domSignal),
    structure: structureBias.includes('bearish')
  };

  const longMatches = Object.entries(longConditions).filter(([_, v]) => v).map(([k]) => k);
  const longMismatches = Object.entries(longConditions).filter(([_, v]) => !v).map(([k]) => k);

  const shortMatches = Object.entries(shortConditions).filter(([_, v]) => v).map(([k]) => k);
  const shortMismatches = Object.entries(shortConditions).filter(([_, v]) => !v).map(([k]) => k);

  const longScore = longMatches.length;
  const shortScore = shortMatches.length;

  if (longScore >= 4 && longMismatches.length <= 1) {
    return {
      passed: true,
      direction: 'LONG',
      matchedFactors: longMatches,
      mismatchedFactors: longMismatches,
      score: longScore
    };
  }

  if (shortScore >= 4 && shortMismatches.length <= 1) {
    return {
      passed: true,
      direction: 'SHORT',
      matchedFactors: shortMatches,
      mismatchedFactors: shortMismatches,
      score: shortScore
    };
  }

  if (longScore === 3 && longMismatches.length === 2) {
    const criticalMismatch = longMismatches.includes('structure') || longMismatches.includes('volume');
    if (!criticalMismatch) {
      return {
        passed: true,
        direction: 'LONG',
        matchedFactors: longMatches,
        mismatchedFactors: longMismatches,
        score: longScore
      };
    }
  }

  if (shortScore === 3 && shortMismatches.length === 2) {
    const criticalMismatch = shortMismatches.includes('structure') || shortMismatches.includes('volume');
    if (!criticalMismatch) {
      return {
        passed: true,
        direction: 'SHORT',
        matchedFactors: shortMatches,
        mismatchedFactors: shortMismatches,
        score: shortScore
      };
    }
  }

  return {
    passed: false,
    direction: null,
    matchedFactors: longScore > shortScore ? longMatches : shortMatches,
    mismatchedFactors: longScore > shortScore ? longMismatches : shortMismatches,
    score: Math.max(longScore, shortScore)
  };
}

export function checkRelaxedConfluence(
  indicators: TechnicalResult,
  volumeData: VolumeData,
  domData: DOMData,
  structureData: SMCResult
): ConfluenceResult {
  const strictResult = checkStrictConfluence('', indicators, volumeData, domData, structureData);

  if (strictResult.passed) return strictResult;

  const trendScore = indicators.trendScore;
  const supertrend = indicators.supertrend.direction;
  const volumePressure = volumeData.volumePressure;
  const domSignal = domData.domSignal;
  const structureBias = structureData.structureBias;

  let longScore = 0;
  let shortScore = 0;

  if (trendScore > 20) longScore++;
  if (trendScore < -20) shortScore++;

  if (supertrend === 'bullish') longScore++;
  if (supertrend === 'bearish') shortScore++;

  if (['buying', 'strong_buying'].includes(volumePressure)) longScore++;
  if (['selling', 'strong_selling'].includes(volumePressure)) shortScore++;

  if (['moderate_buy_pressure', 'strong_buy_pressure'].includes(domSignal)) longScore++;
  if (['moderate_sell_pressure', 'strong_sell_pressure'].includes(domSignal)) shortScore++;

  if (structureBias.includes('bullish')) longScore++;
  if (structureBias.includes('bearish')) shortScore++;

  if (indicators.adx.trendStrength !== 'weak') {
    if (indicators.adx.direction === 'bullish') longScore += 0.5;
    else shortScore += 0.5;
  }

  if (longScore >= 3 && longScore > shortScore * 1.5) {
    return {
      passed: true,
      direction: 'LONG',
      matchedFactors: [],
      mismatchedFactors: [],
      score: longScore
    };
  }

  if (shortScore >= 3 && shortScore > longScore * 1.5) {
    return {
      passed: true,
      direction: 'SHORT',
      matchedFactors: [],
      mismatchedFactors: [],
      score: shortScore
    };
  }

  return {
    passed: false,
    direction: null,
    matchedFactors: [],
    mismatchedFactors: [],
    score: Math.max(longScore, shortScore)
  };
}

/**
 * Уровень 3 & 4 Sniper Mode: Максимально жесткие фильтры стакана и ленты
 */
export function checkSniperConfluence(
  pair: string,
  indicators: TechnicalResult,
  volumeData: VolumeData,
  domData: DOMData,
  structureData: SMCResult
): ConfluenceResult {
  const strict = checkStrictConfluence(pair, indicators, volumeData, domData, structureData);

  if (!strict.passed || !strict.direction) {
    return strict;
  }

  const isLong = strict.direction === 'LONG';
  const isShort = strict.direction === 'SHORT';

  // Sniper DOM/Tape Rules
  let sniperPassed = true;
  const failReasons: string[] = [];

  if (isLong) {
    if (domData.askWalls > 0) {
      sniperPassed = false;
      failReasons.push('Ask walls detected blocking LONG');
    }
    if (domData.imbalance < 0.6 && domData.pressureScore < 2) {
      sniperPassed = false;
      failReasons.push(`Weak Bid Imbalance: ${(domData.imbalance * 100).toFixed(0)}%`);
    }
    if (volumeData.cvdDirection !== 'bullish') {
      sniperPassed = false;
      failReasons.push('CVD is not Bullish');
    }
    if (!volumeData.volumeSpike) {
      sniperPassed = false;
      failReasons.push('No Volume Spike detected');
    }
  }

  if (isShort) {
    if (domData.bidWalls > 0) {
      sniperPassed = false;
      failReasons.push('Bid walls detected blocking SHORT');
    }
    if (domData.imbalance > -0.6 && domData.pressureScore > -2) {
      sniperPassed = false;
      failReasons.push(`Weak Ask Imbalance: ${(domData.imbalance * 100).toFixed(0)}%`);
    }
    if (volumeData.cvdDirection !== 'bearish') {
      sniperPassed = false;
      failReasons.push('CVD is not Bearish');
    }
    if (!volumeData.volumeSpike) {
      sniperPassed = false;
      failReasons.push('No Volume Spike detected');
    }
  }

  if (!sniperPassed) {
    return {
      passed: false,
      direction: null,
      matchedFactors: strict.matchedFactors,
      mismatchedFactors: [...strict.mismatchedFactors, ...failReasons],
      score: strict.score
    };
  }

  return strict;
}

export type { ConfluenceResult as StrictConfluenceResult };
