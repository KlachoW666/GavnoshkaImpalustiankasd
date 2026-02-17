/**
 * Session-Aware Filter — учёт времени суток для торговли.
 * Волатильность и ликвидность зависят от торговой сессии.
 * 
 * Сессии (UTC):
 * - Asia:    00:00-08:00 UTC (низкая ликвидность для крипто)
 * - Europe:  07:00-16:00 UTC (средняя ликвидность)
 * - America: 13:00-22:00 UTC (высокая ликвидность)
 * - Overlap: 13:00-16:00 UTC (максимальная ликвидность)
 * - Dead:    22:00-00:00 UTC (минимальная ликвидность)
 */

export type TradingSession = 'asia' | 'europe' | 'america' | 'overlap' | 'dead';

export interface SessionInfo {
  session: TradingSession;
  /** Множитель ликвидности (0.5-1.2) */
  liquidityMultiplier: number;
  /** Штраф к confidence в низколиквидные часы */
  confidencePenalty: number;
  /** Рекомендация по размеру позиции (0.5-1.0) */
  positionSizeMultiplier: number;
  /** Описание для UI */
  description: string;
}

/**
 * Определяет текущую торговую сессию и возвращает рекомендации.
 */
export function getCurrentSession(now: Date = new Date()): SessionInfo {
  const utcHour = now.getUTCHours();

  // Overlap: Europe + America (максимальная ликвидность)
  if (utcHour >= 13 && utcHour < 16) {
    return {
      session: 'overlap',
      liquidityMultiplier: 1.2,
      confidencePenalty: 0,
      positionSizeMultiplier: 1.0,
      description: 'Europe/America overlap — максимальная ликвидность'
    };
  }

  // America session
  if (utcHour >= 13 && utcHour < 22) {
    return {
      session: 'america',
      liquidityMultiplier: 1.1,
      confidencePenalty: 0,
      positionSizeMultiplier: 1.0,
      description: 'American session — высокая ликвидность'
    };
  }

  // Europe session
  if (utcHour >= 7 && utcHour < 16) {
    return {
      session: 'europe',
      liquidityMultiplier: 1.0,
      confidencePenalty: 0,
      positionSizeMultiplier: 1.0,
      description: 'European session — средняя ликвидность'
    };
  }

  // Asia session
  if (utcHour >= 0 && utcHour < 8) {
    return {
      session: 'asia',
      liquidityMultiplier: 0.7,
      confidencePenalty: 0.03,
      positionSizeMultiplier: 0.8,
      description: 'Asian session — пониженная ликвидность, осторожнее с размером'
    };
  }

  // Dead zone (22:00-00:00 UTC)
  return {
    session: 'dead',
    liquidityMultiplier: 0.5,
    confidencePenalty: 0.05,
    positionSizeMultiplier: 0.6,
    description: 'Low liquidity zone — минимальная ликвидность, рекомендуется уменьшить размер'
  };
}

/**
 * Применяет session-aware корректировку к confidence.
 */
export function applySessionFilter(confidence: number, session: SessionInfo): number {
  if (session.confidencePenalty > 0) {
    return Math.max(0.45, confidence - session.confidencePenalty);
  }
  return confidence;
}
