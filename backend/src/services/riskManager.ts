/**
 * Risk Manager
 * ATR-based leverage suggestions и risk calculations
 */

import { TechnicalResult } from './technicalIndicators';

export interface RiskAssessment {
  recommendedLeverage: number;
  maxLeverage: number;
  atrPct: number;
  volatilityLevel: 'low' | 'moderate' | 'high';
  riskPerTrade: number;
  maxPositionSizePct: number;
}

export interface PositionSizing {
  contracts: number;
  marginUsdt: number;
  liquidationPrice: number;
  maxLossUsdt: number;
  maxProfitUsdt: number;
}

const DEFAULT_RISK_PCT = 1.0;
const MAX_LEVERAGE_LIMIT = 20;

export function suggestLeverage(atrPct: number): number {
  if (atrPct >= 3.0) return 3;
  if (atrPct >= 2.0) return 5;
  if (atrPct >= 1.5) return 8;
  if (atrPct >= 1.0) return 10;
  if (atrPct >= 0.5) return 15;
  return 20;
}

export function assessRisk(indicators: TechnicalResult): RiskAssessment {
  const atrPct = indicators.atr.pct;
  const recommendedLeverage = suggestLeverage(atrPct);
  
  let volatilityLevel: 'low' | 'moderate' | 'high' = 'low';
  if (atrPct > 2) volatilityLevel = 'high';
  else if (atrPct > 1) volatilityLevel = 'moderate';

  const maxPositionSizePct = volatilityLevel === 'high' ? 10 : volatilityLevel === 'moderate' ? 20 : 30;

  return {
    recommendedLeverage,
    maxLeverage: Math.min(recommendedLeverage, MAX_LEVERAGE_LIMIT),
    atrPct,
    volatilityLevel,
    riskPerTrade: DEFAULT_RISK_PCT,
    maxPositionSizePct
  };
}

export function calculatePositionSize(
  balance: number,
  riskPct: number,
  entryPrice: number,
  stopLoss: number,
  leverage: number
): PositionSizing {
  const riskAmount = balance * (riskPct / 100);
  const priceDiff = Math.abs(entryPrice - stopLoss);

  if (priceDiff === 0) {
    return { contracts: 0, marginUsdt: 0, liquidationPrice: 0, maxLossUsdt: 0, maxProfitUsdt: 0 };
  }

  const contracts = riskAmount / priceDiff;
  const positionValue = contracts * entryPrice;
  const marginUsdt = positionValue / leverage;

  const liqDistance = entryPrice * (1 / leverage);
  const liquidationPrice = entryPrice > stopLoss 
    ? entryPrice - liqDistance * 0.9
    : entryPrice + liqDistance * 0.9;

  const maxLossUsdt = riskAmount;
  const maxProfitUsdt = riskAmount * 2;

  return {
    contracts: Math.round(contracts * 1000) / 1000,
    marginUsdt: Math.round(marginUsdt * 100) / 100,
    liquidationPrice: Math.round(liquidationPrice * 100) / 100,
    maxLossUsdt: Math.round(maxLossUsdt * 100) / 100,
    maxProfitUsdt: Math.round(maxProfitUsdt * 100) / 100
  };
}

export function calculateRiskReward(
  entryPrice: number,
  stopLoss: number,
  takeProfits: { price: number; percentage: number }[]
): number {
  const risk = Math.abs(entryPrice - stopLoss);
  if (risk === 0 || !takeProfits.length) return 0;

  let weightedReward = 0;
  let totalPct = 0;

  for (const tp of takeProfits) {
    const reward = Math.abs(tp.price - entryPrice);
    weightedReward += reward * (tp.percentage / 100);
    totalPct += tp.percentage / 100;
  }

  const avgReward = totalPct > 0 ? weightedReward / totalPct : Math.abs(takeProfits[0].price - entryPrice);

  return Math.round((avgReward / risk) * 100) / 100;
}

export function validateSignalRisk(
  entryPrice: number,
  stopLoss: number,
  takeProfits: number[],
  leverage: number,
  riskAssessment: RiskAssessment
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const risk = Math.abs(entryPrice - stopLoss);
  const riskPct = (risk / entryPrice) * 100;

  if (riskPct > 10) {
    errors.push(`Stop loss too far: ${riskPct.toFixed(1)}% from entry`);
  }

  if (riskPct < 0.2) {
    warnings.push(`Stop loss very close: ${riskPct.toFixed(2)}% from entry`);
  }

  if (leverage > riskAssessment.recommendedLeverage) {
    warnings.push(`Leverage ${leverage}x exceeds recommended ${riskAssessment.recommendedLeverage}x for current volatility`);
  }

  if (!takeProfits.length) {
    errors.push('No take profit levels defined');
  }

  const minTP = Math.min(...takeProfits);
  const maxTP = Math.max(...takeProfits);

  const direction = stopLoss < entryPrice ? 'LONG' : 'SHORT';
  
  if (direction === 'LONG') {
    if (minTP <= entryPrice) {
      errors.push('Take profit must be above entry for LONG');
    }
    if (stopLoss >= entryPrice) {
      errors.push('Stop loss must be below entry for LONG');
    }
  } else {
    if (maxTP >= entryPrice) {
      errors.push('Take profit must be below entry for SHORT');
    }
    if (stopLoss <= entryPrice) {
      errors.push('Stop loss must be above entry for SHORT');
    }
  }

  const avgTP = takeProfits.reduce((a, b) => a + b, 0) / takeProfits.length;
  const rr = Math.abs(avgTP - entryPrice) / risk;
  
  if (rr < 1.5) {
    warnings.push(`Risk:Reward ratio ${rr.toFixed(2)} is below 1.5`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function getRiskSummary(
  balance: number,
  entryPrice: number,
  stopLoss: number,
  takeProfits: number[],
  leverage: number
): {
  riskPct: number;
  rrRatio: number;
  positionSize: number;
  maxLossUsdt: number;
  maxProfitUsdt: number;
  marginUsdt: number;
} {
  const risk = Math.abs(entryPrice - stopLoss);
  const riskPct = (risk / entryPrice) * 100;
  
  const rr = calculateRiskReward(entryPrice, stopLoss, takeProfits.map((p, i) => ({
    price: p,
    percentage: i === 0 ? 40 : i === 1 ? 35 : 25
  })));

  const position = calculatePositionSize(balance, DEFAULT_RISK_PCT, entryPrice, stopLoss, leverage);
  const maxLossUsdt = balance * 0.01;
  const maxProfitUsdt = maxLossUsdt * rr;

  return {
    riskPct: Math.round(riskPct * 100) / 100,
    rrRatio: rr,
    positionSize: position.contracts,
    maxLossUsdt: Math.round(maxLossUsdt * 100) / 100,
    maxProfitUsdt: Math.round(maxProfitUsdt * 100) / 100,
    marginUsdt: position.marginUsdt
  };
}

export type { RiskAssessment as RiskManagerResult };
