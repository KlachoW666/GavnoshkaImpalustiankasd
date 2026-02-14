/**
 * Расчёт размера позиции по риску (Schwager)
 * size = riskUsd / stopPct, ограничено долей баланса
 */

const RISK_PCT_DEFAULT = 0.02;
const RISK_MAX_PCT = 0.03;
const MAX_SINGLE_ASSET_PCT = 0.25;

export function getPositionSize(
  balance: number,
  entryPrice: number,
  stopPrice: number,
  options?: { riskPct?: number; maxAssetPct?: number; fallbackPct?: number }
): number {
  const riskPct = options?.riskPct ?? RISK_PCT_DEFAULT;
  const maxAssetPct = options?.maxAssetPct ?? MAX_SINGLE_ASSET_PCT;
  const fallbackPct = options?.fallbackPct ?? 0.05;

  if (balance <= 0) return 0;

  const riskUsd = balance * Math.min(riskPct, RISK_MAX_PCT);
  const stopPct = Math.abs(entryPrice - stopPrice) / entryPrice;
  if (stopPct <= 0) return balance * fallbackPct;

  const sizeUsd = riskUsd / stopPct;
  const maxByBalance = balance * maxAssetPct;
  let size = Math.min(sizeUsd, maxByBalance);
  if (size <= 0 || size > balance) size = balance * fallbackPct;
  return Math.min(size, balance);
}
