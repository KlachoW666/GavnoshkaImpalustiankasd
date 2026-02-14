import { useState, useEffect, useRef, useMemo } from 'react';
import { TradingSignal } from '../types/signal';
import { notifyTelegram } from '../utils/notifyTelegram';
import { fetchPrice, normSymbol } from '../utils/fetchPrice';
import { useAuth } from '../contexts/AuthContext';
import { useTableSort } from '../utils/useTableSort';
import { SortableTh } from '../components/SortableTh';

const API = '/api';

const LEVERAGES = [3, 5, 10, 20] as const;

interface DemoPosition {
  id: string;
  signal: TradingSignal;
  size: number;
  leverage: number;
  openPrice: number;
  currentPrice: number;
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
}

export default function DemoPage() {
  const [balance, setBalance] = useState(10000);
  const [initialBalance] = useState(10000);
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [analyzeSymbol, setAnalyzeSymbol] = useState('BTC-USDT');
  const [analyzing, setAnalyzing] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoOpenSize, setAutoOpenSize] = useState(5);
  const [autoOpenLeverage, setAutoOpenLeverage] = useState(5);
  const [leverage, setLeverage] = useState(5);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [autoClose, setAutoClose] = useState(false);
  const [autoCloseTp, setAutoCloseTp] = useState(2);
  const [autoCloseSl, setAutoCloseSl] = useState(1.5);
  const [pendingAutoOpen, setPendingAutoOpen] = useState<TradingSignal | null>(null);
  const closePositionRef = useRef<(pos: DemoPosition, price?: number) => void>(() => {});
  const closingIdsRef = useRef<Set<string>>(new Set());
  const { token } = useAuth();

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
          const s = msg.data as TradingSignal;
          const norm = (x: TradingSignal) => x.symbol?.replace('/', '-') || '';
          setSignals((prev) => [s, ...prev.filter((x) => norm(x) !== norm(s))]);
          if (autoOpen) setPendingAutoOpen(s);
        }
      } catch {}
    };
    return () => ws.close();
  }, [autoOpen, token]);

  useEffect(() => {
    if (!pendingAutoOpen || !autoOpen) return;
    openPositionRef.current(pendingAutoOpen, autoOpenSize, autoOpenLeverage, true);
    setPendingAutoOpen(null);
  }, [pendingAutoOpen, autoOpen, autoOpenSize, autoOpenLeverage]);

  const getSignal = () => {
    if (analyzing) return;
    setAnalyzing(true);
    const sym = analyzeSymbol.replace(/_/g, '-').toUpperCase() || 'BTC-USDT';
    fetch(`${API}/market/analyze/${encodeURIComponent(sym)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeframe: '5m' })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.signal) {
          const norm = (s: TradingSignal) => s.symbol?.replace('/', '-') || '';
          setSignals((prev) => [data.signal, ...prev.filter((s) => norm(s) !== norm(data.signal))]);
        }
      })
      .catch(() => {})
      .finally(() => setAnalyzing(false));
  };

  useEffect(() => {
    fetch(`${API}/signals?limit=20`)
      .then((r) => r.json())
      .then(setSignals)
      .catch(() => {});
  }, []);

  const totalPnl = balance - initialBalance;
  const totalPnlPercent = initialBalance > 0 ? (totalPnl / initialBalance) * 100 : 0;
  const totalTrades = history.length;
  const winTrades = history.filter((h) => h.pnl > 0).length;
  const lossTrades = history.filter((h) => h.pnl < 0).length;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const grossProfit = history.filter((h) => h.pnl > 0).reduce((s, h) => s + h.pnl, 0);
  const grossLoss = Math.abs(history.filter((h) => h.pnl < 0).reduce((s, h) => s + h.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const avgWin = winTrades > 0 ? grossProfit / winTrades : 0;
  const avgLoss = lossTrades > 0 ? grossLoss / lossTrades : 0;
  const demoHistoryCompare = useMemo(() => ({
    pair: (a: HistoryEntry, b: HistoryEntry) => (a.pair || '').localeCompare(b.pair || ''),
    direction: (a: HistoryEntry, b: HistoryEntry) => (a.direction || '').localeCompare(b.direction || ''),
    pnl: (a: HistoryEntry, b: HistoryEntry) => a.pnl - b.pnl,
    closeTime: (a: HistoryEntry, b: HistoryEntry) => new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime()
  }), []);
  const { sortedItems: sortedDemoHistory, sortKey: demoSortKey, sortDir: demoSortDir, toggleSort: demoToggleSort } = useTableSort(history, demoHistoryCompare, 'closeTime', 'desc');

  const bestTrade = history.length ? Math.max(...history.map((h) => h.pnl), 0) : 0;
  const worstTrade = history.length ? Math.min(...history.map((h) => h.pnl), 0) : 0;
  const longTrades = history.filter((h) => h.direction === 'LONG');
  const shortTrades = history.filter((h) => h.direction === 'SHORT');
  const longWins = longTrades.filter((h) => h.pnl > 0).length;
  const shortWins = shortTrades.filter((h) => h.pnl > 0).length;
  const autoOpenedCount = history.filter((h) => h.autoOpened).length;

  const startAutoAnalyze = () => {
    fetch(`${API}/market/auto-analyze/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ symbol: analyzeSymbol, timeframe: '5m', intervalMs: 120000 })
    })
      .then((r) => r.json())
      .then(() => setAutoAnalyze(true))
      .catch(() => {});
  };
  const stopAutoAnalyze = () => {
    fetch(`${API}/market/auto-analyze/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
      .then((r) => r.json())
      .then(() => setAutoAnalyze(false))
      .catch(() => {});
  };

  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const openPositionRef = useRef<(s: TradingSignal, p: number, lev: number, auto?: boolean) => void>(() => {});

  const openPosition = (signal: TradingSignal, sizePercent: number, lev: number, isAuto = false) => {
    const b = balanceRef.current;
    const size = (b * sizePercent) / 100;
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
      autoOpened: isAuto
    };
    setPositions((p) => [...p, pos]);
    setBalance((prev) => prev - size);
    setSignals((prev) => prev.filter((s) => s.id !== signal.id));
    notifyTelegram(
      `📈 <b>Позиция открыта</b>\n` +
      `${signal.symbol} ${signal.direction} | $${size.toFixed(2)} | ${lev}x\n` +
      `Вход: ${signal.entry_price?.toLocaleString('ru-RU')}`
    );
  };
  openPositionRef.current = openPosition;

  const closePosition = (pos: DemoPosition, usePrice?: number) => {
    const price = usePrice ?? pos.currentPrice;
    const lev = pos.leverage || 1;
    // size = номинал в USDT; PnL в USDT = (priceChg%) × size (плечо не входит)
    const pnl = pos.signal.direction === 'LONG'
      ? ((price - pos.openPrice) / pos.openPrice) * pos.size
      : ((pos.openPrice - price) / pos.openPrice) * pos.size;
    const pnlPercent = pos.size > 0 ? (pnl / pos.size) * 100 : 0;
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
      autoOpened: pos.autoOpened
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

  const updatePositionSLTP = (posId: string, stopLoss?: number | null, takeProfit?: number[] | null) => {
    setPositions((prev) =>
      prev.map((p) => {
        if (p.id !== posId) return p;
        const next = { ...p };
        if (stopLoss !== undefined) next.stopLoss = stopLoss && stopLoss > 0 ? stopLoss : undefined;
        if (takeProfit !== undefined) next.takeProfit = takeProfit && takeProfit.length ? takeProfit : undefined;
        return next;
      })
    );
  };

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
            const updated = { ...p, currentPrice: price };
                const sl = getSL(p);
                const tpLevels = getTP(p);
                let shouldClose = false;
                let closeAt = price;
                if (p.signal.direction === 'LONG') {
                  if (sl > 0 && price <= sl) {
                    shouldClose = true;
                    closeAt = sl;
                  } else if (tpLevels.length) {
                    const hit = tpLevels.filter((t) => price >= t).sort((a, b) => a - b)[0];
                    if (hit != null) {
                      shouldClose = true;
                      closeAt = hit;
                    }
                  }
                } else {
                  if (sl > 0 && price >= sl) {
                    shouldClose = true;
                    closeAt = sl;
                  } else if (tpLevels.length) {
                    const hit = tpLevels.filter((t) => price <= t).sort((a, b) => b - a)[0];
                    if (hit != null) {
                      shouldClose = true;
                      closeAt = hit;
                    }
                  }
                }
                if (!shouldClose && autoClose) {
                  const holdSec = (Date.now() - new Date(p.openTime).getTime()) / 1000;
                  if (holdSec >= 60) {
                    const lev = p.leverage || 1;
                    const pnlPct = p.signal.direction === 'LONG'
                      ? ((price - p.openPrice) / p.openPrice) * 100 * lev
                      : ((p.openPrice - price) / p.openPrice) * 100 * lev;
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
  }, [positions.length, autoClose, autoCloseTp, autoCloseSl]);

  const cardStyle = { background: 'var(--bg-card-solid)', border: '1px solid var(--border)' };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Демо-торговля</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Виртуальный счёт $10 000. Открывайте позиции по сигналам без риска для капитала.
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-xl p-5 shrink-0" style={cardStyle}>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Баланс</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>${balance.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>P&L</p>
            <p className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ({totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%)
            </p>
          </div>
          <button
            onClick={() => { setBalance(10000); setPositions([]); setHistory([]); }}
            className="px-5 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            Сбросить счёт
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl p-5 shrink-0" style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Открытые позиции ({positions.length})</h3>
          {positions.length === 0 ? (
            <p className="text-sm leading-relaxed py-6" style={{ color: 'var(--text-muted)' }}>Нет открытых позиций. Выберите сигнал ниже для открытия демо-позиции.</p>
          ) : (
            <div className="space-y-3">
              {positions.map((pos) => {
                const lev = pos.leverage || 1;
                const rawPct = pos.signal.direction === 'LONG'
                  ? ((pos.currentPrice - pos.openPrice) / pos.openPrice) * 100
                  : ((pos.openPrice - pos.currentPrice) / pos.openPrice) * 100;
                const pnlPct = rawPct * lev; // % на маржу (для отображения)
                const pnl = pos.size * (rawPct / 100); // PnL в USDT без × lev
                const sl = getSL(pos);
                const tp = getTP(pos);
                return (
                  <div
                    key={pos.id}
                    className={`rounded-xl p-4 border-l-4 ${pos.signal.direction === 'LONG' ? 'border-l-[var(--success)]' : 'border-l-[var(--danger)]'}`}
                    style={pos.signal.direction === 'LONG' ? { ...cardStyle, background: 'var(--success-bg)' } : { ...cardStyle, background: 'var(--danger-bg)' }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold">{pos.signal.symbol} {pos.signal.direction}</span>
                      <button
                        onClick={() => closePosition(pos)}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        Закрыть
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <p><span style={{ color: 'var(--text-muted)' }}>Размер: </span><span>${pos.size.toFixed(2)}</span></p>
                      <p><span style={{ color: 'var(--text-muted)' }}>Плечо: </span><span style={{ color: 'var(--warning)' }}>{lev}x</span></p>
                      <p><span style={{ color: 'var(--text-muted)' }}>Вход: </span><span>{pos.openPrice.toLocaleString('ru-RU')}</span></p>
                      <p><span style={{ color: 'var(--text-muted)' }}>Текущая: </span><span>{pos.currentPrice.toLocaleString('ru-RU')}</span></p>
                      <p><span style={{ color: 'var(--text-muted)' }}>P&L: </span><span className={pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                      </span></p>
                      <p className="col-span-2 flex items-center gap-3 mt-1">
                        <span className="text-sm" style={{ color: 'var(--danger)' }}>Stop-Loss:</span>
                        <input
                          type="number"
                          value={pos.stopLoss !== undefined ? pos.stopLoss : sl || ''}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            updatePositionSLTP(pos.id, v === '' ? null : parseFloat(v), undefined);
                          }}
                          placeholder={sl ? String(sl) : '—'}
                          className="input-field flex-1 max-w-[130px] text-sm py-1 text-red-300"
                          step={0.01}
                        />
                      </p>
                      <p className="col-span-2 flex items-center gap-3 flex-wrap mt-1">
                        <span className="text-sm" style={{ color: 'var(--success)' }}>Take-Profit:</span>
                        <input
                          type="text"
                          value={(pos.takeProfit ?? tp).length ? (pos.takeProfit ?? tp).join(', ') : ''}
                          onChange={(e) => {
                            const vals = e.target.value.split(/[\s,;]+/).map((s) => parseFloat(s.replace(/\s/g, ''))).filter((n) => !Number.isNaN(n) && n > 0);
                            updatePositionSLTP(pos.id, undefined, vals.length ? vals : null);
                          }}
                          placeholder={tp.length ? tp.join(', ') : '76500, 77000, 77500'}
                          className="input-field flex-1 min-w-[160px] text-sm py-1 text-[var(--primary)]"
                        />
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl p-5 shrink-0" style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Расширенная статистика</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Всего сделок</span>
              <span className="font-medium">{totalTrades}</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Win Rate</span>
              <span className="font-medium text-[var(--success)]">{winRate.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Прибыльных</span>
              <span className="font-medium text-[var(--success)]">{winTrades}</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Убыточных</span>
              <span className="font-medium text-[var(--danger)]">{lossTrades}</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Profit Factor</span>
              <span className="font-medium">{profitFactor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Средняя прибыль</span>
              <span className="font-medium text-[var(--success)]">+${avgWin.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Средний убыток</span>
              <span className="font-medium text-[var(--danger)]">-${avgLoss.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Лучшая сделка</span>
              <span className="font-medium text-[var(--success)]">+${bestTrade.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Худшая сделка</span>
              <span className="font-medium text-[var(--danger)]">${worstTrade.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>LONG: win rate</span>
              <span className="font-medium">{longTrades.length ? ((longWins / longTrades.length) * 100).toFixed(1) : '-'}%</span>
            </div>
            <div className="flex justify-between items-baseline gap-4">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>SHORT: win rate</span>
              <span className="font-medium">{shortTrades.length ? ((shortWins / shortTrades.length) * 100).toFixed(1) : '-'}%</span>
            </div>
            <div className="flex justify-between items-baseline gap-4 col-span-2">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Авто-открыто</span>
              <span className="font-medium">{autoOpenedCount} / {totalTrades}</span>
            </div>
          </div>
        </section>
      </div>

      {history.length > 0 && (
        <section className="rounded-xl p-5 shrink-0" style={cardStyle}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>История сделок</h3>
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: 'var(--border)' }}>
                  <SortableTh label="Пара" sortKey="pair" currentKey={demoSortKey} sortDir={demoSortDir} onSort={demoToggleSort} />
                  <SortableTh label="Направление" sortKey="direction" currentKey={demoSortKey} sortDir={demoSortDir} onSort={demoToggleSort} />
                  <th className="py-3 px-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Плечо</th>
                  <th className="py-3 px-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Вход</th>
                  <th className="py-3 px-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Выход</th>
                  <SortableTh label="P&L" sortKey="pnl" currentKey={demoSortKey} sortDir={demoSortDir} onSort={demoToggleSort} />
                  <SortableTh label="Время" sortKey="closeTime" currentKey={demoSortKey} sortDir={demoSortDir} onSort={demoToggleSort} />
                  <th className="py-3 px-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Авто</th>
                </tr>
              </thead>
              <tbody>
                {sortedDemoHistory.slice(0, 20).map((h) => (
                  <tr key={h.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 px-3 font-medium">{h.pair}</td>
                    <td className={`py-3 px-3 ${h.direction === 'LONG' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{h.direction}</td>
                    <td className="py-3 px-3 text-[var(--warning)]">{(h.leverage ?? 1)}x</td>
                    <td className="py-3 px-3">{h.openPrice.toLocaleString('ru-RU')}</td>
                    <td className="py-3 px-3">{h.closePrice.toLocaleString('ru-RU')}</td>
                    <td className={`py-3 px-3 ${h.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {h.pnl >= 0 ? '+' : ''}{h.pnl.toFixed(2)} ({h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent.toFixed(2)}%)
                    </td>
                    <td className="py-3 px-3" style={{ color: 'var(--text-muted)' }}>{new Date(h.closeTime).toLocaleString('ru-RU')}</td>
                    <td className="py-3 px-3">{h.autoOpened ? '✓' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl p-5 shrink-0" style={cardStyle}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Сигналы для открытия демо-позиции</h3>
        <div className="flex flex-wrap gap-4 items-center mb-5 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoOpen}
              onChange={(e) => setAutoOpen(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Авто-открытие</span>
          </label>
          {autoOpen && (
            <>
              <select
                value={autoOpenSize}
                onChange={(e) => setAutoOpenSize(Number(e.target.value))}
                className="input-field w-20 text-sm py-1"
              >
                <option value={5}>5%</option>
                <option value={10}>10%</option>
              </select>
              <select
                value={autoOpenLeverage}
                onChange={(e) => setAutoOpenLeverage(Number(e.target.value))}
                className="input-field w-16 text-sm py-1"
                title="Плечо"
              >
                {LEVERAGES.map((l) => (
                  <option key={l} value={l}>{l}x</option>
                ))}
              </select>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(e) => (e.target.checked ? startAutoAnalyze() : stopAutoAnalyze())}
              className="rounded"
            />
            <span>Авто-анализ (2 мин)</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoClose}
              onChange={(e) => setAutoClose(e.target.checked)}
              className="rounded"
            />
            <span>Авто-закрытие</span>
          </label>
          {autoClose && (
            <>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>TP:</span>
              <input
                type="number"
                value={autoCloseTp}
                onChange={(e) => setAutoCloseTp(Math.max(0.1, Number(e.target.value)))}
                className="input-field w-16 text-sm py-1"
                min={0.1}
                step={0.5}
              />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>SL:</span>
              <input
                type="number"
                value={autoCloseSl}
                onChange={(e) => setAutoCloseSl(Math.max(0.1, Number(e.target.value)))}
                className="input-field w-16 text-sm py-1"
                min={0.1}
                step={0.5}
              />
            </>
          )}
          <input
            value={analyzeSymbol}
            onChange={(e) => setAnalyzeSymbol(e.target.value.toUpperCase().replace(/\s/g, ''))}
            placeholder="BTC-USDT"
            className="rounded-xl px-3 py-2 text-sm border w-32 bg-transparent"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={getSignal}
            disabled={analyzing}
            className="px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {analyzing ? 'Анализ...' : 'Получить сигнал'}
          </button>
        </div>
        {signals.length === 0 ? (
          <p className="text-sm leading-relaxed py-6" style={{ color: 'var(--text-muted)' }}>Нет доступных сигналов. Нажмите «Получить сигнал» или запустите анализ на Dashboard.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Плечо:</span>
              {LEVERAGES.map((l) => (
                <button
                  key={l}
                  onClick={() => setLeverage(l)}
                  className={`px-4 py-2 text-sm font-medium rounded-xl transition ${
                    leverage === l ? 'text-white' : ''
                  }`}
                  style={leverage === l ? { background: 'var(--accent)' } : { background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                >
                  {l}x
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSignals([])}
                className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg transition-opacity hover:opacity-90"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                title="Убрать все сигналы с экрана"
              >
                Очистить все
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {signals.slice(0, 9).map((s, idx) => (
              <div
                key={s.id ?? `sig-${idx}`}
                className={`rounded-xl p-4 shrink-0 relative ${s.direction === 'LONG' ? 'border-l-4 border-l-[var(--success)]' : 'border-l-4 border-l-[var(--danger)]'}`}
                style={cardStyle}
              >
                <button
                  type="button"
                  onClick={() => setSignals((prev) => prev.filter((x) => x !== s))}
                  className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full transition-opacity hover:opacity-100 opacity-60"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                  title="Убрать сигнал"
                  aria-label="Закрыть"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
                <div className="flex justify-between items-center mb-3 pr-8">
                  <span className="font-bold">{s.symbol}</span>
                  <span className={s.direction === 'LONG' ? 'badge-long' : 'badge-short'}>
                    {s.direction}
                  </span>
                </div>
                <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Вход: {(s.entry_price ?? 0).toLocaleString('ru-RU')}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => openPosition(s, 5, leverage)}
                    className="flex-1 btn-primary text-sm py-1.5"
                  >
                    5%
                  </button>
                  <button
                    onClick={() => openPosition(s, 10, leverage)}
                    className="flex-1 btn-secondary text-sm py-1.5"
                  >
                    10%
                  </button>
                </div>
              </div>
            ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
