/**
 * Fundamental Filter (generate-complete-guide.js, Burniske & Tatar)
 * Барьер безопасности: если фундаментал плохой — технический сигнал игнорируется.
 * Layer 2 в 4-Layer Model.
 */

import { SPREAD_CAUTION_PCT } from './marketAnalysis';

/** Burniske: NVT > 100 = перекупленность сети, сигнал на покупку блокируется */
export const NVT_OVERVALUED_THRESHOLD = 100;

/** Метрики on-chain (заглушка — при подключении Glassnode/Dune) */
export interface OnChainMetrics {
  activeAddresses?: number;
  nvtRatio?: number;
}

/**
 * FundamentalFilter — проверка фундаментала перед исполнением (Burniske)
 * Торговля разрешена только при здоровой сети / ликвидности.
 */
export class FundamentalFilter {
  /**
   * Проверка: можно ли исполнять сделку по фундаменталу
   * @param spreadPct — спред стакана (proxy ликвидности)
   * @param metrics — on-chain метрики (опционально)
   */
  isValid(spreadPct: number, metrics?: OnChainMetrics | null): boolean {
    // Ликвидность: высокий спред = слабый рынок (Schwager: объём подтверждает)
    if (spreadPct > SPREAD_CAUTION_PCT) return false;

    // Burniske: NVT > 100 = сеть переоценена, не покупаем
    if (metrics?.nvtRatio != null && metrics.nvtRatio > NVT_OVERVALUED_THRESHOLD) {
      return false;
    }

    return true;
  }
}
