/**
 * Fundamental Filter (generate-complete-guide.js, Burniske & Tatar)
 * Барьер безопасности: если фундаментал плохой — технический сигнал игнорируется.
 * Layer 2 в 4-Layer Model.
 * 
 * Расширен: funding rate bias, open interest dynamics.
 */

import { SPREAD_CAUTION_PCT } from './marketAnalysis';

/** Burniske: NVT > 100 = перекупленность сети, сигнал на покупку блокируется */
export const NVT_OVERVALUED_THRESHOLD = 100;

/** Funding rate пороги: экстремальный funding = перегретый рынок */
export const FUNDING_EXTREME_LONG = 0.001;   // 0.1% — слишком много лонгов
export const FUNDING_EXTREME_SHORT = -0.001;  // -0.1% — слишком много шортов

/** Метрики on-chain (заглушка — при подключении Glassnode/Dune) */
export interface OnChainMetrics {
  activeAddresses?: number;
  nvtRatio?: number;
}

/** Расширенные рыночные метрики */
export interface MarketMetrics {
  /** Funding rate (0.0001 = 0.01%) */
  fundingRate?: number;
  /** Open Interest в USDT */
  openInterest?: number;
  /** Изменение OI за последний час (%) */
  oiChange1h?: number;
}

export interface FundamentalResult {
  valid: boolean;
  /** Штраф к confidence на основе фундаментала */
  confidencePenalty: number;
  /** Причина блокировки или штрафа */
  reason?: string;
  /** Funding rate bias: 'long_crowded' | 'short_crowded' | null */
  fundingBias?: 'long_crowded' | 'short_crowded' | null;
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
    return this.analyze(spreadPct, undefined, undefined, metrics).valid;
  }

  /**
   * Расширенный анализ фундаментала с рекомендациями.
   */
  analyze(
    spreadPct: number,
    direction?: 'LONG' | 'SHORT',
    market?: MarketMetrics | null,
    onChain?: OnChainMetrics | null
  ): FundamentalResult {
    // Ликвидность: высокий спред = слабый рынок
    if (spreadPct > SPREAD_CAUTION_PCT) {
      return { valid: false, confidencePenalty: 0, reason: `Спред ${(spreadPct * 100).toFixed(3)}% > ${(SPREAD_CAUTION_PCT * 100).toFixed(2)}% — низкая ликвидность` };
    }

    // Burniske: NVT > 100 = сеть переоценена
    if (onChain?.nvtRatio != null && onChain.nvtRatio > NVT_OVERVALUED_THRESHOLD) {
      return { valid: false, confidencePenalty: 0, reason: `NVT ${onChain.nvtRatio} > ${NVT_OVERVALUED_THRESHOLD} — сеть переоценена` };
    }

    let confidencePenalty = 0;
    let fundingBias: 'long_crowded' | 'short_crowded' | null = null;
    let reason: string | undefined;

    // Funding rate analysis
    if (market?.fundingRate != null && direction) {
      const fr = market.fundingRate;

      // Экстремальный положительный funding = слишком много лонгов
      if (fr > FUNDING_EXTREME_LONG) {
        fundingBias = 'long_crowded';
        if (direction === 'LONG') {
          // LONG при перегретом лонг-рынке — рискованно
          confidencePenalty += 0.06;
          reason = `Funding rate ${(fr * 100).toFixed(3)}% — рынок перегрет лонгами, LONG рискован`;
        } else {
          // SHORT при перегретом лонг-рынке — может быть хорошей идеей (контр-тренд)
          confidencePenalty -= 0.02; // бонус
        }
      }

      // Экстремальный отрицательный funding = слишком много шортов
      if (fr < FUNDING_EXTREME_SHORT) {
        fundingBias = 'short_crowded';
        if (direction === 'SHORT') {
          confidencePenalty += 0.06;
          reason = `Funding rate ${(fr * 100).toFixed(3)}% — рынок перегрет шортами, SHORT рискован`;
        } else {
          confidencePenalty -= 0.02; // бонус для LONG
        }
      }
    }

    // OI dynamics: резкий рост OI + направление = потенциальный squeeze
    if (market?.oiChange1h != null && Math.abs(market.oiChange1h) > 5) {
      if (direction === 'LONG' && market.oiChange1h > 5 && fundingBias === 'long_crowded') {
        confidencePenalty += 0.04;
        reason = (reason ? reason + '; ' : '') + `OI вырос на ${market.oiChange1h.toFixed(1)}% при crowded longs — риск long squeeze`;
      }
      if (direction === 'SHORT' && market.oiChange1h > 5 && fundingBias === 'short_crowded') {
        confidencePenalty += 0.04;
        reason = (reason ? reason + '; ' : '') + `OI вырос на ${market.oiChange1h.toFixed(1)}% при crowded shorts — риск short squeeze`;
      }
    }

    return {
      valid: true,
      confidencePenalty: Math.max(-0.05, confidencePenalty), // бонус не более 5%
      reason,
      fundingBias
    };
  }
}
