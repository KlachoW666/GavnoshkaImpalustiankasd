/**
 * Динамический расчёт размера позиции (generate-pdf.js + Schwager)
 * Размер позиции = Риск в $ / (Размер стопа в % от цены)
 */

/** Риск на сделку 1–2%, макс 3% */
export const RISK_PCT_PER_TRADE = 0.02;
export const RISK_MAX_PCT = 0.03;

/** Burniske: диверсификация — не более X% в один актив */
export const MAX_SINGLE_ASSET_PCT = 0.25;

/**
 * Расчёт размера позиции по риску (Schwager)
 * @returns sizeUsd — рекомендуемый размер позиции в $
 */
export function calcPositionSizeFromRisk(
  deposit: number,
  entryPrice: number,
  stopPrice: number,
  riskPct: number = RISK_PCT_PER_TRADE,
  maxRiskPct: number = RISK_MAX_PCT
): { sizeUsd: number; riskUsd: number; stopPct: number } {
  const riskUsd = deposit * Math.min(riskPct, maxRiskPct);
  const stopPct = Math.abs(entryPrice - stopPrice) / entryPrice;
  if (stopPct <= 0) return { sizeUsd: 0, riskUsd: 0, stopPct: 0 };
  const sizeUsd = riskUsd / stopPct;
  return { sizeUsd, riskUsd, stopPct };
}

/**
 * Получить размер позиции с учётом лимитов (Risk Manager из generate-pdf.js)
 * Ограничение: позиция не более MAX_SINGLE_ASSET_PCT от баланса
 */
export function getPositionSize(
  balance: number,
  entryPrice: number,
  stopPrice: number,
  options?: { riskPct?: number; maxAssetPct?: number; fallbackPct?: number }
): number {
  const riskPct = options?.riskPct ?? RISK_PCT_PER_TRADE;
  const maxAssetPct = options?.maxAssetPct ?? MAX_SINGLE_ASSET_PCT;
  const fallbackPct = options?.fallbackPct ?? 0.05;

  if (balance <= 0) return 0;

  const { sizeUsd } = calcPositionSizeFromRisk(balance, entryPrice, stopPrice, riskPct);
  const maxByBalance = balance * maxAssetPct;

  let size = Math.min(sizeUsd, maxByBalance);
  if (size <= 0 || size > balance) {
    size = balance * fallbackPct;
  }
  return Math.min(size, balance);
}
