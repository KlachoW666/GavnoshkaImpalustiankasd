/**
 * Формат торгового сигнала (раздел 6 ТЗ)
 */
export interface TradingSignal {
  id: string;
  timestamp: string;
  symbol: string;
  exchange: string;
  direction: 'LONG' | 'SHORT';
  entry_price: number;
  stop_loss: number;
  take_profit: number[];
  risk_reward: number;
  confidence: number;
  timeframe: string;
  triggers: string[];
  expires_at: string;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.70) return 'medium';
  return 'low';
}
