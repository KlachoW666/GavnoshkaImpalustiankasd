import { describe, it, expect, vi } from 'vitest';
import { eventBus } from './eventBus';
import type { TradingSignal } from '../types/signal';

describe('eventBus', () => {
  it('should emit and receive signal events', () => {
    const handler = vi.fn();
    eventBus.onSignal(handler);

    const signal: TradingSignal = {
      id: 'test-1',
      timestamp: new Date().toISOString(),
      symbol: 'BTC-USDT',
      exchange: 'OKX',
      direction: 'LONG',
      entry_price: 50000,
      stop_loss: 49000,
      take_profit: [51000],
      confidence: 0.85,
      risk_reward: 2.0,
      timeframe: '5m',
      triggers: ['test'],
      expires_at: new Date(Date.now() + 3600000).toISOString()
    };

    eventBus.emitSignal(signal, { test: true }, 'user123');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(signal, { test: true }, 'user123');

    // Cleanup
    eventBus.removeAllListeners('signal');
  });

  it('should emit and receive breakout events', () => {
    const handler = vi.fn();
    eventBus.onBreakout(handler);

    const data = { symbol: 'ETH-USDT', breakout: { direction: 'LONG', confidence: 0.9 } };
    eventBus.emitBreakout(data);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(data);

    // Cleanup
    eventBus.removeAllListeners('breakout');
  });

  it('should support multiple listeners', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    eventBus.onBreakout(handler1);
    eventBus.onBreakout(handler2);

    eventBus.emitBreakout({ test: true });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);

    // Cleanup
    eventBus.removeAllListeners('breakout');
  });
});
