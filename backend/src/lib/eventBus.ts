/**
 * Application-wide event bus — replaces global namespace pollution for broadcast functions.
 * Uses Node.js EventEmitter for type-safe, decoupled communication between modules.
 */

import { EventEmitter } from 'events';
import type { TradingSignal } from '../types/signal';

export interface AppEvents {
  signal: [signal: TradingSignal, breakdown?: unknown, targetUserId?: string];
  breakout: [data: unknown];
}

class AppEventBus extends EventEmitter {
  emitSignal(signal: TradingSignal, breakdown?: unknown, targetUserId?: string): void {
    this.emit('signal', signal, breakdown, targetUserId);
  }

  emitBreakout(data: unknown): void {
    this.emit('breakout', data);
  }

  onSignal(handler: (signal: TradingSignal, breakdown?: unknown, targetUserId?: string) => void): void {
    this.on('signal', handler);
  }

  onBreakout(handler: (data: unknown) => void): void {
    this.on('breakout', handler);
  }
}

/** Singleton event bus instance */
export const eventBus = new AppEventBus();
