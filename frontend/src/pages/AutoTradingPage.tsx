import { useState, useEffect, useRef, useMemo } from 'react';
import { TradingSignal } from '../types/signal';
import { notifyTelegram } from '../utils/notifyTelegram';
import { fetchPrice, normSymbol } from '../utils/fetchPrice';
import { getPositionSize } from '../utils/positionSizing';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { getSettings } from '../store/settingsStore';
import AnalysisBreakdown, { AnalysisBreakdown as BreakdownType } from '../components/AnalysisBreakdown';
import PositionChart from '../components/PositionChart';
import TradingAnalytics from '../components/TradingAnalytics';
import { RiskDisclaimer } from '../components/RiskDisclaimer';
import { useTableSort } from '../utils/useTableSort';
import { SortableTh } from '../components/SortableTh';

const API = '/api';
/** Партнёрская ссылка на регистрацию OKX (можно заменить в одном месте) */
const OKX_AFFILIATE_URL = 'https://okx.com/join/44176948';
const QUICK_SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'RIVER-USDT', 'DOGE-USDT', 'XRP-USDT'];
const MAX_SYMBOLS = 5;
const STORAGE_KEY = 'autoTradingSettings';
const STORAGE_KEY_STATE = 'autoTradingState';
const STORAGE_KEY_CLIENT_ID = 'orders_client_id';

function getClientId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY_CLIENT_ID);
    if (!id) {
      id = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
      localStorage.setItem(STORAGE_KEY_CLIENT_ID, id);
    }
    return id;
  } catch {
    return 'default';
  }
}

const LEVERAGE_MIN = 1;
const LEVERAGE_MAX = 100;
const INTERVALS = [
  { ms: 200, label: '0.2 сек' },
  { ms: 1000, label: '1 сек' },
  { ms: 5000, label: '5 сек' },
  { ms: 10000, label: '10 сек' },
  { ms: 30000, label: '30 сек' },
  { ms: 60000, label: '1 мин' },
  { ms: 120000, label: '2 мин' },
  { ms: 300000, label: '5 мин' }
];

const SCALPING_PRESET = {
  timeframe: '5m',
  intervalMs: 60000,
  sizePercent: 3,
  leverage: 25,
  minConfidence: 80,
  autoCloseTp: 1.5,
  autoCloseSl: 0.8
};

/** Стратегия: BTC/USDT 25x, 10% депозита, риск 1–2%, R:R 1:2+, макс 2 сделки, дневной лимит 3–4% */
const FUTURES_25X_PRESET = {
  sizePercent: 10,
  leverage: 25,
  minConfidence: 65,
  maxPositions: 2,
  maxDailyLossPercent: 4,
  autoCloseTp: 2,
  autoCloseSl: 1,
  cooldownSec: 600
};

interface AutoTradingSettings {
  symbols: string[];
  mode: 'futures' | 'spot';
  strategy: 'default' | 'scalping' | 'futures25x';
  sizePercent: number;
  leverage: number;
  intervalMs: number;
  minConfidence: number;
  autoClose: boolean;
  autoCloseTp: number;
  autoCloseSl: number;
  useSignalSLTP: boolean;
  maxPositions: number;
  cooldownSec: number;
  allowedDirections: ('LONG' | 'SHORT')[];
  scalpingMode: boolean;
  trailingStopPercent: number;
  maxDailyLossPercent: number;
  /** crypto-trading-open: макс. время в позиции (часы), 0 = без лимита */
  maxPositionDurationHours: number;
  /** Полный автомат: система сама выбирает лучший сигнал, TP/SL, настройки */
  fullAuto: boolean;
  /** Полный автомат: брать топ монет из скринера (волатильность, объём, BB squeeze) вместо выбранных пар */
  useScanner: boolean;
  /** Полный автомат: исполнение ордеров через OKX (нужен AUTO_TRADING_EXECUTION_ENABLED на сервере). Только реальный счёт. */
  executeOrders: boolean;
  /** Быстрый выход: множитель TP 0.5–1 (0.85 = уже TP, меньше время в позиции) */
  tpMultiplier: number;
  /** AI-фильтр: мин. вероятность выигрыша 0–1 (0 = выкл). Ордер не открывается, если ML-оценка ниже. */
  minAiProb: number;
}

const DEFAULT_SETTINGS: AutoTradingSettings = {
  symbols: ['BTC-USDT'],
  mode: 'futures',
  strategy: 'default',
  sizePercent: 3,
  leverage: 25,
  intervalMs: 60000,
  minConfidence: 80,
  autoClose: true,
  autoCloseTp: 1.5,
  autoCloseSl: 0.8,
  useSignalSLTP: true,
  maxPositions: 3,
  cooldownSec: 300,
  allowedDirections: ['LONG', 'SHORT'],
  scalpingMode: true,
  trailingStopPercent: 0,
  maxDailyLossPercent: 0,
  maxPositionDurationHours: 24,
  fullAuto: false,
  useScanner: true,
  executeOrders: false,
  tpMultiplier: 0.85,
  minAiProb: 0
};

/** Аналитика: SHORT в плюсе, LONG в минусе — для LONG требуем +8% уверенности */
const LONG_MIN_CONFIDENCE_BONUS = 8;

/** Настройки для полного автомата — система подбирает лучший результат */
const FULL_AUTO_DEFAULTS = {
  sizePercent: 25,
  leverage: 25,
  minConfidence: 82,
  useSignalSLTP: true,
  maxPositions: 2,
  cooldownSec: 600,
  intervalMs: 30000,
  strategy: 'futures25x' as const,
  autoClose: true,
  autoCloseTp: 2,
  autoCloseSl: 1,
  maxDailyLossPercent: 0 // Hard Stop отключён
};

/** Цена в истории: до 7 знаков после запятой (не только 2) */
function formatPrice(price: number): string {
  if (typeof price !== 'number' || !Number.isFinite(price)) return '—';
  if (price >= 1000) return price.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
  if (price >= 1) return price.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 7 });
  return price.toFixed(7);
}

