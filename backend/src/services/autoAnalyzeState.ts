/**
 * Auto-analyze state management — extracted from market.ts for better separation of concerns.
 * Manages per-user auto-trading timers, persisted state, and last execution results.
 */

import { logger } from '../lib/logger';
import { getSetting, setSetting } from '../db';

const AUTO_ANALYZE_STATE_KEY = 'auto_analyze_persisted_state';

export interface PerUserAutoState {
  timer: ReturnType<typeof setInterval>;
  intervalMs: number;
  lastCycleAt: number;
  executeOrders: boolean;
  useTestnet: boolean;
  maxPositions: number;
  sizePercent: number;
  sizeMode: 'percent' | 'risk';
  riskPct: number;
  leverage: number;
  tpMultiplier: number;
  /** AI-фильтр: мин. вероятность выигрыша (0–1). 0 = выкл. */
  minAiProb: number;
  fullAuto: boolean;
}

/** Результат последнего исполнения по userId (для отображения на фронте) */
export interface LastExecutionEntry {
  lastError?: string;
  lastSkipReason?: string;
  lastOrderId?: string;
  useTestnet?: boolean;
  at: number;
  lastAiProb?: number;
  lastEffectiveAiProb?: number;
  lastExternalAiScore?: number;
  lastExternalAiUsed?: boolean;
}

/** Глобальные флаги (fallback при отсутствии per-user опций) */
export const globalDefaults = {
  executeOrders: false,
  useTestnet: true,
  maxPositions: 2,
  sizePercent: 25,
  leverage: 25,
  tpMultiplier: 1,
  minAiProb: 0
};

const autoAnalyzeByUser = new Map<string, PerUserAutoState>();
const lastExecutionByUser = new Map<string, LastExecutionEntry>();

export function getUserState(userId: string): PerUserAutoState | undefined {
  return autoAnalyzeByUser.get(userId);
}

export function setUserState(userId: string, state: PerUserAutoState): void {
  autoAnalyzeByUser.set(userId, state);
}

export function deleteUserState(userId: string): void {
  const state = autoAnalyzeByUser.get(userId);
  if (state?.timer) clearInterval(state.timer);
  autoAnalyzeByUser.delete(userId);
}

export function getAllUserStates(): Map<string, PerUserAutoState> {
  return autoAnalyzeByUser;
}

export function getLastExecution(userId: string): LastExecutionEntry | undefined {
  return lastExecutionByUser.get(userId);
}

export function setLastExecution(
  userId: string,
  err?: string,
  orderId?: string,
  skipReason?: string,
  aiInfo?: { aiProb: number; effectiveAiProb: number; externalAiScore?: number; externalAiUsed?: boolean }
): void {
  const entry: LastExecutionEntry = {
    lastError: err,
    lastOrderId: orderId,
    lastSkipReason: skipReason,
    at: Date.now()
  };
  if (aiInfo) {
    entry.lastAiProb = aiInfo.aiProb;
    entry.lastEffectiveAiProb = aiInfo.effectiveAiProb;
    if (aiInfo.externalAiScore != null) entry.lastExternalAiScore = aiInfo.externalAiScore;
    if (aiInfo.externalAiUsed != null) entry.lastExternalAiUsed = aiInfo.externalAiUsed;
  }
  lastExecutionByUser.set(userId, entry);
}

export function getAutoAnalyzeStatus(userId?: string): { running: boolean; lastCycleAt?: number; intervalMs?: number } {
  if (userId) {
    const state = autoAnalyzeByUser.get(userId);
    if (state?.timer) return { running: true, lastCycleAt: state.lastCycleAt, intervalMs: state.intervalMs };
    return { running: false };
  }
  return { running: autoAnalyzeByUser.size > 0 };
}

/** Persist auto-analyze state for a user to DB (for restart recovery) */
export function persistUserState(userId: string, body: Record<string, unknown>): void {
  try {
    const raw = getSetting(AUTO_ANALYZE_STATE_KEY);
    let sessions: Array<{ userId: string; body: Record<string, unknown> }> = [];
    if (raw) {
      try { sessions = JSON.parse(raw); } catch { /* ignore */ }
    }
    sessions = sessions.filter((s) => s.userId !== userId);
    sessions.push({ userId, body });
    setSetting(AUTO_ANALYZE_STATE_KEY, JSON.stringify(sessions));
  } catch (err) { logger.warn('AutoAnalyzeState', (err as Error).message); }
}

/** Remove persisted state for a user */
export function removePersistedState(userId: string): void {
  try {
    const raw = getSetting(AUTO_ANALYZE_STATE_KEY);
    if (raw) {
      const sessions = (JSON.parse(raw) as Array<{ userId: string; body: Record<string, unknown> }>).filter((s) => s.userId !== userId);
      setSetting(AUTO_ANALYZE_STATE_KEY, JSON.stringify(sessions));
    }
  } catch (err) { logger.warn('AutoAnalyzeState', (err as Error).message); }
}

/** Clear all persisted states */
export function clearAllPersistedStates(): void {
  try {
    setSetting(AUTO_ANALYZE_STATE_KEY, '[]');
  } catch (err) { logger.warn('AutoAnalyzeState', (err as Error).message); }
}

/** Get all persisted sessions (for restart recovery) */
export function getPersistedSessions(): Array<{ userId: string; body: Record<string, unknown> }> {
  try {
    const raw = getSetting(AUTO_ANALYZE_STATE_KEY);
    if (!raw) return [];
    const sessions = JSON.parse(raw);
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

/** Stop auto-analyze for a user or all users */
export function stopAutoAnalyze(userId?: string): void {
  if (userId) {
    deleteUserState(userId);
    removePersistedState(userId);
  } else {
    autoAnalyzeByUser.forEach((state) => clearInterval(state.timer));
    autoAnalyzeByUser.clear();
    clearAllPersistedStates();
  }
}
