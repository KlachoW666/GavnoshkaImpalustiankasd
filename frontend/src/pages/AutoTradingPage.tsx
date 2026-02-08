import { useState, useEffect, useRef } from 'react';
import { TradingSignal } from '../types/signal';
import { notifyTelegram } from '../utils/notifyTelegram';
import { fetchPrice, normSymbol } from '../utils/fetchPrice';
import { getPositionSize } from '../utils/positionSizing';
import { api } from '../utils/api';
import AnalysisBreakdown, { AnalysisBreakdown as BreakdownType } from '../components/AnalysisBreakdown';
import PositionChart from '../components/PositionChart';
import TradingAnalytics from '../components/TradingAnalytics';

const API = '/api';
const QUICK_SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'RIVER-USDT', 'DOGE-USDT', 'XRP-USDT'];
const MAX_SYMBOLS = 5;
const STORAGE_KEY = 'autoTradingSettings';
const STORAGE_KEY_STATE = 'autoTradingState';

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
  leverage: 5,
  minConfidence: 60,
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
  /** Полный автомат: система сама выбирает лучший сигнал, TP/SL, настройки */
  fullAuto: boolean;
}

const DEFAULT_SETTINGS: AutoTradingSettings = {
  symbols: ['BTC-USDT'],
  mode: 'futures',
  strategy: 'default',
  sizePercent: 3,
  leverage: 5,
  intervalMs: 60000,
  minConfidence: 60,
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
  fullAuto: false
};

/** Настройки для полного автомата — система подбирает лучший результат */
const FULL_AUTO_DEFAULTS = {
  sizePercent: 5,
  leverage: 15,
  minConfidence: 65,
  useSignalSLTP: true,
  maxPositions: 2,
  cooldownSec: 600,
  intervalMs: 60000,
  strategy: 'futures25x' as const,
  autoClose: true,
  autoCloseTp: 2,
  autoCloseSl: 1,
  maxDailyLossPercent: 10 // Hard Stop: автостоп при просадке 10%
};

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
      s.leverage = Math.max(LEVERAGE_MIN, Math.min(LEVERAGE_MAX, s.leverage || 5));
      s.strategy = s.strategy || 'default';
      s.fullAuto = Boolean(s.fullAuto);
      if ((s.minConfidence ?? 60) > 90) s.minConfidence = 90;
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
}

function loadTradingState(): { balance: number; initialBalance: number; positions: DemoPosition[]; history: HistoryEntry[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STATE);
    if (raw) {
      const p = JSON.parse(raw) as { balance?: number; initialBalance?: number; positions?: StoredPosition[]; history?: StoredHistoryEntry[] };
      const positions: DemoPosition[] = (p.positions ?? []).map((x) => ({
        ...x,
        openTime: new Date(x.openTime || Date.now())
      }));
      const history: HistoryEntry[] = (p.history ?? []).map((x) => ({
        ...x,
        openTime: new Date(x.openTime || Date.now()),
        closeTime: new Date(x.closeTime || Date.now())
      }));
      return {
        balance: typeof p.balance === 'number' ? p.balance : 10000,
        initialBalance: typeof p.initialBalance === 'number' ? p.initialBalance : 10000,
        positions,
        history: history.slice(0, 100)
      };
    }
  } catch {}
  return { balance: 10000, initialBalance: 10000, positions: [], history: [] };
}

