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

export interface OHLCVCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