function loadSettings(): AutoTradingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const s = { ...DEFAULT_SETTINGS, ...parsed };
      if (!Array.isArray(s.symbols)) {
        s.symbols = parsed.symbol ? [String(parsed.symbol).replace(/_/g, '-')] : ['BTC-USDT'];
      }
      s.symbols = s.symbols.slice(0, MAX_SYMBOLS).filter(Boolean);
      if (s.symbols.length === 0) s.symbols = ['BTC-USDT'];
      s.leverage = Math.max(LEVERAGE_MIN, Math.min(LEVERAGE_MAX, s.leverage || 25));
      s.strategy = s.strategy || 'default';
      s.fullAuto = Boolean(s.fullAuto);
      s.useScanner = s.useScanner !== false;
      s.executeOrders = Boolean(s.executeOrders);
      s.tpMultiplier = Math.max(0.5, Math.min(1, Number(s.tpMultiplier) || 0.85));
      s.minAiProb = Math.max(0, Math.min(1, Number(s.minAiProb) ?? 0));
      if ((s.minConfidence ?? 80) > 90) s.minConfidence = 90;
      return s;
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: Partial<AutoTradingSettings>) {
  try {
    const current = loadSettings();
    const next = { ...current, ...s };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

interface StoredPosition {
  id: string;
  signal: TradingSignal;
  size: number;
  leverage: number;
  openPrice: number;
  currentPrice: number;
  highSinceOpen?: number;
  lowSinceOpen?: number;
  pnl: number;
  pnlPercent: number;
  openTime: string;
  autoOpened?: boolean;
  stopLoss?: number;
  takeProfit?: number[];
}

interface StoredHistoryEntry {
  id: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  openPrice: number;
  closePrice: number;
  pnl: number;
  pnlPercent: number;
  openTime: string;
  closeTime: string;
  autoOpened?: boolean;
  confidenceAtOpen?: number;
  stopLoss?: number;
  takeProfit?: number[];
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

function validClosePrice(h: { closePrice?: number }): boolean {
  return typeof h.closePrice === 'number' && Number.isFinite(h.closePrice) && h.closePrice > 0;
}

function loadTradingState(): { balance: number; initialBalance: number; positions: DemoPosition[]; history: HistoryEntry[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STATE);
    if (raw) {
      const p = JSON.parse(raw) as { balance?: number; initialBalance?: number; positions?: StoredPosition[]; history?: StoredHistoryEntry[] };
      const positions: DemoPosition[] = (p.positions ?? [])
        .filter((x) => num(x.openPrice, 0) > 0)
        .map((x) => {
          const openPrice = num(x.openPrice, 0);
          const currentPrice = num(x.currentPrice, 0) > 0 ? num(x.currentPrice, 0) : openPrice;
          return {
            ...x,
            openPrice,
            currentPrice,
            size: num(x.size, 0),
            openTime: new Date(x.openTime || Date.now())
          };
        });
      const history: HistoryEntry[] = (p.history ?? []).map((x) => {
        const openPrice = num(x.openPrice, 0);
        const closePrice = num(x.closePrice, 0);
        const size = num(x.size, 0);
        const leverage = num(x.leverage, 1);
        const hasValidClose = closePrice > 0;
        const pnl = hasValidClose ? num(x.pnl, 0) : 0;
        const pnlPercent = hasValidClose ? num(x.pnlPercent, 0) : 0;
        const stopLoss = typeof x.stopLoss === 'number' && x.stopLoss > 0 ? x.stopLoss : undefined;
        const takeProfit = Array.isArray(x.takeProfit) && x.takeProfit.length ? x.takeProfit : undefined;
        return {
          ...x,
          openPrice,
          closePrice,
          size,
          leverage,
          pnl,
          pnlPercent,
          stopLoss,
          takeProfit,
          openTime: new Date(x.openTime || Date.now()),
          closeTime: new Date(x.closeTime || Date.now())
        };
      });
      return {
        balance: num(p.balance, 10000),
        initialBalance: num(p.initialBalance, 10000),
        positions,
        history: history.slice(0, 100)
      };
    }
  } catch {}
  return { balance: 10000, initialBalance: 10000, positions: [], history: [] };
}

function sanitizeNum(n: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function saveTradingState(state: { balance: number; initialBalance: number; positions: DemoPosition[]; history: HistoryEntry[] }) {
  try {
    const toSave = {
      balance: sanitizeNum(state.balance),
      initialBalance: sanitizeNum(state.initialBalance),
      positions: state.positions.map((p) => ({
        ...p,
        openPrice: sanitizeNum(p.openPrice),
        currentPrice: sanitizeNum(p.currentPrice),
        size: sanitizeNum(p.size),
        openTime: p.openTime instanceof Date ? p.openTime.toISOString() : String(p.openTime)
      })),
      history: state.history.map((h) => ({
        ...h,
        openPrice: sanitizeNum(h.openPrice),
        closePrice: sanitizeNum(h.closePrice),
        size: sanitizeNum(h.size),
        pnl: sanitizeNum(h.pnl),
        pnlPercent: sanitizeNum(h.pnlPercent),
        stopLoss: h.stopLoss != null && h.stopLoss > 0 ? sanitizeNum(h.stopLoss) : undefined,
        takeProfit: Array.isArray(h.takeProfit) && h.takeProfit.length ? h.takeProfit.map(sanitizeNum) : undefined,
        openTime: h.openTime instanceof Date ? h.openTime.toISOString() : String(h.openTime),
        closeTime: h.closeTime instanceof Date ? h.closeTime.toISOString() : String(h.closeTime),
        confidenceAtOpen: h.confidenceAtOpen
      }))
    };
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(toSave));
  } catch {}
}

interface DemoPosition {
  id: string;
  signal: TradingSignal;
  size: number;
  leverage: number;
  openPrice: number;
  currentPrice: number;
  highSinceOpen?: number;   // для trailing (LONG)
  lowSinceOpen?: number;    // для trailing (SHORT)
  pnl: number;
  pnlPercent: number;
  openTime: Date;
  autoOpened?: boolean;
  stopLoss?: number;
  takeProfit?: number[];
}

function getSL(pos: DemoPosition): number {
  return pos.stopLoss ?? pos.signal.stop_loss ?? 0;
}
function getTP(pos: DemoPosition): number[] {
  const tp = pos.takeProfit ?? pos.signal.take_profit;
  return Array.isArray(tp) && tp.length ? tp : [];
}

interface HistoryEntry {
  id: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  openPrice: number;
  closePrice: number;
  pnl: number;
  pnlPercent: number;
  openTime: Date;
  closeTime: Date;
  autoOpened?: boolean;
  confidenceAtOpen?: number;
  stopLoss?: number;
  takeProfit?: number[];
}

function getInitialTradingState() {
  const s = loadTradingState();
  return { balance: s.balance, initialBalance: s.initialBalance, positions: s.positions, history: s.history };
}

export default function AutoTradingPage() {
  const [settings, setSettings] = useState<AutoTradingSettings>(loadSettings);
  const [enabled, setEnabled] = useState(false);
  const [tradingState, setTradingState] = useState(getInitialTradingState);
  const { balance, initialBalance, positions, history } = tradingState;
  const setBalance = (v: number | ((prev: number) => number)) => setTradingState((s) => ({ ...s, balance: typeof v === 'function' ? v(s.balance) : v }));
  const setInitialBalance = (v: number | ((prev: number) => number)) => setTradingState((s) => ({ ...s, initialBalance: typeof v === 'function' ? v(s.initialBalance) : v }));
  const setPositions = (v: DemoPosition[] | ((prev: DemoPosition[]) => DemoPosition[])) => setTradingState((s) => ({ ...s, positions: typeof v === 'function' ? v(s.positions) : v }));
  const setHistory = (v: HistoryEntry[] | ((prev: HistoryEntry[]) => HistoryEntry[])) => setTradingState((s) => ({ ...s, history: typeof v === 'function' ? v(s.history) : v }));
  const [lastSignal, setLastSignal] = useState<TradingSignal | null>(null);
  const [lastBreakdown, setLastBreakdown] = useState<BreakdownType | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'error' | 'stopped_daily_loss'>('idle');
  const [okxData, setOkxData] = useState<{ positions: Array<{ symbol: string; side: string; contracts: number; entryPrice: number; markPrice?: number; unrealizedPnl?: number }>; balance: number; openCount: number; balanceError?: string; executionAvailable?: boolean } | null>(null);
  const [lastExecution, setLastExecution] = useState<{ lastError?: string; lastSkipReason?: string; lastOrderId?: string; at?: number } | null>(null);
  const [cycleTimer, setCycleTimer] = useState<{ lastCycleAt: number; intervalMs: number } | null>(null);
  const [, setTick] = useState(0);
  const [serverHistory, setServerHistory] = useState<HistoryEntry[]>([]);
  const closePositionRef = useRef<(pos: DemoPosition, price?: number) => void>(() => {});
  const positionsRef = useRef<DemoPosition[]>([]);
  const closingIdsRef = useRef<Set<string>>(new Set());
  const lastOpenTimeRef = useRef<Record<string, number>>({});
  const historyRef = useRef<HistoryEntry[]>([]);
  historyRef.current = history;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  positionsRef.current = positions;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const symbols = settings.symbols;
  const mode = settings.mode;
  const leverage = mode === 'spot' ? 1 : settings.leverage;
  const { token, user } = useAuth();

  /** История для отображения: при авторизации — с сервера (OKX/ордера по userId), иначе локальная. */
  const displayHistory = token ? serverHistory : history;

  const historyCompare = useMemo(() => ({
    pair: (a: HistoryEntry, b: HistoryEntry) => (a.pair || '').localeCompare(b.pair || ''),
    direction: (a: HistoryEntry, b: HistoryEntry) => (a.direction || '').localeCompare(b.direction || ''),
    size: (a: HistoryEntry, b: HistoryEntry) => (a.size ?? 0) - (b.size ?? 0),
    pnl: (a: HistoryEntry, b: HistoryEntry) => (a.pnl ?? 0) - (b.pnl ?? 0),
    closeTime: (a: HistoryEntry, b: HistoryEntry) => new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime()
  }), []);
  const { sortedItems: sortedHistory, sortKey: historySortKey, sortDir: historySortDir, toggleSort: historyToggleSort } = useTableSort(displayHistory, historyCompare, 'closeTime', 'desc');

  const updateSetting = <K extends keyof AutoTradingSettings>(key: K, value: AutoTradingSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  };

  useEffect(() => {
    saveTradingState(tradingState);
  }, [tradingState.balance, tradingState.initialBalance, tradingState.positions, tradingState.history]);

  const fetchServerHistory = () => {
    if (!token) return;
    api.get<Array<{
      id: string; pair: string; direction: string; size: number; leverage: number;
      openPrice: number; closePrice: number | null; stopLoss: number | null; takeProfit: number[] | null;
      pnl: number | null; pnlPercent: number | null; openTime: string; closeTime: string | null;
      status: string; autoOpened?: boolean; confidenceAtOpen?: number | null;
    }>>(`/orders?status=closed&limit=100`, { headers: { Authorization: `Bearer ${token}` } })
      .then((orders) => {
        const list: HistoryEntry[] = (orders ?? []).map((r) => ({
          id: r.id,
          pair: r.pair,
          direction: r.direction === 'SHORT' ? 'SHORT' : 'LONG',
          size: r.size,
          leverage: r.leverage,
          openPrice: r.openPrice,
          closePrice: r.closePrice ?? 0,
          pnl: r.pnl ?? 0,
          pnlPercent: r.pnlPercent ?? 0,
          openTime: new Date(r.openTime),
          closeTime: new Date(r.closeTime || r.openTime),
          autoOpened: r.autoOpened,
          confidenceAtOpen: r.confidenceAtOpen ?? undefined,
          stopLoss: r.stopLoss ?? undefined,
          takeProfit: Array.isArray(r.takeProfit) ? r.takeProfit : undefined
        }));
        setServerHistory(list);
      })
      .catch(() => setServerHistory([]));
  };

  useEffect(() => {
    if (!token) {
      setServerHistory([]);
      return;
    }
    fetchServerHistory();
    const id = setInterval(fetchServerHistory, 10000);
    return () => clearInterval(id);
  }, [token]);

  const fetchOkxPositionsRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!enabled || !settings.fullAuto || !settings.executeOrders) {
      setOkxData(null);
      return;
    }
    const fetchOkx = () => {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      api.get<{ positions: any[]; balance: number; openCount: number; balanceError?: string; executionAvailable?: boolean }>(`/trading/positions?useTestnet=false`, { headers })
        .then((data) => setOkxData(data))
        .catch(() => setOkxData({ positions: [], balance: 0, openCount: 0, balanceError: 'Не удалось загрузить баланс. Проверьте ключи OKX и сеть.' }));
    };
    fetchOkxPositionsRef.current = fetchOkx;
    fetchOkx();
    const id = setInterval(fetchOkx, 15000);
    return () => clearInterval(id);
  }, [enabled, settings.fullAuto, settings.executeOrders, token]);

  useEffect(() => {
    if (!enabled || !settings.fullAuto || !settings.executeOrders || !token) {
      setLastExecution(null);
      return;
    }
    const fetchLast = () => {
      api.get<{ lastError?: string; lastSkipReason?: string; lastOrderId?: string; at?: number }>('/market/auto-analyze/last-execution', { headers: { Authorization: `Bearer ${token}` } })
        .then((data) => setLastExecution(data?.lastError !== undefined || data?.lastSkipReason !== undefined || data?.lastOrderId !== undefined ? data : null))
        .catch(() => setLastExecution(null));
    };
    fetchLast();
    const id = setInterval(fetchLast, 10000);
    return () => clearInterval(id);
  }, [enabled, settings.fullAuto, settings.executeOrders, token]);

  useEffect(() => {
    if (!enabled) return;
    const syms = symbols
      .map((s) => normSymbol(s) || s.replace(/_/g, '-'))
      .filter((s) => s.includes('-') || s.includes('/'));
    if (syms.length === 0) return;
    const tf = '5m';
    const isFullAuto = settings.fullAuto;
    const payload = isFullAuto
      ? {
          symbols: syms,
          timeframe: tf,
          fullAuto: true,
          intervalMs: FULL_AUTO_DEFAULTS.intervalMs,
          useScanner: settings.useScanner !== false,
          executeOrders: settings.executeOrders === true,
          useTestnet: false,
          maxPositions: FULL_AUTO_DEFAULTS.maxPositions,
          sizePercent: FULL_AUTO_DEFAULTS.sizePercent,
          leverage: FULL_AUTO_DEFAULTS.leverage,
          tpMultiplier: Math.max(0.5, Math.min(1, settings.tpMultiplier ?? 0.85)),
          minAiProb: Math.max(0, Math.min(1, settings.minAiProb ?? 0))
        }
      : {
          symbols: syms,
          timeframe: tf,
          intervalMs: settings.intervalMs,
          mode: settings.strategy === 'futures25x' ? 'futures25x' : settings.scalpingMode ? 'scalping' : 'default'
        };
    fetch(`${API}/market/auto-analyze/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload)
    })
      .then((r) => r.json())
      .then((data) => {
        setStatus(data?.status === 'started' || data?.status === 'already_running' ? 'running' : 'idle');
      })
      .catch(() => setStatus('error'));
    return () => {
      fetch(`${API}/market/auto-analyze/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }).catch(() => {});
      setStatus('idle');
    };
  }, [enabled, symbols, settings.intervalMs, settings.scalpingMode, settings.strategy, settings.fullAuto, settings.useScanner, settings.executeOrders, settings.tpMultiplier, settings.minAiProb, token]);

  useEffect(() => {
    if (!enabled || status !== 'running' || !token) {
      setCycleTimer(null);
      return;
    }
    const fetchStatus = () => {
      api.get<{ running: boolean; lastCycleAt?: number; intervalMs?: number }>('/market/auto-analyze/status', { headers: { Authorization: `Bearer ${token}` } })
        .then((data) => {
          if (data?.running && typeof data.lastCycleAt === 'number' && typeof data.intervalMs === 'number') {
            setCycleTimer({ lastCycleAt: data.lastCycleAt, intervalMs: data.intervalMs });
          } else {
            setCycleTimer(null);
          }
        })
        .catch(() => setCycleTimer(null));
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [enabled, status, token]);

  useEffect(() => {
    if (!enabled || status !== 'running') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [enabled, status]);

  useEffect(() => {
    const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      if (token) ws.send(JSON.stringify({ type: 'auth', token }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'signal' && msg.data) {
          const payload = msg.data as TradingSignal | { signal: TradingSignal; breakdown?: BreakdownType };
          const s = 'symbol' in payload ? payload : payload.signal;
          const bd = 'breakdown' in payload ? payload.breakdown : undefined;
          const sigNorm = normSymbol(s?.symbol ?? '');
          const st = settingsRef.current;
          const syms = st.symbols ?? [];
          const isSelected = syms.some((sym) => normSymbol(sym) === sigNorm);
          const isTestSignal = Array.isArray(s?.triggers) && s.triggers.includes('test_signal');
          const useFullAuto = st.fullAuto;
          if (isSelected || isTestSignal || useFullAuto) setLastSignal(s);
          if (bd && typeof (bd as { forecast?: { confidence?: number } })?.forecast?.confidence === 'number') setLastBreakdown(bd);
          if (!enabledRef.current || !s?.symbol) return;
          if (!useFullAuto && !isSelected && !isTestSignal) return;
          const minConfBase = useFullAuto ? FULL_AUTO_DEFAULTS.minConfidence : st.minConfidence;
          const minConf = s.direction === 'LONG' ? minConfBase + LONG_MIN_CONFIDENCE_BONUS : minConfBase;
          const sizePct = useFullAuto ? FULL_AUTO_DEFAULTS.sizePercent : st.sizePercent;
          const lev = useFullAuto ? FULL_AUTO_DEFAULTS.leverage : (st.mode === 'spot' ? 1 : st.leverage);
          if (!st.allowedDirections?.includes(s.direction)) return;
          const confPct = (s.confidence ?? 0) * 100;
          if (confPct < minConf) return;

          const hasPosition = positionsRef.current.some((p) => normSymbol(p.signal.symbol) === sigNorm);
          if (hasPosition) return;

          const maxPos = useFullAuto ? FULL_AUTO_DEFAULTS.maxPositions : (st.maxPositions ?? 3);
          const count = positionsRef.current.filter((p) => normSymbol(p.signal.symbol) === sigNorm).length;
          if (count >= maxPos) return;

          // Risk Manager (generate-pdf.js): сумма позиций не более 50% баланса
          const totalLocked = positionsRef.current.reduce((s, p) => s + p.size, 0);
          const maxLocked = balanceRef.current * 0.5;
          if (totalLocked >= maxLocked) return;

          const now = Date.now();
          let cooldown = useFullAuto ? FULL_AUTO_DEFAULTS.cooldownSec : (st.cooldownSec ?? 300);
          const recentHistory = historyRef.current.slice(-5);
          const consecutiveLosses = (() => {
            let n = 0;
            for (let i = recentHistory.length - 1; i >= 0; i--) {
              if (recentHistory[i].pnl < 0) n++; else break;
            }
            return n;
          })();
          if (consecutiveLosses >= 2) cooldown = Math.max(cooldown * 2, 900);
          const lastOpen = lastOpenTimeRef.current[sigNorm] ?? 0;
          if (!isTestSignal && now - lastOpen < cooldown * 1000) return;

          lastOpenTimeRef.current[sigNorm] = now;
          // Ордера выставляет только бэкенд на реальном счёте OKX.
          return;
        }
      } catch {}
    };
    return () => ws.close();
  }, [enabled, symbols, token]);

  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  const openPosition = (signal: TradingSignal, sizePct: number, lev: number, opts?: { fullAuto?: boolean; volatilityMultiplier?: number }) => {
    const entry = typeof signal.entry_price === 'number' && Number.isFinite(signal.entry_price) && signal.entry_price > 0 ? signal.entry_price : 0;
    if (entry <= 0) return;
    const b = balanceRef.current;
    let size: number;
    if (opts?.fullAuto && signal.stop_loss > 0) {
      size = getPositionSize(b, entry, signal.stop_loss, { riskPct: 0.02, fallbackPct: sizePct / 100 });
    } else {
      size = (b * sizePct) / 100;
    }
    const volMult = opts?.volatilityMultiplier ?? 1; // Sinclair: при высокой волатильности × 0.7
    size = size * volMult;
    size = Math.min(size, b * 0.25);
    if (size > b || size <= 0) return;
    const pos: DemoPosition = {
      id: `pos-${Date.now()}`,
      signal,
      size,
      leverage: lev,
      openPrice: entry,
      currentPrice: entry,
      pnl: 0,
      pnlPercent: 0,
      openTime: new Date(),
      autoOpened: true,
      stopLoss: signal.stop_loss > 0 ? signal.stop_loss : undefined,
      takeProfit: Array.isArray(signal.take_profit) && signal.take_profit.length ? signal.take_profit : undefined
    };
    setPositions((p) => [...p, pos]);
    setBalance((prev) => prev - size);
    api.post(`${API}/orders`, {
      id: pos.id,
      clientId: user?.id ?? getClientId(),
      pair: signal.symbol,
      direction: signal.direction,
      size: pos.size,
      leverage: lev,
      openPrice: entry,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      openTime: pos.openTime.toISOString(),
      autoOpened: true,
      confidenceAtOpen: typeof signal.confidence === 'number' ? signal.confidence : undefined
    }).catch(() => {});
    notifyTelegram(
      `📈 <b>Позиция открыта</b>\n` +
      `${signal.symbol} ${signal.direction} | $${size.toFixed(2)} | ${lev}x\n` +
      `Вход: ${entry.toLocaleString('ru-RU')}`
    );
  };
  const openPositionRef = useRef(openPosition);
  openPositionRef.current = openPosition;

  const closePosition = (pos: DemoPosition, usePrice?: number) => {
    let price = usePrice ?? pos.currentPrice;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      price = pos.openPrice;
    }
    // size в БД = номинал позиции в USDT; PnL в USDT = (priceChg%) × size (плечо в формулу не входит)
    const pnl = pos.signal.direction === 'LONG'
      ? ((price - pos.openPrice) / pos.openPrice) * pos.size
      : ((pos.openPrice - price) / pos.openPrice) * pos.size;
    const pnlPercent = pos.size > 0 ? (pnl / pos.size) * 100 : 0;
    const sl = getSL(pos);
    const tp = getTP(pos);
    const entry: HistoryEntry = {
      id: pos.id,
      pair: pos.signal.symbol,
      direction: pos.signal.direction,
      size: pos.size,
      leverage: pos.leverage ?? 1,
      openPrice: pos.openPrice,
      closePrice: price,
      pnl,
      pnlPercent,
      openTime: pos.openTime,
      closeTime: new Date(),
      autoOpened: pos.autoOpened,
      confidenceAtOpen: typeof pos.signal.confidence === 'number' ? pos.signal.confidence : undefined,
      stopLoss: sl > 0 ? sl : undefined,
      takeProfit: tp.length > 0 ? tp : undefined
    };
    setBalance((b) => b + pos.size + pnl);
    setPositions((p) => p.filter((x) => x.id !== pos.id));
    setHistory((h) => {
      const without = h.filter((x) => x.id !== entry.id);
      return [entry, ...without].slice(0, 100);
    });
    api.patch(`${API}/orders/${pos.id}`, {
      closePrice: price,
      pnl,
      pnlPercent,
      closeTime: entry.closeTime.toISOString()
    }).catch(() => {});
    fetch(`${API}/ml/trade-outcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: pos.signal.symbol,
        direction: pos.signal.direction,
        confidence: pos.signal.confidence ?? 0,
        riskReward: pos.signal.risk_reward ?? 1,
        triggers: pos.signal.triggers ?? [],
        pnl
      })
    }).catch(() => {});
    notifyTelegram(
      `📉 <b>Позиция закрыта</b>\n` +
      `${pos.signal.symbol} ${pos.signal.direction}\n` +
      `P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`
    );
  };
  closePositionRef.current = closePosition;

  useEffect(() => {
    if (positions.length === 0) return;
    const syms = [...new Set(positions.map((p) => normSymbol(p.signal.symbol)))].filter(Boolean);
    if (syms.length === 0) return;
    const fetchPrices = async () => {
      for (const sym of syms) {
        const price = await fetchPrice(sym);
        if (typeof price !== 'number' || price <= 0) continue;
        setPositions((prev) => {
          const next = prev.map((p) => {
            if (normSymbol(p.signal.symbol) !== sym) return p;
            const highSince = p.signal.direction === 'LONG' ? Math.max(p.highSinceOpen ?? p.openPrice, price) : undefined;
            const lowSince = p.signal.direction === 'SHORT' ? Math.min(p.lowSinceOpen ?? p.openPrice, price) : undefined;
            const updated = { ...p, currentPrice: price, highSinceOpen: highSince ?? p.highSinceOpen, lowSinceOpen: lowSince ?? p.lowSinceOpen };
            const openTs = p.openTime instanceof Date ? p.openTime.getTime() : new Date(p.openTime as string).getTime();
            const holdSec = (Date.now() - openTs) / 1000;
            const minHoldBeforeCloseSec = 120;
            let shouldClose = false;
            let closeAt = price;

            if (holdSec < minHoldBeforeCloseSec) {
              return updated;
            }

            const sl = getSL(p);
            const useSignalSLTP = settings.fullAuto || settings.useSignalSLTP;
            const tpLevels = useSignalSLTP ? getTP(p) : [];

            if (useSignalSLTP && (sl > 0 || tpLevels.length > 0)) {
              if (p.signal.direction === 'LONG') {
                if (price <= sl) {
                  shouldClose = true;
                  closeAt = sl;
                } else {
                  const hit = tpLevels.filter((t) => price >= t).sort((a, b) => a - b)[0];
                  if (hit != null) {
                    shouldClose = true;
                    closeAt = hit;
                  }
                }
              } else {
                if (price >= sl) {
                  shouldClose = true;
                  closeAt = sl;
                } else {
                  const hit = tpLevels.filter((t) => price <= t).sort((a, b) => b - a)[0];
                  if (hit != null) {
                    shouldClose = true;
                    closeAt = hit;
                  }
                }
              }
            }
            if (!shouldClose && settings.trailingStopPercent > 0 && (updated.highSinceOpen != null || updated.lowSinceOpen != null)) {
              const trail = settings.trailingStopPercent / 100;
              if (p.signal.direction === 'LONG' && updated.highSinceOpen != null) {
                const dropFromHigh = (updated.highSinceOpen - price) / updated.highSinceOpen;
                if (dropFromHigh >= trail) {
                  shouldClose = true;
                  closeAt = price;
                }
              } else if (p.signal.direction === 'SHORT' && updated.lowSinceOpen != null) {
                const riseFromLow = (price - updated.lowSinceOpen) / updated.lowSinceOpen;
                if (riseFromLow >= trail) {
                  shouldClose = true;
                  closeAt = price;
                }
              }
            }
            const maxDurationHours = settings.maxPositionDurationHours ?? 24;
            if (!shouldClose && maxDurationHours > 0) {
              const hoursOpen = holdSec / 3600;
              if (hoursOpen > maxDurationHours) {
                shouldClose = true;
                closeAt = price;
              }
            }
            const autoCloseTp = settings.fullAuto ? FULL_AUTO_DEFAULTS.autoCloseTp : settings.autoCloseTp;
            const autoCloseSl = settings.fullAuto ? FULL_AUTO_DEFAULTS.autoCloseSl : settings.autoCloseSl;
            if (!shouldClose && (settings.fullAuto ? FULL_AUTO_DEFAULTS.autoClose : settings.autoClose)) {
              if (holdSec >= 60) {
                const pnlPct = p.signal.direction === 'LONG'
                  ? ((price - p.openPrice) / p.openPrice) * 100 * (p.leverage || 1)
                  : ((p.openPrice - price) / p.openPrice) * 100 * (p.leverage || 1);
                if (pnlPct >= autoCloseTp || pnlPct <= -autoCloseSl) {
                  shouldClose = true;
                  closeAt = price;
                }
              }
            }
            if (shouldClose && holdSec >= minHoldBeforeCloseSec) {
              if (closingIdsRef.current.has(p.id)) return null;
              closingIdsRef.current.add(p.id);
              setTimeout(() => {
                closePositionRef.current(updated, closeAt);
                closingIdsRef.current.delete(p.id);
              }, 0);
              return null;
            }
            return updated;
          });
          return next.filter((x): x is DemoPosition => x != null);
        });
      }
    };
    fetchPrices();
    const id = setInterval(fetchPrices, 1200);
    return () => clearInterval(id);
  }, [positions.length, settings.autoClose, settings.autoCloseTp, settings.autoCloseSl, settings.useSignalSLTP, settings.trailingStopPercent, settings.fullAuto, settings.maxPositionDurationHours]);

  /** При авторизации — метрики из закрытых сделок с сервера (OKX), иначе — локальный баланс и история */
  const statsFromServer = Boolean(token);
  const validHistory = useMemo(
    () => (statsFromServer ? displayHistory : history).filter(validClosePrice),
    [statsFromServer, displayHistory, history]
  );
  const winTrades = validHistory.filter((h) => h.pnl > 0).length;
  const lossTrades = validHistory.filter((h) => h.pnl < 0).length;
  const totalTrades = validHistory.length;
  const grossProfit = validHistory.filter((h) => h.pnl > 0).reduce((s, h) => s + h.pnl, 0);
  const grossLoss = Math.abs(validHistory.filter((h) => h.pnl < 0).reduce((s, h) => s + h.pnl, 0));
  const sumSizes = validHistory.reduce((s, h) => s + (h.size ?? 0), 0);
  const totalPnl = statsFromServer
    ? validHistory.reduce((s, h) => s + (h.pnl ?? 0), 0)
    : balance - initialBalance;
  const totalPnlPercent = statsFromServer
    ? (sumSizes > 0 ? (totalPnl / sumSizes) * 100 : 0)
    : (initialBalance > 0 ? (totalPnl / initialBalance) * 100 : 0);
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const avgWin = winTrades > 0 ? grossProfit / winTrades : 0;
  const avgLoss = lossTrades > 0 ? grossLoss / lossTrades : 0;
  const bestTrade = validHistory.length ? Math.max(...validHistory.map((h) => h.pnl), 0) : 0;
  const worstTrade = validHistory.length ? Math.min(...validHistory.map((h) => h.pnl), 0) : 0;

  const hardStopTriggeredRef = useRef(false);
  // Hard Stop: при критической просадке закрыть все позиции (только в локальном режиме)
  useEffect(() => {
    if (!enabled || settings.maxDailyLossPercent <= 0 || statsFromServer) return;
    const localPnlPercent = initialBalance > 0 ? ((balance - initialBalance) / initialBalance) * 100 : 0;
    if (localPnlPercent > -settings.maxDailyLossPercent) {
      hardStopTriggeredRef.current = false;
      return;
    }
    if (hardStopTriggeredRef.current) return;
    hardStopTriggeredRef.current = true;
    const toClose = [...positionsRef.current];
    if (toClose.length > 0) {
      notifyTelegram(`🛑 <b>Hard Stop</b>\nПросадка ${localPnlPercent.toFixed(2)}% — закрытие ${toClose.length} позиций`);
      toClose.forEach((pos) => setTimeout(() => closePositionRef.current(pos), 0));
    }
    setEnabled(false);
    setStatus('stopped_daily_loss');
  }, [enabled, balance, initialBalance, settings.maxDailyLossPercent, statsFromServer]);

  const okxConn = getSettings().connections.okx;
  const hasApiKeys = !!(okxConn?.apiKey?.trim() && okxConn?.apiSecret?.trim());

  if (!hasApiKeys) {
    return (
      <div className="max-w-2xl mx-auto py-6 px-4">
        <section
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'var(--bg-card-solid)',
            border: '1px solid var(--border)',
            borderLeft: '4px solid var(--warning)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
          }}
        >
          <div className="p-6 md:p-8">
            <div className="flex items-start gap-4 mb-6">
              <span className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: 'var(--warning)', color: 'white', opacity: 0.9 }}>🔑</span>
              <div>
                <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Нужны API ключи OKX</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Авто-торговля доступна только на реальном счёте — подключите биржу в Настройках
                </p>
              </div>
            </div>
            <div className="space-y-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <p className="leading-relaxed">
                Укажите API ключи OKX в разделе <strong>Настройки → Подключения</strong>. Ключи нужны для отображения баланса и (по желанию) исполнения ордеров.
              </p>
              <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-hover)', borderLeft: '4px solid var(--accent)' }}>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Нет аккаунта OKX?</p>
                <p className="leading-relaxed">Зарегистрируйтесь по ссылке, создайте API ключи (OKX → API → Trading) и введите их в Настройках.</p>
                <a href={OKX_AFFILIATE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--accent)', color: 'white' }}>
                  Зарегистрироваться на OKX
                </a>
              </div>
              <div className="rounded-xl p-5 space-y-2" style={{ background: 'var(--bg-hover)' }}>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Как ввести ключи</p>
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-sm">
                  <li>Настройки → Подключения → блок OKX.</li>
                  <li>API Key, Secret, Passphrase (только Trading, без Withdraw).</li>
                  <li>Сохранить.</li>
                </ol>
              </div>
            </div>
            <div className="mt-6">
              <button type="button" onClick={() => (window as any).__navigateTo?.('settings')} className="px-5 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--accent)', color: 'white' }}>
                Перейти в Настройки
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const cardStyle = { background: 'var(--bg-card-solid)', border: '1px solid var(--border)', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' };
  const sectionTitleClass = 'text-xs font-semibold uppercase tracking-wider mb-2';
  const sectionTitleStyle = { color: 'var(--text-muted)' };

  return (
    <div className="space-y-8 max-w-6xl mx-auto px-4 sm:px-6 pb-12">
      <RiskDisclaimer storageKey="trading" />
      {/* Hero — только реальный счёт */}
      <header className="rounded-2xl overflow-hidden" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)' }}>
                📈
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Авто-торговля</h1>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
                    Только реальный счёт OKX
                  </span>
                </div>
                <p className="text-sm mt-0.5 max-w-xl" style={{ color: 'var(--text-muted)' }}>
                  {settings.fullAuto
                    ? 'Полный автомат: система выбирает лучший сигнал и исполняет ордера на бирже по вашим API-ключам.'
                    : 'Анализ выбранных пар по сигналам. Настройте пары, плечо и порог уверенности ниже.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Управление: Запуск и статус */}
      <section className="rounded-2xl overflow-hidden p-6 md:p-8" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>Запуск</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Включите авто-торговлю — анализ и исполнение идут только на реальном счёте OKX</p>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setEnabled(!enabled); }}
            disabled={status === 'running' && !enabled}
            className={`px-8 py-3.5 rounded-xl font-semibold text-base transition-all shadow-lg min-w-[160px] ${
              enabled ? 'bg-[var(--danger)] text-white hover:brightness-110' : 'bg-[var(--accent)] text-white hover:brightness-110'
            }`}
          >
            {enabled ? 'Остановить' : 'Запустить'}
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${
              enabled && status === 'running' ? 'bg-[var(--success-dim)] text-[var(--success)]' :
              status === 'stopped_daily_loss' ? 'bg-[rgba(245,158,11,0.2)] text-[var(--warning)]' :
              'bg-[var(--bg-hover)] text-[var(--text-muted)]'
            }`}>
              {enabled ? status === 'running' ? '● Анализ запущен' : status === 'error' ? '● Ошибка' : status === 'stopped_daily_loss' ? '● Дневной лимит' : '● Запуск...' : '○ Выключено'}
            </span>
            {enabled && status === 'running' && settings.fullAuto && (
              <>
                <span className="text-xs px-4 py-2 rounded-xl" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                  Ожидание сигнала ≥{FULL_AUTO_DEFAULTS.minConfidence}% · цикл каждые {FULL_AUTO_DEFAULTS.intervalMs >= 60000 ? `${FULL_AUTO_DEFAULTS.intervalMs / 60000} мин` : `${FULL_AUTO_DEFAULTS.intervalMs / 1000} сек`}
                </span>
                {cycleTimer && (
                  <span className="text-xs px-4 py-2 rounded-xl tabular-nums font-medium" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }} title="Время последнего цикла анализа и до следующего">
                    Цикл: {Math.max(0, Math.floor((Date.now() - cycleTimer.lastCycleAt) / 1000))} сек назад · След. через {Math.max(0, Math.floor((cycleTimer.intervalMs - (Date.now() - cycleTimer.lastCycleAt) % cycleTimer.intervalMs) / 1000))} сек
                  </span>
                )}
                {settings.fullAuto && settings.useScanner !== false && (
                  <span className="text-xs px-4 py-2 rounded-xl" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }} title="Список из 30 монет: BTC, ETH, SOL, BNB, XRP, ADA, DOGE, ATOM, … По объёму и волатильности отбираем топ-5, по ним строим лучший сигнал.">
                    Сканируем 30 монет → топ-10 по скорингу → лучший сигнал
                  </span>
                )}
              </>
            )}
            <span className="text-sm px-4 py-2 rounded-xl font-medium" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{mode === 'spot' ? 'SPOT 1x' : `Futures ${leverage}x`}</span>
          </div>
        {enabled && settings.fullAuto && !settings.executeOrders && (
          <div className="mt-4 pt-4 border-t text-sm" style={{ borderColor: 'var(--border)' }}>
            <p className="font-medium" style={{ color: 'var(--warning)' }}>
              Исполнение через OKX выключено — включите в настройках ниже, чтобы открывать позиции по сигналам.
            </p>
          </div>
        )}
        {enabled && settings.fullAuto && settings.executeOrders && lastExecution && (
          <div className="mt-4 pt-4 border-t text-sm" style={{ borderColor: 'var(--border)' }}>
            {lastExecution.lastOrderId ? (
              <p className="font-medium" style={{ color: 'var(--success)' }}>
                Последнее исполнение: ордер #{lastExecution.lastOrderId} (реальный счёт OKX)
              </p>
            ) : lastExecution.lastError ? (
              <p className="font-medium" style={{ color: 'var(--danger)' }} title={lastExecution.lastError}>
                Ордер не выставлен: {lastExecution.lastError}
              </p>
            ) : lastExecution.lastSkipReason ? (
              <p className="font-medium" style={{ color: 'var(--warning)' }} title={lastExecution.lastSkipReason}>
                Позиция не открыта: {lastExecution.lastSkipReason}
              </p>
            ) : null}
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              При нехватке баланса исполнение пропустится, анализ продолжается — откроемся, когда хватит средств.
            </p>
          </div>
        )}
        </div>
      </section>

      {/* Режим и настройки */}
      <section className="rounded-2xl overflow-hidden p-6 md:p-8" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>Режим и настройки</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Полный автомат (скринер + исполнение на OKX) или ручной режим: пары, плечо, порог уверенности. Торговля только на реальном счёте.</p>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 mb-6">
          <label className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition hover:border-[var(--accent)]/50 shrink-0" style={{ borderColor: settings.fullAuto ? 'var(--accent)' : 'var(--border)', background: settings.fullAuto ? 'var(--accent-dim)' : 'var(--bg-hover)' }}>
            <input
              type="checkbox"
              checked={settings.fullAuto}
              onChange={(e) => {
                const on = e.target.checked;
                if (on) {
                  setSettings((prev) => {
                    const next = { ...prev, fullAuto: true, ...FULL_AUTO_DEFAULTS };
                    saveSettings(next);
                    return next;
                  });
                } else {
                  updateSetting('fullAuto', false);
                }
              }}
              className="rounded w-5 h-5 accent-[var(--accent)]"
            />
            <span className="font-semibold">Полный автомат</span>
          </label>
          {settings.fullAuto && (
            <label className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition hover:border-[var(--accent)]/50 shrink-0" style={{ borderColor: settings.useScanner ? 'var(--accent)' : 'var(--border)', background: settings.useScanner ? 'var(--accent-dim)' : 'var(--bg-card-solid)' }}>
              <input
                type="checkbox"
                checked={settings.useScanner !== false}
                onChange={(e) => updateSetting('useScanner', e.target.checked)}
                className="rounded w-5 h-5 accent-[var(--accent)]"
              />
              <span className="font-medium">Скринер: топ монет по волатильности/объёму</span>
            </label>
          )}
          {settings.fullAuto && (
            <>
              <label className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition hover:border-[var(--accent)]/50 shrink-0" style={{ borderColor: settings.executeOrders ? 'var(--accent)' : 'var(--border)', background: settings.executeOrders ? 'var(--accent-dim)' : 'var(--bg-card-solid)' }}>
                <input
                  type="checkbox"
                  checked={settings.executeOrders === true}
                  onChange={(e) => updateSetting('executeOrders', e.target.checked)}
                  className="rounded w-5 h-5 accent-[var(--accent)]"
                />
                <span className="font-medium">Исполнение через OKX (только реальный счёт)</span>
              </label>
              {settings.executeOrders && (
                <p className="text-xs mt-1.5 max-w-md" style={{ color: 'var(--text-muted)' }}>
                  Ордера выставляются на реальном счёте OKX по ключам из профиля. Пополните торговый счёт USDT на okx.com.
                </p>
              )}
              {settings.fullAuto && settings.executeOrders && (
                <>
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Быстрый выход (меньше время в позиции)</p>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>TP ближе к входу — позиция закрывается по профиту раньше. 85% = уже цель, 100% = полный TP сигнала.</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={50}
                        max={100}
                        step={5}
                        value={Math.round((settings.tpMultiplier ?? 0.85) * 100)}
                        onChange={(e) => updateSetting('tpMultiplier', parseInt(e.target.value, 10) / 100)}
                        className="slider-track max-w-[200px]"
                      />
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{Math.round((settings.tpMultiplier ?? 0.85) * 100)}%</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>AI-фильтр: мин. вероятность выигрыша</p>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Ордер не откроется, если ML-оценка ниже порога. 0% = выкл. Не гарантирует прибыль, но отсекает слабые сигналы.</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={70}
                        step={5}
                        value={Math.round((settings.minAiProb ?? 0) * 100)}
                        onChange={(e) => updateSetting('minAiProb', parseInt(e.target.value, 10) / 100)}
                        className="slider-track max-w-[200px]"
                      />
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                        {(settings.minAiProb ?? 0) === 0 ? 'Выкл' : `${Math.round((settings.minAiProb ?? 0) * 100)}%`}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        {settings.fullAuto && (
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            {settings.useScanner !== false
              ? 'В каждом цикле система берёт топ-5 монет из скринера (волатильность, объём, BB squeeze), затем выбирает лучший сигнал.'
              : 'Используются выбранные ниже пары для поиска лучшего сигнала.'}
          </p>
        )}

        {/* Торговые пары (до 5) */}
        <div className="border-t pt-6 mt-2" style={{ borderColor: 'var(--border)' }}>
          <p className={sectionTitleClass} style={sectionTitleStyle}>Торговые пары (до {MAX_SYMBOLS})</p>
        <div className="flex flex-wrap gap-6 mb-6">
          <div className="flex-1 min-w-[200px]">
            <div className="flex flex-wrap gap-2 mb-2">
              {symbols.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40"
                >
                  {s.split('-')[0]}
                  <button
                    type="button"
                    onClick={() => updateSetting('symbols', symbols.filter((x) => x !== s))}
                    className="hover:opacity-80 text-current"
                    aria-label="Удалить"
                  >
                    ×
                  </button>
                </span>
              ))}
              {symbols.length < MAX_SYMBOLS && (
                <>
                  {QUICK_SYMBOLS.filter((s) => !symbols.includes(s)).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateSetting('symbols', [...symbols, s].slice(0, MAX_SYMBOLS))}
                      className="px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-[var(--bg-card-solid)] hover:bg-[var(--bg-hover)] border border-[var(--border)]"
                    >
                      + {s.split('-')[0]}
                    </button>
                  ))}
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Добавить пару (RIVER-USDT)"
                      className="input-field w-40"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value.toUpperCase().replace(/\s/g, '').replace(/_/g, '-');
                          if (val && val.includes('-') && !symbols.includes(val) && symbols.length < MAX_SYMBOLS) {
                            updateSetting('symbols', [...symbols, val].slice(0, MAX_SYMBOLS));
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Enter</span>
                  </div>
                </>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Выберите до {MAX_SYMBOLS} пар для одновременной торговли</p>
          </div>
          {!settings.fullAuto && (
          <div>
            <p className={sectionTitleClass} style={sectionTitleStyle}>Режим</p>
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => updateSetting('mode', 'spot')}
                className={`px-5 py-2.5 text-sm font-medium transition ${mode === 'spot' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card-solid)] hover:bg-[var(--bg-hover)]'}`}
              >
                SPOT
              </button>
              <button
                type="button"
                onClick={() => updateSetting('mode', 'futures')}
                className={`px-5 py-2.5 text-sm font-medium transition ${mode === 'futures' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card-solid)] hover:bg-[var(--bg-hover)]'}`}
              >
                Futures
              </button>
            </div>
          </div>
          )}
          {!settings.fullAuto && (
          <div>
            <p className={sectionTitleClass} style={sectionTitleStyle}>Стратегия</p>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'default' as const, label: 'Обычная' },
                { id: 'scalping' as const, label: 'Скальпинг' },
                { id: 'futures25x' as const, label: '25x 10%' }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (s.id === 'futures25x') {
                      setSettings((prev) => {
                        const next = { ...prev, strategy: s.id, mode: 'futures' as const, ...FUTURES_25X_PRESET };
                        saveSettings(next);
                        return next;
                      });
                    } else {
                      updateSetting('strategy', s.id);
                    }
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    settings.strategy === s.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card-solid)] hover:bg-[var(--bg-hover)] border border-[var(--border)]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {settings.strategy === 'futures25x' ? 'BTC/USDT 25x: 10% депозита, R:R 1:2+, макс 2 сделки, дневной лимит 4%' : ''}
            </p>
          </div>
          )}
        </div>
        </div>

        <div className="my-6 py-4 px-5 rounded-xl text-sm" style={{ background: 'var(--bg-hover)', borderLeft: '3px solid var(--text-muted)' }}>
          <span style={{ color: 'var(--text-muted)' }}>«Принятие риска — фундамент. Правота ≠ прибыль» — Douglas</span>
        </div>

        {settings.fullAuto && (
          <div className="mb-6 p-5 rounded-xl border-2" style={{ borderColor: 'var(--accent)', background: 'var(--accent-dim)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--accent)' }}>Автоматические настройки</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Динамический размер (риск 2%) · Плечо {FULL_AUTO_DEFAULTS.leverage}x · Мин. уверенность {FULL_AUTO_DEFAULTS.minConfidence}% · TP/SL из анализа · Макс. {FULL_AUTO_DEFAULTS.maxPositions} позиций{FULL_AUTO_DEFAULTS.maxDailyLossPercent > 0 ? ` · Hard Stop при просадке ${FULL_AUTO_DEFAULTS.maxDailyLossPercent}%` : ''}
            </p>
          </div>
        )}

        {settings.fullAuto && settings.executeOrders && (
          <div className="mb-6 p-5 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
            <p className={sectionTitleClass} style={sectionTitleStyle}>Позиции и баланс OKX</p>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <p className="text-sm font-medium">
                Позиции OKX (реальный счёт)
              </p>
              <button
                type="button"
                onClick={() => { setOkxData(null); fetchOkxPositionsRef.current(); }}
                className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
              >
                {okxData ? 'Обновить баланс' : 'Загрузить баланс'}
              </button>
            </div>
            {!okxData ? (
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Загрузка баланса OKX…</p>
            ) : (
              <>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                  Баланс: ${(okxData.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} · Открыто: {okxData.openCount ?? 0}
                </p>
                {okxData.executionAvailable === false && (
                  <p className="text-xs mb-2" style={{ color: 'var(--warning)' }}>
                    Исполнение ордеров отключено на сервере. Включите AUTO_TRADING_EXECUTION_ENABLED=1 в .env на сервере.
                  </p>
                )}
                {okxData.balanceError && (
                  <p className="text-xs mb-2" style={{ color: 'var(--danger)' }} title={okxData.balanceError}>
                    Ошибка OKX: {okxData.balanceError}
                  </p>
                )}
                {!okxData.balanceError && (okxData.balance ?? 0) === 0 && (
                  <p className="text-xs mb-2" style={{ color: 'var(--warning)' }}>
                    Для исполнения ордеров пополните реальный счёт OKX: Finance → Transfer → USDT на Trading Account.
                  </p>
                )}
                {okxData.positions && okxData.positions.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderColor: 'var(--border)' }}>
                          <th className="text-left py-1 px-2">Символ</th>
                          <th className="text-right py-1 px-2">Сторона</th>
                          <th className="text-right py-1 px-2">Кол-во</th>
                          <th className="text-right py-1 px-2">Вход</th>
                          <th className="text-right py-1 px-2">Сумма</th>
                          <th className="text-right py-1 px-2">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {okxData.positions.map((p: any, i: number) => {
                          const symNorm = normSymbol((p.symbol || '').replace(/:.*$/, ''));
                          const base = symNorm ? symNorm.split('-')[0] : (p.symbol || '').split(/[/:-]/)[0] || '—';
                          const amountStr = p.contracts != null ? `${Math.abs(Number(p.contracts)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${base}` : '—';
                          return (
                            <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                              <td className="py-1 px-2">{symNorm || p.symbol}</td>
                              <td className="text-right py-1 px-2">{p.side === 'long' ? 'LONG' : 'SHORT'}</td>
                              <td className="text-right py-1 px-2 tabular-nums">{amountStr}</td>
                              <td className="text-right py-1 px-2 tabular-nums">{p.entryPrice != null ? Number(p.entryPrice).toLocaleString('ru-RU') : '—'}</td>
                              <td className="text-right py-1 px-2 tabular-nums">{p.notional != null ? `$${Number(p.notional).toFixed(2)}` : '—'}</td>
                              <td className={`text-right py-1 px-2 tabular-nums ${(p.unrealizedPnl ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                                {p.unrealizedPnl != null ? (p.unrealizedPnl >= 0 ? '+' : '') + p.unrealizedPnl.toFixed(2) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Плечо — слайдер */}
        {!settings.fullAuto && (
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Плечо</label>
            <span className={`text-lg font-bold tabular-nums ${mode === 'spot' ? 'opacity-50' : 'text-[var(--accent)]'}`}>
              {mode === 'spot' ? '1x' : `${settings.leverage}x`}
            </span>
          </div>
          <input
            type="range"
            min={LEVERAGE_MIN}
            max={LEVERAGE_MAX}
            value={mode === 'spot' ? 1 : settings.leverage}
            onChange={(e) => updateSetting('leverage', Math.max(1, parseInt(e.target.value) || 1))}
            disabled={mode === 'spot'}
            className="slider-track"
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            <span>1x</span>
            <span>100x</span>
          </div>
        </div>
        )}

        {/* Слайдеры: Размер, Уверенность */}
        {!settings.fullAuto && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Размер позиции, %</label>
              <span className="text-lg font-bold tabular-nums text-[var(--accent)]">{settings.sizePercent}%</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              value={settings.sizePercent}
              onChange={(e) => updateSetting('sizePercent', Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
              className="slider-track"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Мин. уверенность, %</label>
              <span className="text-lg font-bold tabular-nums text-[var(--accent)]">{settings.minConfidence}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={95}
              value={settings.minConfidence}
              onChange={(e) => updateSetting('minConfidence', Math.max(50, Math.min(95, parseInt(e.target.value) || 60)))}
              className="slider-track"
            />
          </div>
        </div>
        )}

        {/* Опции и интервал */}
        {!settings.fullAuto && (
        <div className="flex flex-wrap gap-4 mb-6">
          <label className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition hover:border-[var(--accent)]/50" style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}>
            <input type="checkbox" checked={settings.scalpingMode} onChange={(e) => { const on = e.target.checked; updateSetting('scalpingMode', on); if (on) { updateSetting('intervalMs', SCALPING_PRESET.intervalMs); updateSetting('sizePercent', SCALPING_PRESET.sizePercent); updateSetting('minConfidence', SCALPING_PRESET.minConfidence); updateSetting('autoCloseTp', SCALPING_PRESET.autoCloseTp); updateSetting('autoCloseSl', SCALPING_PRESET.autoCloseSl); } }} className="rounded w-4 h-4 accent-[var(--accent)]" />
            <div><span className="font-medium">Скальпинг</span><p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>5m, TP 1.5%, SL 0.8%</p></div>
          </label>
          <label className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition hover:border-[var(--accent)]/50" style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}>
            <input type="checkbox" checked={settings.useSignalSLTP} onChange={(e) => updateSetting('useSignalSLTP', e.target.checked)} className="rounded w-4 h-4 accent-[var(--accent)]" />
            <div><span className="font-medium">SL/TP из сигнала</span><p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Цены из анализа</p></div>
          </label>
          <label className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition hover:border-[var(--accent)]/50" style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}>
            <input type="checkbox" checked={settings.autoClose} onChange={(e) => updateSetting('autoClose', e.target.checked)} className="rounded w-4 h-4 accent-[var(--accent)]" />
            <div><span className="font-medium">Авто-закрытие %</span><p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>TP/SL в % после 1 мин</p></div>
          </label>
          <div className="flex items-center gap-3 p-4 rounded-xl border shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}>
            <span className="text-sm font-medium whitespace-nowrap">Trailing Stop</span>
            <input type="range" min={0} max={10} step={0.5} value={settings.trailingStopPercent} onChange={(e) => updateSetting('trailingStopPercent', Math.max(0, parseFloat(e.target.value) || 0))} className="slider-track w-24" />
            <span className="text-sm font-bold tabular-nums w-10">{settings.trailingStopPercent}%</span>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>Интервал</label>
            <select value={settings.intervalMs} onChange={(e) => updateSetting('intervalMs', Number(e.target.value))} className="input-field w-32">
              {INTERVALS.map((i) => <option key={i.ms} value={i.ms}>{i.label}</option>)}
            </select>
          </div>
        </div>
        )}

        {!settings.fullAuto && (
        <div className="flex flex-wrap items-end gap-6 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>Направления</label>
            <div className="flex gap-3">
              {(['LONG', 'SHORT'] as const).map((d) => (
                <label key={d} className="flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border transition hover:border-[var(--accent)]/50" style={{ borderColor: settings.allowedDirections.includes(d) ? 'var(--accent)' : 'var(--border)', background: settings.allowedDirections.includes(d) ? 'var(--accent-dim)' : 'transparent' }}>
                  <input type="checkbox" checked={settings.allowedDirections.includes(d)} onChange={(e) => { const next = e.target.checked ? [...settings.allowedDirections, d] : settings.allowedDirections.filter((x) => x !== d); updateSetting('allowedDirections', next.length ? next : [d]); }} className="rounded w-4 h-4 accent-[var(--accent)]" />
                  <span className="font-medium">{d}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="w-40">
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>Макс. позиций</label>
            <input type="range" min={1} max={10} value={settings.maxPositions} onChange={(e) => updateSetting('maxPositions', Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} className="slider-track" />
            <p className="text-sm font-bold mt-1 text-[var(--accent)]">{settings.maxPositions}</p>
          </div>
          <div className="w-48">
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>Кулдаун, сек</label>
            <input type="range" min={0} max={900} step={15} value={Math.min(900, settings.cooldownSec)} onChange={(e) => updateSetting('cooldownSec', parseInt(e.target.value) || 0)} className="slider-track" />
            <p className="text-sm font-bold mt-1 text-[var(--accent)]">{settings.cooldownSec}</p>
          </div>
          <div className="w-48">
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>Макс. дневной убыток %</label>
            <input type="range" min={0} max={50} step={1} value={settings.maxDailyLossPercent} onChange={(e) => updateSetting('maxDailyLossPercent', Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)))} className="slider-track" />
            <p className="text-sm font-bold mt-1 text-[var(--accent)]">{settings.maxDailyLossPercent}%</p>
          </div>
          {settings.autoClose && (
            <div className="flex gap-6">
              <div className="w-36">
                <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>TP %</label>
                <input type="range" min={0.5} max={20} step={0.5} value={settings.autoCloseTp} onChange={(e) => updateSetting('autoCloseTp', parseFloat(e.target.value) || 2)} className="slider-track" />
                <p className="text-sm font-bold mt-1 text-[var(--success)]">{settings.autoCloseTp}%</p>
              </div>
              <div className="w-36">
                <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>SL %</label>
                <input type="range" min={0.5} max={10} step={0.5} value={settings.autoCloseSl} onChange={(e) => updateSetting('autoCloseSl', parseFloat(e.target.value) || 1.5)} className="slider-track" />
                <p className="text-sm font-bold mt-1 text-[var(--danger)]">{settings.autoCloseSl}%</p>
              </div>
            </div>
          )}
        </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl overflow-hidden p-6 md:p-8" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
          <h3 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>Баланс и статистика</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
            {settings.fullAuto && settings.executeOrders
              ? 'P&L, win rate и метрики по сделкам (реальный счёт OKX)'
              : token
                ? 'P&L и метрики по закрытым сделкам с сервера (OKX)'
                : 'P&L, win rate (локальная демо-статистика)'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {settings.fullAuto && settings.executeOrders && okxData && !okxData.balanceError && (
              <div className="p-4 rounded-xl" style={{ background: 'var(--accent-dim)', borderLeft: '3px solid var(--accent)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Баланс OKX (реальный счёт)</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>${(okxData.balance ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
            {!settings.fullAuto && !token && (
              <div className="p-4 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Локальный баланс (демо)</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>${balance.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
            <div className="p-4 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>P&L</p>
              <p className={`text-xl font-bold tabular-nums ${totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} <span className="text-base">({totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%)</span>
              </p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Сделок / Win Rate</p>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{totalTrades} / {winRate.toFixed(0)}%</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Profit Factor</p>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{profitFactor.toFixed(2)}</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Средний доход</p>
              <p className="font-semibold text-[var(--success)]">+${avgWin.toFixed(2)}</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Средний убыток</p>
              <p className="font-semibold text-[var(--danger)]">-${avgLoss.toFixed(2)}</p>
            </div>
            <div className="col-span-2 p-3 rounded-xl flex justify-between items-center" style={{ background: 'var(--bg-hover)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Лучшая / Худшая</span>
              <span className="text-sm font-medium">
                <span className="text-[var(--success)]">+${bestTrade.toFixed(2)}</span>
                {' / '}
                <span className="text-[var(--danger)]">{worstTrade <= 0 ? '-' : ''}${Math.abs(worstTrade).toFixed(2)}</span>
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl overflow-hidden p-6 md:p-8" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
          <h3 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>Последний сигнал</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Последний пришедший сигнал по выбранным парам или из скринера</p>
          {lastSignal ? (
            <div className="space-y-4">
              <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}>
                <p className="font-medium text-lg mb-2">{lastSignal.symbol} {lastSignal.direction}</p>
                <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Вход: {lastSignal.entry_price?.toLocaleString('ru-RU')} | Уверенность: {((lastSignal.confidence ?? 0) * 100).toFixed(0)}%</p>
                {((lastSignal.confidence ?? 0) * 100) < settings.minConfidence && (
                  <div className="text-xs mt-1 py-1 px-2 rounded flex items-center gap-2 flex-wrap" style={{ color: 'var(--warning)', background: 'rgba(255,193,7,0.15)' }}>
                    <span>Позиция не открыта: {((lastSignal.confidence ?? 0) * 100).toFixed(0)}% &lt; мин. {settings.minConfidence}%</span>
                    <button
                      type="button"
                      onClick={() => updateSetting('minConfidence', Math.min(85, Math.max(55, Math.floor((lastSignal.confidence ?? 0) * 100))))}
                      className="px-2 py-0.5 rounded font-medium hover:opacity-90"
                      style={{ background: 'var(--accent)', color: 'white' }}
                    >
                      Снизить до {Math.min(85, Math.max(55, Math.floor((lastSignal.confidence ?? 0) * 100)))}%
                    </button>
                  </div>
                )}
                {lastSignal.stop_loss > 0 && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>SL: {lastSignal.stop_loss?.toLocaleString('ru-RU')}</p>}
                {lastSignal.take_profit?.length ? <p className="text-xs" style={{ color: 'var(--success)' }}>TP: {lastSignal.take_profit.map((t: number) => t.toLocaleString('ru-RU')).join(' / ')}</p> : null}
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{new Date(lastSignal.timestamp || Date.now()).toLocaleString('ru-RU')}</p>
              </div>
              {lastBreakdown && <AnalysisBreakdown data={lastBreakdown as import('../components/AnalysisBreakdown').AnalysisBreakdown} />}
            </div>
          ) : (
            <div className="text-sm py-4 space-y-2" style={{ color: 'var(--text-muted)' }}>
              {enabled && status === 'running' ? (
                <>
                  <p>Ожидание сигналов… Анализ каждую минуту.</p>
                  {settings.fullAuto ? (
                    <>
                      <p className="text-xs mt-2">
                        В полном автомате берутся топ-10 монет из скринера; сигнал появляется только при уверенности ≥{FULL_AUTO_DEFAULTS.minConfidence}%. Если сигнала нет — ни одна монета пока не набрала порог.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs mt-2">Попробуйте BTC-USDT или ETH-USDT для быстрого результата.</p>
                  )}
                </>
              ) : (
                <p>Включите авто-торговлю (переключатель выше).</p>
              )}
            </div>
          )}
        </section>
      </div>

      <TradingAnalytics history={history} minConfidence={settings.minConfidence} hideSuggestions={settings.fullAuto} />

      <section className="rounded-2xl overflow-hidden p-6 md:p-8" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <h3 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>Открытые позиции</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
          {settings.fullAuto && settings.executeOrders
            ? `OKX (реальный счёт) · ${okxData?.positions?.length ?? 0} позиций`
            : settings.fullAuto && !settings.executeOrders
              ? 'Включите «Исполнение через OKX», чтобы видеть позиции с биржи'
              : 'Локальные позиции (демо) — открыты вручную по сигналам'}
        </p>
        {settings.fullAuto && settings.executeOrders && (okxData?.positions?.length ?? 0) > 0 ? (
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              OKX (реальный счёт) — ордера бота
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(okxData!.positions ?? []).map((p: any, i: number) => {
                    const symNorm = normSymbol((p.symbol || '').replace(/:.*$/, ''));
                    const base = symNorm ? symNorm.split('-')[0] : (p.symbol || '').split(/[/:-]/)[0] || '';
                    const amountStr = p.contracts != null ? `${Math.abs(Number(p.contracts)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${base}` : '—';
                    return (
                      <div
                        key={`okx-${i}-${p.symbol ?? i}`}
                        className="rounded-xl border p-4 flex flex-col gap-1"
                        style={{ borderColor: 'var(--accent)', background: 'var(--accent-dim)' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{(symNorm || p.symbol) || '—'} {p.side === 'long' ? 'LONG' : 'SHORT'}</span>
                          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--accent)', color: 'white' }}>
                            OKX Реал
                          </span>
                        </div>
                        <p className="text-sm"><span style={{ color: 'var(--text-muted)' }}>Количество: </span>{amountStr}</p>
                        <p className="text-sm"><span style={{ color: 'var(--text-muted)' }}>Вход: </span>{p.entryPrice != null ? Number(p.entryPrice).toLocaleString('ru-RU') : '—'}</p>
                        {p.notional != null && (() => {
                          const lev = Math.max(1, Number(p.leverage) || 1);
                          const stake = Number(p.notional) / lev;
                          return (
                            <>
                              <p className="text-sm"><span style={{ color: 'var(--text-muted)' }}>Ставка: </span>${stake.toFixed(2)}</p>
                              <p className="text-sm"><span style={{ color: 'var(--text-muted)' }}>Ставка с плечом {lev}x: </span>${Number(p.notional).toFixed(2)}</p>
                            </>
                          );
                        })()}
                        {p.stopLoss != null && <p className="text-sm"><span style={{ color: 'var(--danger)' }}>SL: </span>{Number(p.stopLoss).toLocaleString('ru-RU')}</p>}
                        {p.takeProfit != null && <p className="text-sm"><span style={{ color: 'var(--success)' }}>TP: </span>{Number(p.takeProfit).toLocaleString('ru-RU')}</p>}
                        <p className={`text-sm font-medium ${(p.unrealizedPnl ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          P&L: {p.unrealizedPnl != null ? (p.unrealizedPnl >= 0 ? '+' : '') + p.unrealizedPnl.toFixed(2) : '—'}
                        </p>
                      </div>
                    );
                  })}
            </div>
          </div>
        ) : !settings.fullAuto && positions.length > 0 ? (
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Локальные позиции (демо) · {positions.length}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {positions.map((pos) => {
                const dir = (pos.signal?.direction ?? 'LONG').toUpperCase();
                const pair = pos.signal?.symbol ?? (pos.signal as any)?.pair ?? '—';
                const pnl = pos.pnl ?? (pos.currentPrice - pos.openPrice) * (dir === 'SHORT' ? -1 : 1) * (pos.size / pos.openPrice);
                return (
                  <div
                    key={pos.id}
                    className="rounded-xl border p-4 flex flex-col gap-1"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{pair} {dir}</span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-card-solid)', color: 'var(--text-muted)' }}>
                        Демо
                      </span>
                    </div>
                    <p className="text-sm"><span style={{ color: 'var(--text-muted)' }}>Вход: </span>{pos.openPrice?.toLocaleString('ru-RU') ?? '—'}</p>
                    <p className="text-sm"><span style={{ color: 'var(--text-muted)' }}>Текущая: </span>{pos.currentPrice?.toLocaleString('ru-RU') ?? '—'}</p>
                    <p className="text-sm"><span style={{ color: 'var(--text-muted)' }}>Ставка: </span>${(pos.size ?? 0).toFixed(2)}</p>
                    <p className={`text-sm font-medium ${pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      P&L: {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-10 px-4 rounded-xl text-center" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>
            <p className="text-sm font-medium">Нет открытых позиций</p>
            <p className="text-xs mt-1">
              {settings.fullAuto && settings.executeOrders
                ? 'Позиции по реальному счёту OKX появятся здесь после исполнения ордеров'
                : !settings.fullAuto
                  ? 'В ручном режиме позиции по сигналам отображаются выше (локальное демо)'
                  : 'Включите полный автомат и исполнение через OKX'}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl overflow-hidden p-6 md:p-8" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <h3 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>История сделок</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
          {displayHistory.length} записей · {token ? 'закрытые сделки с сервера (OKX)' : 'локальная демо-история'}
        </p>
        {displayHistory.length === 0 ? (
          <div className="py-10 px-4 rounded-xl text-center" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>
            <p className="text-sm font-medium">История пуста</p>
            <p className="text-xs mt-1">Закрытые сделки по реальному счёту OKX появятся здесь</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
                  <SortableTh label="Пара" sortKey="pair" currentKey={historySortKey} sortDir={historySortDir} onSort={historyToggleSort} />
                  <SortableTh label="Направление" sortKey="direction" currentKey={historySortKey} sortDir={historySortDir} onSort={historyToggleSort} />
                  <SortableTh label="Сумма" sortKey="size" currentKey={historySortKey} sortDir={historySortDir} onSort={historyToggleSort} align="right" />
                  <th className="text-right py-3 px-3" style={{ color: 'var(--text-muted)' }}>Вход / Выход</th>
                  <th className="text-right py-3 px-3" style={{ color: 'var(--text-muted)' }}>SL</th>
                  <th className="text-right py-3 px-3" style={{ color: 'var(--text-muted)' }}>TP</th>
                  <SortableTh label="P&L" sortKey="pnl" currentKey={historySortKey} sortDir={historySortDir} onSort={historyToggleSort} align="right" />
                  <SortableTh label="Время" sortKey="closeTime" currentKey={historySortKey} sortDir={historySortDir} onSort={historyToggleSort} />
                </tr>
              </thead>
              <tbody>
                {sortedHistory.slice(0, 20).map((h) => (
                  <tr key={h.id} className="border-b hover:bg-[var(--bg-hover)]/50 transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 px-3 font-medium">{h.pair}</td>
                    <td className="py-3 px-3">{h.direction}</td>
                    <td className="text-right py-3 px-3 tabular-nums">${(h.size ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="text-right py-3 px-3 tabular-nums text-xs">{formatPrice(h.openPrice)} / {validClosePrice(h) ? formatPrice(h.closePrice) : '—'}</td>
                    <td className="text-right py-3 px-3 tabular-nums text-xs" style={{ color: 'var(--danger)' }}>{h.stopLoss != null && h.stopLoss > 0 ? formatPrice(h.stopLoss) : '—'}</td>
                    <td className="text-right py-3 px-3 tabular-nums text-xs" style={{ color: 'var(--success)' }}>{Array.isArray(h.takeProfit) && h.takeProfit.length ? h.takeProfit.map(formatPrice).join(' / ') : '—'}</td>
                    <td className={`text-right py-3 px-3 font-semibold tabular-nums ${validClosePrice(h) ? (h.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]') : ''}`}>{validClosePrice(h) ? (h.pnl >= 0 ? '+' : '') + h.pnl.toFixed(2) : '—'}</td>
                    <td className="py-3 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(h.closeTime).toLocaleString('ru-RU')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
