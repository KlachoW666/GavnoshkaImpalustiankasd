/**
 * Trade page — Bitget-style: Markets | Chart | Order book + Trades + Place order + Positions
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData } from 'lightweight-charts';
import { OHLCVCandle } from '../types/signal';
import { fetchPrice, normSymbol } from '../utils/fetchPrice';
import { getSettings } from '../store/settingsStore';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';

const API = '/api';
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const TF_SECONDS: Record<string, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400
};
const OB_ROWS = 8;
const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 100];
const MAIN_TABS = ['chart', 'overview', 'data', 'news'] as const;
const BOTTOM_TABS = ['orders', 'positions', 'orderHistory', 'tradeHistory', 'assets', 'loans', 'tools', 'pnl'] as const;

type TickerRow = { symbol: string; last: number; change24h: number; volume24h: number; high24h?: number; low24h?: number };
type InternalPosition = {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size_usdt: number;
  leverage: number;
  open_price: number;
  status: string;
  close_price?: number;
  pnl_usdt?: number;
  pnl_percent?: number;
};
type TradeRow = { price: number; amount: number; time: number; isBuy: boolean };

function toChartTime(tsMs: number, tf: string): number | string {
  const sec = TF_SECONDS[tf] || 900;
  const aligned = Math.floor(tsMs / 1000 / sec) * sec;
  if (tf === '1d') {
    const d = new Date(aligned * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  return aligned;
}

function ohlcToHeikinAshi(candles: OHLCVCandle[], timeframe: string): CandlestickData[] {
  const out: CandlestickData[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    out.push({
      time: toChartTime(c.timestamp, timeframe) as any,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose
    });
  }
  return out;
}

function StableOrderbookList({ bids, asks }: { bids: [number, number][]; asks: [number, number][] }) {
  const askRows = [...(asks || [])].reverse().slice(0, OB_ROWS);
  const bidRows = (bids || []).slice(0, OB_ROWS);
  return (
    <div className="text-sm font-mono">
      <div className="text-[10px] uppercase tracking-wider py-1" style={{ color: 'var(--danger)' }}>Ask</div>
      {Array.from({ length: OB_ROWS }, (_, i) => {
        const row = askRows[i];
        return (
          <div key={`a-${i}`} className="flex justify-between py-0.5 h-6" style={{ color: 'var(--danger)', minHeight: '24px' }}>
            <span className="truncate">{row ? Number(row[0]).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span>
            <span className="text-right min-w-[4rem] shrink-0" style={{ color: 'var(--text-muted)' }}>{row ? Number(row[1]).toFixed(4) : '—'}</span>
          </div>
        );
      })}
      <div className="border-t py-1 my-0.5 text-center text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>—</div>
      <div className="text-[10px] uppercase tracking-wider py-1" style={{ color: 'var(--success)' }}>Bid</div>
      {Array.from({ length: OB_ROWS }, (_, i) => {
        const row = bidRows[i];
        return (
          <div key={`b-${i}`} className="flex justify-between py-0.5 h-6" style={{ color: 'var(--success)', minHeight: '24px' }}>
            <span className="truncate">{row ? Number(row[0]).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span>
            <span className="text-right min-w-[4rem] shrink-0" style={{ color: 'var(--text-muted)' }}>{row ? Number(row[1]).toFixed(4) : '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

function getSymbolFromUrl(): string {
  if (typeof window === 'undefined') return 'BTC-USDT';
  const q = new URLSearchParams(window.location.search);
  const s = q.get('symbol')?.trim();
  return s && /^[A-Z0-9\-/]+$/i.test(s) ? s.replace(/\//g, '-') : 'BTC-USDT';
}

function setSymbolInUrl(symbol: string) {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  u.searchParams.set('symbol', symbol);
  window.history.replaceState({}, '', u.pathname + u.search);
}

export default function TradePage() {
  const { token } = useAuth();
  const [symbol, setSymbol] = useState(getSymbolFromUrl);
  const [timeframe, setTimeframe] = useState('5m');
  const [tickers, setTickers] = useState<TickerRow[]>([]);
  const [orderbook, setOrderbook] = useState<{ bids: [number, number][]; asks: [number, number][] } | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [positions, setPositions] = useState<{ open: InternalPosition[]; closed: InternalPosition[] }>({ open: [], closed: [] });
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [sizeUsdt, setSizeUsdt] = useState('');
  const [leverage, setLeverage] = useState(5);
  const [limitPrice, setLimitPrice] = useState('');
  const [tradeError, setTradeError] = useState('');
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [loadingClose, setLoadingClose] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'orderbook' | 'trades' | 'order' | 'positions'>('order');
  const [marketTab, setMarketTab] = useState<'futures' | 'spot'>('futures');
  const [mainTab, setMainTab] = useState<(typeof MAIN_TABS)[number]>('chart');
  const [bottomTab, setBottomTab] = useState<(typeof BOTTOM_TABS)[number]>('positions');
  const [orderPercent, setOrderPercent] = useState(0);
  const [showTpSl, setShowTpSl] = useState(false);
  const [postOnly, setPostOnly] = useState(false);
  const [reduceOnly, setReduceOnly] = useState(false);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lastCandleTimeRef = useRef<number | null>(null);
  const displaySettings = getSettings().display;
  const chartStyle = displaySettings.chartStyle;

  const selectSymbol = useCallback((s: string) => {
    setSymbol(s);
    setSymbolInUrl(s);
  }, []);

  useEffect(() => {
    const onPopState = () => setSymbol(getSymbolFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    api.get<TickerRow[]>('/market/tickers')
      .then(setTickers)
      .catch(() => setTickers([]));
    const id = setInterval(() => {
      api.get<TickerRow[]>('/market/tickers').then(setTickers).catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!token) return;
    api.get<{ balance: number }>('/wallet/balance', { headers: { Authorization: `Bearer ${token}` } as HeadersInit })
      .then((r) => setBalance(r.balance))
      .catch(() => setBalance(0));
    const id = setInterval(() => {
      api.get<{ balance: number }>('/wallet/balance', { headers: { Authorization: `Bearer ${token}` } as HeadersInit })
        .then((r) => setBalance(r.balance))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [token]);

  const fetchPositions = useCallback(async () => {
    if (!token) return;
    try {
      const r = await api.get<{ open: InternalPosition[]; closed: InternalPosition[] }>('/wallet/positions', { headers: { Authorization: `Bearer ${token}` } as HeadersInit });
      setPositions({ open: r.open || [], closed: r.closed || [] });
    } catch {
      setPositions({ open: [], closed: [] });
    }
  }, [token]);

  useEffect(() => {
    fetchPositions();
    const id = setInterval(fetchPositions, 10000);
    return () => clearInterval(id);
  }, [fetchPositions]);

  const loadCandles = useCallback((isInitial: boolean) => {
    const sym = normSymbol(symbol) || symbol.replace(/_/g, '-');
    const isLine = chartStyle === 'line';
    fetch(`${API}/market/candles/${encodeURIComponent(sym)}?timeframe=${timeframe}&limit=200&exchange=okx`)
      .then((r) => r.json())
      .then((data: OHLCVCandle[]) => {
        const candles = Array.isArray(data) ? data : [];
        if (!candles.length || !seriesRef.current) return;
        const volData: HistogramData[] = candles.map((c: OHLCVCandle) => ({
          time: toChartTime(c.timestamp, timeframe) as any,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(76,175,80,0.5)' : 'rgba(255,82,82,0.5)'
        }));
        if (isLine) {
          const lineData = candles.map((c: OHLCVCandle) => ({ time: toChartTime(c.timestamp, timeframe) as any, value: c.close }));
          if (isInitial || lastCandleTimeRef.current === null) {
            (seriesRef.current as any).setData(lineData);
            volumeRef.current?.setData(volData);
            if (isInitial) chartInstance.current?.timeScale().fitContent();
            lastCandleTimeRef.current = lineData.length ? (lineData[lineData.length - 1].time as number) : null;
          } else {
            const last = lineData[lineData.length - 1];
            const lastVol = volData[volData.length - 1];
            if (last && lastVol) {
              (seriesRef.current as any).update(last);
              volumeRef.current?.update(lastVol);
              lastCandleTimeRef.current = last.time as number;
            }
          }
        } else {
          const candleData: CandlestickData[] =
            chartStyle === 'heikin-ashi'
              ? ohlcToHeikinAshi(candles, timeframe)
              : candles.map((c: OHLCVCandle) => ({
                  time: toChartTime(c.timestamp, timeframe) as any,
                  open: c.open,
                  high: c.high,
                  low: c.low,
                  close: c.close
                }));
          if (isInitial || lastCandleTimeRef.current === null) {
            seriesRef.current!.setData(candleData);
            volumeRef.current?.setData(volData);
            if (isInitial) chartInstance.current?.timeScale().fitContent();
            lastCandleTimeRef.current = candleData.length ? (candleData[candleData.length - 1].time as number) : null;
          } else {
            const last = candleData[candleData.length - 1];
            const lastVol = volData[volData.length - 1];
            if (last && lastVol) {
              seriesRef.current!.update(last);
              volumeRef.current?.update(lastVol);
              lastCandleTimeRef.current = last.time as number;
            }
          }
        }
      })
      .catch(() => {});
  }, [symbol, timeframe, chartStyle]);

  useEffect(() => {
    if (!chartRef.current) return;
    const el = chartRef.current;
    const chart = createChart(el, {
      layout: { background: { color: '#000' }, textColor: '#71757A' },
      grid: { vertLines: { color: '#1E2023' }, horzLines: { color: '#1E2023' } },
      rightPriceScale: { scaleMargins: { top: 0.05, bottom: 0.15 }, borderColor: '#25282C' },
      timeScale: { visible: true, rightOffset: 12, timeVisible: true, borderColor: '#25282C' },
      crosshair: { vertLine: { color: 'rgba(255,156,46,0.2)' }, horzLine: { color: 'rgba(255,156,46,0.2)' } },
      handleScale: { axisPressedMouseMove: true, pinch: true },
      handleScroll: { vertTouchDrag: true, horzTouchDrag: true }
    });
    const isLine = chartStyle === 'line';
    const series = isLine
      ? chart.addLineSeries({ color: '#FF9C2E', lineWidth: 2 })
      : chart.addCandlestickSeries({
          upColor: '#20B26C',
          downColor: '#EF454A',
          borderUpColor: '#20B26C',
          borderDownColor: '#EF454A',
          wickUpColor: '#20B26C',
          wickDownColor: '#EF454A'
        });
    if (!isLine) series.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.15 } });
    const volumeSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, borderVisible: false });
    chartInstance.current = chart;
    seriesRef.current = series as ISeriesApi<'Candlestick'>;
    volumeRef.current = volumeSeries;
    lastCandleTimeRef.current = null;
    loadCandles(true);
    const resize = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) chart.resize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    return () => {
      ro.disconnect();
      chart.remove();
      chartInstance.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
    };
  }, [chartStyle]);

  useEffect(() => {
    lastCandleTimeRef.current = null;
    loadCandles(true);
  }, [symbol, timeframe]);

  useEffect(() => {
    const interval = TF_SECONDS[timeframe] && TF_SECONDS[timeframe] <= 300 ? 1000 : TF_SECONDS[timeframe] && TF_SECONDS[timeframe] <= 3600 ? 2000 : 3000;
    const id = setInterval(() => loadCandles(false), interval);
    return () => clearInterval(id);
  }, [symbol, timeframe, loadCandles]);

  useEffect(() => {
    const sym = normSymbol(symbol) || symbol.replace(/_/g, '-');
    fetch(`${API}/market/orderbook/${encodeURIComponent(sym)}?limit=15`)
      .then((r) => r.json())
      .then((data) => setOrderbook(data?.bids?.length || data?.asks?.length ? { bids: data.bids || [], asks: data.asks || [] } : null))
      .catch(() => setOrderbook(null));
    const tid = setInterval(() => {
      fetch(`${API}/market/orderbook/${encodeURIComponent(sym)}?limit=15`)
        .then((r) => r.json())
        .then((data) => setOrderbook(data?.bids?.length || data?.asks?.length ? { bids: data.bids || [], asks: data.asks || [] } : null))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(tid);
  }, [symbol]);

  useEffect(() => {
    const sym = normSymbol(symbol) || symbol.replace(/_/g, '-');
    const load = () => {
      fetch(`${API}/market/trades/${encodeURIComponent(sym)}?limit=30`)
        .then((r) => r.json())
        .then((data) => Array.isArray(data) && data.length && setTrades(data))
        .catch(() => {});
    };
    load();
    const tid = setInterval(load, 3000);
    return () => clearInterval(tid);
  }, [symbol]);

  const effectiveLeverage = marketTab === 'spot' ? 1 : (orderType === 'market' ? leverage : 1);

  const handleOpenPosition = async () => {
    const size = parseFloat(sizeUsdt);
    setTradeError('');
    if (!size || size < 1) {
      setTradeError('Минимум 1 USDT');
      return;
    }
    const lev = effectiveLeverage;
    const margin = size / lev;
    if (balance != null && balance < margin) {
      setTradeError(`Недостаточно. Маржа: ${margin.toFixed(2)} USDT`);
      return;
    }
    if (!token) return;
    setLoadingOpen(true);
    try {
      const r = await api.post<{ ok: boolean; id?: string; error?: string }>(
        '/wallet/open-position',
        { symbol, direction, sizeUsdt: size, leverage: lev },
        { headers: { Authorization: `Bearer ${token}` } as HeadersInit }
      );
      if ((r as any).ok) {
        setSizeUsdt('');
        setBalance((prev) => (prev != null ? prev - margin : null));
        await fetchPositions();
      } else {
        setTradeError((r as any).error || 'Ошибка');
      }
    } catch (e) {
      setTradeError((e as Error).message);
    } finally {
      setLoadingOpen(false);
    }
  };

  const handleClosePosition = async (pos: InternalPosition) => {
    if (!token) return;
    setLoadingClose(pos.id);
    try {
      const r = await api.post<{ ok: boolean; pnl?: number; error?: string }>(
        '/wallet/close-position',
        { id: pos.id },
        { headers: { Authorization: `Bearer ${token}` } as HeadersInit }
      );
      if ((r as any).ok) {
        const margin = pos.size_usdt / pos.leverage;
        const pnl = (r as any).pnl ?? 0;
        setBalance((prev) => (prev != null ? prev + margin + pnl : null));
        await fetchPositions();
      } else {
        setTradeError((r as any).error || 'Ошибка');
      }
    } catch (e) {
      setTradeError((e as Error).message);
    } finally {
      setLoadingClose(null);
    }
  };

  const currentTicker = tickers.find((t) => t.symbol === symbol);
  const lastPrice = currentTicker?.last ?? (orderbook?.bids?.[0]?.[0] ?? orderbook?.asks?.[0]?.[0] ?? 0);
  const indexPrice = lastPrice;
  const change24 = currentTicker?.change24h ?? 0;
  const change24Abs = currentTicker ? Math.abs((currentTicker.last * change24) / 100) : 0;
  const high24 = currentTicker?.high24h ?? currentTicker?.last ?? 0;
  const low24 = currentTicker?.low24h ?? currentTicker?.last ?? 0;
  const volume24 = currentTicker?.volume24h ?? 0;
  const fundingCountdown = '02:00:00';

  const setLastPrice = () => setLimitPrice(lastPrice > 0 ? String(lastPrice) : '');

  const marginFromPercent = balance != null && balance > 0 ? (balance * orderPercent) / 100 : 0;
  const sizeFromPercent = marginFromPercent * effectiveLeverage;
  const displaySize = sizeUsdt ? parseFloat(sizeUsdt) : sizeFromPercent;
  const setSizeFromPercent = (pct: number) => {
    setOrderPercent(pct);
    if (balance != null && balance > 0) {
      const m = (balance * pct) / 100;
      const s = m * effectiveLeverage;
      setSizeUsdt(s >= 1 ? s.toFixed(2) : '');
    }
  };

  const apiOpts = token ? { headers: { Authorization: `Bearer ${token}` } as HeadersInit } : {};

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] min-h-0 gap-0">
      {/* Top header bar — Bitget-style */}
      <header
        className="shrink-0 border-b px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{symbol.replace('-USDT', '')}USDT</span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Бессрочный USDT</span>
        </div>
        <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {lastPrice > 0 ? lastPrice.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
        </span>
        <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>Индекс. {indexPrice > 0 ? indexPrice.toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—'}</span>
        <span className="tabular-nums" style={{ color: change24 >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          {change24 >= 0 ? '+' : ''}{change24Abs.toFixed(2)} ({change24 >= 0 ? '+' : ''}{change24.toFixed(2)}%)
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>24ч Высокий</span>
        <span className="tabular-nums" style={{ color: 'var(--success)' }}>{high24 > 0 ? high24.toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—'}</span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>24ч Низкий</span>
        <span className="tabular-nums" style={{ color: 'var(--danger)' }}>{low24 > 0 ? low24.toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—'}</span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>24ч Оборот (USDT)</span>
        <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {volume24 >= 1e9 ? `${(volume24 / 1e9).toFixed(2)}B` : volume24 >= 1e6 ? `${(volume24 / 1e6).toFixed(2)}M` : volume24.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Ставка / Отсчёт</span>
        <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>0.0046% / {fundingCountdown}</span>
      </header>

      {/* Main tabs: График, Обзор, Данные, Лента новостей */}
      <div className="shrink-0 flex gap-0 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['chart', 'overview', 'data', 'news'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMainTab(t)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: mainTab === t ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: mainTab === t ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {t === 'chart' ? 'График' : t === 'overview' ? 'Обзор' : t === 'data' ? 'Данные' : 'Лента новостей'}
          </button>
        ))}
      </div>

      {/* Spot / Futures */}
      <div className="flex gap-1 shrink-0 px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={() => setMarketTab('futures')}
          className="px-3 py-1.5 text-sm font-medium rounded"
          style={{
            background: marketTab === 'futures' ? 'var(--accent-dim)' : 'transparent',
            color: marketTab === 'futures' ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          Фьючерсы
        </button>
        <button
          type="button"
          onClick={() => { setMarketTab('spot'); setOrderType('market'); setLeverage(1); }}
          className="px-3 py-1.5 text-sm font-medium rounded"
          style={{
            background: marketTab === 'spot' ? 'var(--accent-dim)' : 'transparent',
            color: marketTab === 'spot' ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          Spot
        </button>
      </div>

      <div className="flex-1 min-h-0 flex gap-0 overflow-hidden">
        {/* Left: Markets */}
        <div
          className="w-48 lg:w-56 shrink-0 flex flex-col border-r overflow-y-auto custom-scrollbar"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}
        >
          <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Рынки
          </div>
          {tickers.length === 0 ? (
            <p className="px-2 py-4 text-sm" style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
          ) : (
            <div className="flex flex-col">
              {tickers.map((t) => {
                const active = t.symbol === symbol;
                return (
                  <button
                    key={t.symbol}
                    type="button"
                    onClick={() => selectSymbol(t.symbol)}
                    className="px-2 py-2.5 text-left flex flex-col gap-0.5 transition-colors"
                    style={{
                      background: active ? 'var(--accent-dim)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent'
                    }}
                  >
                    <span className="font-medium text-sm">{t.symbol.replace('-USDT', '')}</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {t.last.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: t.change24h >= 0 ? 'var(--success)' : 'var(--danger)' }}
                    >
                      {t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(2)}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Center: Chart / Обзор / Данные / Лента новостей */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 relative">
          <div
            className="flex-1 min-w-0 flex flex-col min-h-0"
            style={{ display: mainTab === 'chart' ? 'flex' : 'none' }}
          >
            <div className="flex items-center gap-2 shrink-0 px-2 py-1.5 border-b flex-wrap" style={{ borderColor: 'var(--border)', background: 'var(--bg-topbar)' }}>
              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{symbol}</span>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="input-field py-1 px-2 text-sm rounded"
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </div>
            <div ref={chartRef} className="flex-1 min-h-[280px]" style={{ height: '100%' }} />
          </div>
          {mainTab === 'overview' && (
            <div className="absolute inset-0 flex flex-col overflow-y-auto p-4" style={{ background: 'var(--bg)' }}>
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>О паре {symbol}</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Бессрочный контракт {symbol}. Текущая цена: {lastPrice > 0 ? lastPrice.toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—'}.
              </p>
            </div>
          )}
          {mainTab === 'data' && (
            <div className="absolute inset-0 flex flex-col overflow-y-auto p-4" style={{ background: 'var(--bg)' }}>
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Данные</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Раздел в разработке.</p>
            </div>
          )}
          {mainTab === 'news' && (
            <div className="absolute inset-0 flex flex-col overflow-y-auto p-4" style={{ background: 'var(--bg)' }}>
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Лента новостей</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Раздел в разработке.</p>
            </div>
          )}
        </div>

        {/* Right: Order book, Trades, Order form, Positions */}
        <div
          className="w-72 lg:w-80 shrink-0 flex flex-col border-l overflow-hidden"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}
        >
          <div className="shrink-0 px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Марж. торговля
          </div>
          {marketTab === 'futures' && (
            <div className="shrink-0 px-3 pb-2 flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Плечо</span>
              <select
                value={leverage}
                onChange={(e) => setLeverage(parseInt(e.target.value, 10))}
                className="input-field py-1 px-2 text-sm rounded"
              >
                {LEVERAGE_OPTIONS.map((x) => (
                  <option key={x} value={x}>{x}x</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
            {(['orderbook', 'trades', 'order', 'positions'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setRightTab(tab)}
                className="flex-1 py-2 text-[11px] font-medium"
                style={{
                  color: rightTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: rightTab === tab ? '2px solid var(--accent)' : '2px solid transparent'
                }}
              >
                {tab === 'orderbook' ? 'Стакан' : tab === 'trades' ? 'Сделки' : tab === 'order' ? 'Ордер' : 'Позиции'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
            {rightTab === 'orderbook' && (
              <div>
                {orderbook ? (
                  <StableOrderbookList bids={orderbook.bids || []} asks={orderbook.asks || []} />
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Загрузка стакана…</p>
                )}
              </div>
            )}
            {rightTab === 'trades' && (
              <div className="space-y-0 text-sm font-mono">
                {trades.length ? (
                  trades.slice(0, 12).map((t, i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                      <span style={{ color: t.isBuy ? 'var(--success)' : 'var(--danger)' }}>
                        {t.price.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{t.amount.toFixed(4)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>Нет сделок</p>
                )}
              </div>
            )}
            {rightTab === 'order' && (
              <div className="space-y-3">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setOrderType('limit')}
                    className="flex-1 py-1.5 text-xs font-medium rounded"
                    style={{ background: orderType === 'limit' ? 'var(--accent)' : 'var(--bg)', color: orderType === 'limit' ? '#fff' : 'var(--text-muted)' }}
                  >
                    Лимитный
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType('market')}
                    className="flex-1 py-1.5 text-xs font-medium rounded"
                    style={{ background: orderType === 'market' ? 'var(--accent)' : 'var(--bg)', color: orderType === 'market' ? '#fff' : 'var(--text-muted)' }}
                  >
                    Рыночный
                  </button>
                  <button
                    type="button"
                    className="flex-1 py-1.5 text-xs font-medium rounded opacity-60 cursor-not-allowed"
                    style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}
                    title="Скоро"
                  >
                    Условный
                  </button>
                </div>
                {orderType === 'limit' && (
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <label className="block text-xs flex-1" style={{ color: 'var(--text-muted)' }}>Цена</label>
                      <button
                        type="button"
                        onClick={setLastPrice}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                      >
                        Последняя
                      </button>
                    </div>
                    <input
                      type="number"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      placeholder="0"
                      className="input-field w-full rounded py-1.5 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>К-во (USDT)</label>
                  <input
                    type="number"
                    value={sizeUsdt}
                    onChange={(e) => { setSizeUsdt(e.target.value); setOrderPercent(0); }}
                    placeholder="0"
                    min={1}
                    step={1}
                    className="input-field w-full rounded py-1.5 text-sm"
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={orderPercent}
                      onChange={(e) => setSizeFromPercent(parseInt(e.target.value, 10))}
                      className="flex-1 h-1 rounded"
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span className="text-[10px] tabular-nums w-8" style={{ color: 'var(--text-muted)' }}>{orderPercent}%</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Стоим.</span>
                    <span className="block font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {displaySize > 0 ? displaySize.toFixed(2) : '—'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Цена ликвид.</span>
                    <span className="block font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {lastPrice > 0 && displaySize > 0 ? lastPrice.toFixed(2) : '—'}
                    </span>
                  </div>
                </div>
                <button type="button" className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
                  Рассчитать
                </button>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={showTpSl} onChange={(e) => setShowTpSl(e.target.checked)} className="rounded" />
                    TP/SL
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={postOnly} onChange={(e) => setPostOnly(e.target.checked)} className="rounded" />
                    Post-Only
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} className="rounded" />
                    Только сокращение
                  </label>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Годен до отмены</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection('LONG')}
                    className="flex-1 py-2.5 text-sm font-semibold rounded"
                    style={{
                      background: direction === 'LONG' ? 'var(--success)' : 'var(--bg)',
                      color: direction === 'LONG' ? '#fff' : 'var(--text-muted)',
                      border: `2px solid ${direction === 'LONG' ? 'var(--success)' : 'var(--border)'}`,
                    }}
                  >
                    Лонг
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('SHORT')}
                    className="flex-1 py-2.5 text-sm font-semibold rounded"
                    style={{
                      background: direction === 'SHORT' ? 'var(--danger)' : 'var(--bg)',
                      color: direction === 'SHORT' ? '#fff' : 'var(--text-muted)',
                      border: `2px solid ${direction === 'SHORT' ? 'var(--danger)' : 'var(--border)'}`,
                    }}
                  >
                    Шорт
                  </button>
                </div>
                <div className="flex gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <button type="button" className="underline">Ставка комиссии</button>
                  <button type="button" className="underline">Калькулятор</button>
                </div>
                {balance != null && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Баланс: {balance.toFixed(2)} USDT</p>
                )}
                {tradeError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{tradeError}</p>}
                <button
                  type="button"
                  onClick={handleOpenPosition}
                  disabled={loadingOpen || !sizeUsdt || balance == null || balance < 1}
                  className="w-full py-2.5 rounded font-semibold disabled:opacity-50 text-sm"
                  style={{
                    background: direction === 'LONG' ? 'var(--success)' : 'var(--danger)',
                    color: '#fff',
                  }}
                >
                  {loadingOpen ? 'Открытие…' : direction === 'LONG' ? 'Лонг' : 'Шорт'}
                </button>
              </div>
            )}
            {rightTab === 'positions' && (
              <div className="space-y-2">
                {positions.open.length === 0 ? (
                  <p className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>Нет открытых позиций</p>
                ) : (
                  positions.open.map((pos) => (
                    <div
                      key={pos.id}
                      className="p-2 rounded border flex flex-wrap items-center justify-between gap-2"
                      style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
                    >
                      <div className="text-xs">
                        <span className="font-medium">{pos.symbol}</span>
                        <span className={pos.direction === 'LONG' ? 'text-green-500' : 'text-red-500'} style={{ marginLeft: 4 }}>
                          {pos.direction}
                        </span>
                        <span className="block" style={{ color: 'var(--text-muted)' }}>
                          {pos.size_usdt} USDT · {pos.leverage}x · {pos.open_price.toFixed(2)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClosePosition(pos)}
                        disabled={loadingClose === pos.id}
                        className="px-2 py-1 text-xs font-medium rounded"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                      >
                        {loadingClose === pos.id ? '…' : 'Закрыть'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom panel — Bitget-style: Открытые ордера, Позиции, История ордеров, … */}
      <div
        className="shrink-0 border-t flex flex-col min-h-0"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)', maxHeight: '220px' }}
      >
        <div className="flex border-b shrink-0 overflow-x-auto custom-scrollbar" style={{ borderColor: 'var(--border)' }}>
          {BOTTOM_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setBottomTab(t)}
              className="px-3 py-2 text-[11px] font-medium whitespace-nowrap"
              style={{
                color: bottomTab === t ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: bottomTab === t ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {t === 'orders' ? `Открытые ордера (0)` : t === 'positions' ? `Позиции (${positions.open.length})` : t === 'orderHistory' ? 'История ордеров' : t === 'tradeHistory' ? 'История торговли' : t === 'assets' ? 'Активы' : t === 'loans' ? 'Займы' : t === 'tools' ? 'Инструменты' : 'P&L'}
            </button>
          ))}
        </div>
        <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <select className="input-field py-1 px-2 text-[11px] rounded" defaultValue="all">
            <option value="all">Все рынки</option>
          </select>
          <select className="input-field py-1 px-2 text-[11px] rounded" defaultValue="all">
            <option value="all">Все инструменты</option>
          </select>
        </div>
        <div className="flex-1 overflow-auto custom-scrollbar min-h-0">
          {bottomTab === 'positions' && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr style={{ color: 'var(--text-muted)', background: 'var(--bg)' }}>
                    <th className="text-left px-2 py-1.5 font-medium">Контракты</th>
                    <th className="text-right px-2 py-1.5 font-medium">К-во</th>
                    <th className="text-right px-2 py-1.5 font-medium">Стоим.</th>
                    <th className="text-right px-2 py-1.5 font-medium">Цена входа</th>
                    <th className="text-right px-2 py-1.5 font-medium">Цена маркировки</th>
                    <th className="text-right px-2 py-1.5 font-medium">Цена ликвид.</th>
                    <th className="text-right px-2 py-1.5 font-medium">Нереализ.</th>
                    <th className="text-right px-2 py-1.5 font-medium">Закрыть</th>
                  </tr>
                </thead>
                <tbody style={{ color: 'var(--text-secondary)' }}>
                  {positions.open.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-2 py-4 text-center" style={{ color: 'var(--text-muted)' }}>Нет открытых позиций</td>
                    </tr>
                  ) : (
                    positions.open.map((pos) => {
                      const markPrice = lastPrice;
                      const pnl = pos.direction === 'LONG'
                        ? (markPrice - pos.open_price) * (pos.size_usdt / pos.open_price)
                        : (pos.open_price - markPrice) * (pos.size_usdt / pos.open_price);
                      const liqPrice = pos.direction === 'LONG'
                        ? pos.open_price * (1 - 1 / pos.leverage)
                        : pos.open_price * (1 + 1 / pos.leverage);
                      return (
                        <tr key={pos.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-2 py-1.5">
                            <span className="font-medium">{pos.symbol}</span>
                            <span style={{ color: pos.direction === 'LONG' ? 'var(--success)' : 'var(--danger)', marginLeft: 4 }}>{pos.direction}</span>
                          </td>
                          <td className="text-right px-2 py-1.5 font-mono tabular-nums">{(pos.size_usdt / pos.open_price).toFixed(4)}</td>
                          <td className="text-right px-2 py-1.5 font-mono tabular-nums">{pos.size_usdt.toFixed(2)}</td>
                          <td className="text-right px-2 py-1.5 font-mono tabular-nums">{pos.open_price.toFixed(2)}</td>
                          <td className="text-right px-2 py-1.5 font-mono tabular-nums">{markPrice > 0 ? markPrice.toFixed(2) : '—'}</td>
                          <td className="text-right px-2 py-1.5 font-mono tabular-nums">{liqPrice.toFixed(2)}</td>
                          <td className="text-right px-2 py-1.5 font-mono tabular-nums" style={{ color: pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{pnl.toFixed(2)}</td>
                          <td className="text-right px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => handleClosePosition(pos)}
                              disabled={loadingClose === pos.id}
                              className="px-1.5 py-0.5 text-[10px] font-medium rounded"
                              style={{ background: 'var(--accent)', color: '#fff' }}
                            >
                              {loadingClose === pos.id ? '…' : 'Закрыть'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
          {bottomTab !== 'positions' && (
            <div className="px-2 py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              {bottomTab === 'orders' && 'Нет открытых ордеров'}
              {bottomTab === 'orderHistory' && 'История ордеров пуста'}
              {bottomTab === 'tradeHistory' && 'История торговли пуста'}
              {bottomTab === 'assets' && 'Активы'}
              {bottomTab === 'loans' && 'Займы'}
              {bottomTab === 'tools' && 'Инструменты'}
              {bottomTab === 'pnl' && 'P&L'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
