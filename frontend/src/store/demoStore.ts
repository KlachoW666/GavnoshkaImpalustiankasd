const DEMO_KEY = 'cryptosignal-demo';

export interface StoredDemoPosition {
  id: string;
  signal: { id: string; symbol: string; direction: 'LONG' | 'SHORT'; entry_price: number };
  size: number;
  openPrice: number;
  currentPrice: number;
  openTime: string;
  autoOpened?: boolean;
}

export interface StoredHistoryEntry {
  id: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  openPrice: number;
  closePrice: number;
  pnl: number;
  pnlPercent: number;
  openTime: string;
  closeTime: string;
  autoOpened?: boolean;
}

export interface StoredDemoState {
  balance: number;
  initialBalance: number;
  positions: StoredDemoPosition[];
  history: StoredHistoryEntry[];
  analyzeSymbol: string;
  autoOpen: boolean;
  autoOpenSize: number;
  autoAnalyze: boolean;
  autoClose: boolean;
  autoCloseTp: number;
  autoCloseSl: number;
}

const defaults: StoredDemoState = {
  balance: 10000,
  initialBalance: 10000,
  positions: [],
  history: [],
  analyzeSymbol: 'BTC-USDT',
  autoOpen: false,
  autoOpenSize: 5,
  autoAnalyze: false,
  autoClose: false,
  autoCloseTp: 2,
  autoCloseSl: 1.5
};

export function loadDemoState(): StoredDemoState {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    }
  } catch {}
  return { ...defaults };
}

export function saveDemoState(state: StoredDemoState) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(state));
  } catch {}
}