function saveTradingState(state: { balance: number; initialBalance: number; positions: DemoPosition[]; history: HistoryEntry[] }) {
  try {
    const toSave = {
      balance: state.balance,
      initialBalance: state.initialBalance,
      positions: state.positions.map((p) => ({ ...p, openTime: p.openTime instanceof Date ? p.openTime.toISOString() : String(p.openTime) })),
      history: state.history.map((h) => ({
        ...h,
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
  const closePositionRef = useRef<(pos: DemoPosition, price?: number) => void>(() => {});
  const positionsRef = useRef<DemoPosition[]>([]);
  const closingIdsRef = useRef<Set<string>>(new Set());
  const lastOpenTimeRef = useRef<Record<string, number>>({});
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  positionsRef.current = positions;

  const symbols = settings.symbols;
  const mode = settings.mode;
  const leverage = mode === 'spot' ? 1 : settings.leverage;

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

  useEffect(() => {
    if (!enabled) return;
    const syms = symbols
      .map((s) => normSymbol(s) || s.replace(/_/g, '-'))
      .filter((s) => s.includes('-') || s.includes('/'));
    if (syms.length === 0) return;
    const tf = '5m';
    const isFullAuto = settings.fullAuto;
    const payload = isFullAuto
      ? { symbols: syms, timeframe: tf, fullAuto: true, intervalMs: FULL_AUTO_DEFAULTS.intervalMs }
      : {
          symbols: syms,
          timeframe: tf,
          intervalMs: settings.intervalMs,
          mode: settings.strategy === 'futures25x' ? 'futures25x' : settings.scalpingMode ? 'scalping' : 'default'
        };
    fetch(`${API}/market/auto-analyze/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((r) => r.json())
      .then((data) => {
        setStatus(data?.status === 'started' || data?.status === 'already_running' ? 'running' : 'idle');
      })
      .catch(() => setStatus('error'));
    return () => {
      fetch(`${API}/market/auto-analyze/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }).catch(() => {});
      setStatus('idle');
    };
  }, [enabled, symbols, settings.intervalMs, settings.scalpingMode, settings.strategy, settings.fullAuto]);

  useEffect(() => {
    const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'signal' && msg.data) {
          const payload = msg.data as TradingSignal | { signal: TradingSignal; breakdown?: BreakdownType };
          const s = 'symbol' in payload ? payload : payload.signal;
          const bd = 'breakdown' in payload ? payload.breakdown : undefined;
          const sigNorm = normSymbol(s?.symbol ?? '');
          const syms = settingsRef.current.symbols ?? [];
          const isSelected = syms.some((sym) => normSymbol(sym) === sigNorm);
          if (isSelected) setLastSignal(s);
          if (bd) setLastBreakdown(bd);
          if (!enabled || !isSelected || !s?.symbol) return;
          const st = settingsRef.current;
          const useFullAuto = st.fullAuto;
          const minConf = useFullAuto ? FULL_AUTO_DEFAULTS.minConfidence : st.minConfidence;
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
          const cooldown = useFullAuto ? FULL_AUTO_DEFAULTS.cooldownSec : (st.cooldownSec ?? 300);
          const lastOpen = lastOpenTimeRef.current[sigNorm] ?? 0;
          if (now - lastOpen < cooldown * 1000) return;

          lastOpenTimeRef.current[sigNorm] = now;
          openPositionRef.current(s, sizePct, lev, { fullAuto: useFullAuto });
        }
      } catch {}
    };
    return () => ws.close();
  }, [enabled, symbols]);

  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  const openPosition = (signal: TradingSignal, sizePct: number, lev: number, opts?: { fullAuto?: boolean }) => {
    const b = balanceRef.current;
    let size: number;
    if (opts?.fullAuto && signal.stop_loss > 0) {
      size = getPositionSize(b, signal.entry_price, signal.stop_loss, { riskPct: 0.02, fallbackPct: sizePct / 100 });
    } else {
      size = (b * sizePct) / 100;
    }
    size = Math.min(size, b * 0.25);
    if (size > b || size <= 0) return;
    const pos: DemoPosition = {
      id: `pos-${Date.now()}`,
      signal,
      size,
      leverage: lev,
      openPrice: signal.entry_price,
      currentPrice: signal.entry_price,
      pnl: 0,
      pnlPercent: 0,
      openTime: new Date(),
      autoOpened: true,
      stopLoss: signal.stop_loss > 0 ? signal.stop_loss : undefined,
      takeProfit: Array.isArray(signal.take_profit) && signal.take_profit.length ? signal.take_profit : undefined
    };
    setPositions((p) => [...p, pos]);
    setBalance((prev) => prev - size);
    notifyTelegram(
      `📈 <b>Позиция открыта</b>\n` +
      `${signal.symbol} ${signal.direction} | $${size.toFixed(2)} | ${lev}x\n` +
      `Вход: ${signal.entry_price?.toLocaleString('ru-RU')}`
    );
  };
  const openPositionRef = useRef(openPosition);
  openPositionRef.current = openPosition;

  const closePosition = (pos: DemoPosition, usePrice?: number) => {
    const price = usePrice ?? pos.currentPrice;
    const lev = pos.leverage || 1;
    const pnl = pos.signal.direction === 'LONG'
      ? ((price - pos.openPrice) / pos.openPrice) * pos.size * lev
      : ((pos.openPrice - price) / pos.openPrice) * pos.size * lev;
    const pnlPercent = (pnl / pos.size) * 100;
    const entry: HistoryEntry = {
      id: pos.id,
      pair: pos.signal.symbol,
      direction: pos.signal.direction,
      size: pos.size,
      leverage: lev,
      openPrice: pos.openPrice,
      closePrice: price,
      pnl,
      pnlPercent,
      openTime: pos.openTime,
      closeTime: new Date(),
      autoOpened: pos.autoOpened,
      confidenceAtOpen: typeof pos.signal.confidence === 'number' ? pos.signal.confidence : undefined
    };
    setBalance((b) => b + pos.size + pnl);
    setPositions((p) => p.filter((x) => x.id !== pos.id));
    setHistory((h) => {
      const without = h.filter((x) => x.id !== entry.id);
      return [entry, ...without].slice(0, 100);
    });
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
            const sl = getSL(p);
            const useSignalSLTP = settings.fullAuto || settings.useSignalSLTP;
            const tpLevels = useSignalSLTP ? getTP(p) : [];
            let shouldClose = false;
            let closeAt = price;

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
            const autoCloseTp = settings.fullAuto ? FULL_AUTO_DEFAULTS.autoCloseTp : settings.autoCloseTp;
            const autoCloseSl = settings.fullAuto ? FULL_AUTO_DEFAULTS.autoCloseSl : settings.autoCloseSl;
            if (!shouldClose && (settings.fullAuto ? FULL_AUTO_DEFAULTS.autoClose : settings.autoClose)) {
              const holdSec = (Date.now() - new Date(p.openTime).getTime()) / 1000;
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
            if (shouldClose) {
              const holdSec = (Date.now() - new Date(p.openTime).getTime()) / 1000;
              if (holdSec >= 45) {
                if (closingIdsRef.current.has(p.id)) return null;
                closingIdsRef.current.add(p.id);
                setTimeout(() => {
                  closePositionRef.current(updated, closeAt);
                  closingIdsRef.current.delete(p.id);
                }, 0);
                return null;
              }
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
  }, [positions.length, settings.autoClose, settings.autoCloseTp, settings.autoCloseSl, settings.useSignalSLTP, settings.trailingStopPercent, settings.fullAuto]);

  const totalPnl = balance - initialBalance;
  const totalPnlPercent = initialBalance > 0 ? (totalPnl / initialBalance) * 100 : 0;

  const hardStopTriggeredRef = useRef(false);

  // Hard Stop (generate-pdf.js): при критической просадке закрыть все позиции, затем остановить
  useEffect(() => {
    if (!enabled || settings.maxDailyLossPercent <= 0) return;
    if (totalPnlPercent > -settings.maxDailyLossPercent) {
      hardStopTriggeredRef.current = false;
      return;
    }
    if (hardStopTriggeredRef.current) return;
    hardStopTriggeredRef.current = true;
    const toClose = [...positionsRef.current];
    if (toClose.length > 0) {
      notifyTelegram(`🛑 <b>Hard Stop</b>\nПросадка ${totalPnlPercent.toFixed(2)}% — закрытие ${toClose.length} позиций`);
      toClose.forEach((pos) => setTimeout(() => closePositionRef.current(pos), 0));
    }
    setEnabled(false);
    setStatus('stopped_daily_loss');
  }, [enabled, totalPnlPercent, settings.maxDailyLossPercent]);
  const winTrades = history.filter((h) => h.pnl > 0).length;
  const lossTrades = history.filter((h) => h.pnl < 0).length;
  const totalTrades = history.length;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const grossProfit = history.filter((h) => h.pnl > 0).reduce((s, h) => s + h.pnl, 0);
  const grossLoss = Math.abs(history.filter((h) => h.pnl < 0).reduce((s, h) => s + h.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const avgWin = winTrades > 0 ? grossProfit / winTrades : 0;
  const avgLoss = lossTrades > 0 ? grossLoss / lossTrades : 0;
  const bestTrade = history.length ? Math.max(...history.map((h) => h.pnl), 0) : 0;
  const worstTrade = history.length ? Math.min(...history.map((h) => h.pnl), 0) : 0;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <section className="card p-6 md:p-8 overflow-hidden relative" style={{ borderLeft: '4px solid var(--accent)' }}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight mb-1">Авто-торговля (демо)</h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {settings.fullAuto
                ? 'Полный автомат: добавьте пары — система сама выбирает лучший сигнал, настраивает TP/SL и плечо'
                : 'Автоматический анализ выбранной пары, генерация сигналов и открытие демо-позиций'}
            </p>
          </div>
          <label className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition hover:border-[var(--accent)]/50 shrink-0" style={{ borderColor: settings.fullAuto ? 'var(--accent)' : 'var(--border)', background: settings.fullAuto ? 'var(--accent-dim)' : 'var(--bg-card-solid)' }}>
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
        </div>

        {/* Режим и пары (до 5) */}
        <div className="flex flex-wrap gap-6 mb-8">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>Торговые пары (до {MAX_SYMBOLS})</label>
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
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>Режим</label>
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
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>Стратегия</label>
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

        {settings.fullAuto && (
          <div className="mb-6 p-4 rounded-xl border" style={{ borderColor: 'var(--accent)', background: 'var(--accent-dim)' }}>
            <p className="text-sm font-medium mb-1">Автоматические настройки</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Динамический размер (риск 2%) · Плечо {FULL_AUTO_DEFAULTS.leverage}x · Мин. уверенность {FULL_AUTO_DEFAULTS.minConfidence}% · TP/SL из анализа · Макс. {FULL_AUTO_DEFAULTS.maxPositions} позиций · Hard Stop при просадке {FULL_AUTO_DEFAULTS.maxDailyLossPercent}%
            </p>
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

        <div className="flex items-center gap-6 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setEnabled(!enabled); }}
            disabled={status === 'running' && !enabled}
            className={`px-8 py-3 rounded-xl font-semibold text-base transition-all shadow-lg ${
              enabled
                ? 'bg-[var(--danger)] text-white hover:brightness-110'
                : 'bg-[var(--accent)] text-white hover:brightness-110'
            }`}
          >
            {enabled ? 'Остановить' : 'Запустить'}
          </button>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
              enabled && status === 'running' ? 'bg-[var(--success-dim)] text-[var(--success)]' :
              status === 'stopped_daily_loss' ? 'bg-[rgba(245,158,11,0.2)] text-[var(--warning)]' :
              'bg-[var(--bg-card-solid)] text-[var(--text-muted)]'
            }`}>
              {enabled ? status === 'running' ? '● Анализ запущен' : status === 'error' ? '● Ошибка' : status === 'stopped_daily_loss' ? '● Дневной лимит' : '● Запуск...' : '○ Выключено'}
            </span>
            <span className="text-sm px-3 py-1 rounded-lg font-medium" style={{ background: 'var(--bg-card-solid)', color: 'var(--text-muted)' }}>{mode === 'spot' ? 'SPOT 1x' : `Futures ${leverage}x`}</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="card p-6 md:p-8">
          <h3 className="text-lg font-bold mb-6 tracking-tight">Баланс и статистика</h3>
          <div className="grid grid-cols-2 gap-5">
            <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card-solid)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Баланс</p>
              <p className="text-2xl font-bold tabular-nums">${balance.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card-solid)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>P&L</p>
              <p className={`text-xl font-bold tabular-nums ${totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} <span className="text-base">({totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%)</span>
              </p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Сделок / Win Rate</p>
              <p className="font-semibold">{totalTrades} / {winRate.toFixed(0)}%</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Profit Factor</p>
              <p className="font-semibold">{profitFactor.toFixed(2)}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Средний выигрыш</p>
              <p className="font-semibold text-[var(--success)]">+${avgWin.toFixed(2)}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Средний убыток</p>
              <p className="font-semibold text-[var(--danger)]">-${avgLoss.toFixed(2)}</p>
            </div>
            <div className="col-span-2 p-3 rounded-lg flex justify-between items-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Лучшая / Худшая</span>
              <span className="text-sm font-medium"><span className="text-[var(--success)]">+${bestTrade.toFixed(2)}</span> / <span className="text-[var(--danger)]">${worstTrade.toFixed(2)}</span></span>
            </div>
            <div className="col-span-2 pt-2">
              <button onClick={() => { setBalance(10000); setInitialBalance(10000); setPositions([]); setHistory([]); lastOpenTimeRef.current = {}; }} className="btn-secondary text-sm px-6 py-2.5 rounded-xl">
                Сбросить счёт
              </button>
            </div>
          </div>
        </section>

        <section className="card p-6 md:p-8">
          <h3 className="text-lg font-bold mb-6 tracking-tight">Последний сигнал</h3>
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
              {lastBreakdown && <AnalysisBreakdown data={lastBreakdown} />}
            </div>
          ) : (
            <p className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>
              {enabled && status === 'running' ? 'Ожидание сигналов... Анализ каждую минуту. Попробуйте BTC-USDT или ETH-USDT для быстрого результата.' : 'Включите авто-торговлю.'}
            </p>
          )}
        </section>
      </div>

      <TradingAnalytics history={history} minConfidence={settings.minConfidence} />

      <section className="card p-6 md:p-8">
        <h3 className="text-lg font-bold mb-6 tracking-tight">Открытые позиции ({positions.length})</h3>
        {positions.length === 0 ? (
          <p className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>Нет открытых позиций.</p>
        ) : (
          <div className="space-y-4">
            {positions.map((pos) => {
              const lev = pos.leverage || 1;
              const rawPct = pos.signal.direction === 'LONG'
                ? ((pos.currentPrice - pos.openPrice) / pos.openPrice) * 100
                : ((pos.openPrice - pos.currentPrice) / pos.openPrice) * 100;
              const pnlPct = rawPct * lev;
              const pnl = (pos.size * pnlPct) / 100;
              const sl = getSL(pos);
              const tp = getTP(pos);
              return (
                <div
                  key={pos.id}
                  className="rounded-xl border p-5 flex flex-col lg:flex-row gap-4 transition hover:border-[var(--accent)]/30"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}
                >
                  <div className="shrink-0">
                    <span className="font-bold">{pos.signal.symbol} {pos.signal.direction}</span>
                    <span className="ml-2 text-amber-400 text-sm">{lev}x</span>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-3 text-sm">
                      <p><span style={{ color: 'var(--text-muted)' }}>Размер: </span><span>${pos.size.toFixed(2)}</span></p>
                      <p><span style={{ color: 'var(--text-muted)' }}>Вход: </span><span>{pos.openPrice.toLocaleString('ru-RU')}</span></p>
                      <p><span style={{ color: 'var(--text-muted)' }}>Текущая: </span><span>{pos.currentPrice.toLocaleString('ru-RU')}</span></p>
                      <p><span style={{ color: 'var(--text-muted)' }}>P&L: </span><span className={pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</span></p>
                      {sl > 0 && <p className="col-span-2"><span style={{ color: 'var(--text-muted)' }}>SL: </span><span style={{ color: 'var(--danger)' }}>{sl.toLocaleString('ru-RU')}</span></p>}
                      {tp.length > 0 && <p className="col-span-2"><span style={{ color: 'var(--text-muted)' }}>TP: </span><span style={{ color: 'var(--success)' }}>{tp.map((t) => t.toLocaleString('ru-RU')).join(' / ')}</span></p>}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-2" style={{ minHeight: 220 }}>
                    <div className="flex-1 min-h-[200px]">
                      <PositionChart
                        symbol={pos.signal.symbol.replace('/', '-')}
                        timeframe="5m"
                        height={200}
                        live={true}
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => closePositionRef.current(pos)}
                        className="px-5 py-2.5 rounded-xl bg-[var(--danger)]/20 text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white text-sm font-semibold shrink-0 transition"
                      >
                        Закрыть
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card p-6 md:p-8">
        <h3 className="text-lg font-bold mb-6 tracking-tight">История сделок ({history.length})</h3>
        {history.length === 0 ? (
          <p className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>История пуста.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-card-solid)' }}>
                  <th className="text-left py-3 px-2">Пара</th>
                  <th className="text-left py-3 px-2">Направление</th>
                  <th className="text-right py-3 px-2">Вход / Выход</th>
                  <th className="text-right py-3 px-2">P&L</th>
                  <th className="text-left py-3 px-2">Время</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 20).map((h) => (
                  <tr key={h.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 px-2">{h.pair}</td>
                    <td className="py-3 px-2">{h.direction}</td>
                    <td className="text-right py-3 px-2">{h.openPrice.toFixed(2)} / {h.closePrice.toFixed(2)}</td>
                    <td className={`text-right py-3 px-2 font-medium ${h.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{h.pnl >= 0 ? '+' : ''}{h.pnl.toFixed(2)}</td>
                    <td className="py-3 px-2" style={{ color: 'var(--text-muted)' }}>{new Date(h.closeTime).toLocaleString('ru-RU')}</td>
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
