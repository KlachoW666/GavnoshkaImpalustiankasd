import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData } from 'lightweight-charts';
import { OHLCVCandle } from '../types/signal';
import { fetchPrice, normSymbol } from '../utils/fetchPrice';
import { getSettings, updateSettings } from '../store/settingsStore';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';

const API = '/api';
const PLATFORMS = [{ id: 'bitget', label: 'Bitget', exchange: 'bitget' }];
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

const TF_SECONDS: Record<string, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400
};

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

const OB_ROWS = 4;

/** Стакан с фиксированным числом строк и ключами по индексу — не прыгает при обновлении */
function StableOrderbookList({
  bids,
  asks,
  className = ''
}: {
  bids: [number, number][];
  asks: [number, number][];
  className?: string;
}) {
  const askRows = [...(asks || [])].reverse().slice(0, OB_ROWS);
  const bidRows = (bids || []).slice(0, OB_ROWS);

  return (
    <div className={`text-sm font-mono ${className}`}>
      <div className="text-[10px] uppercase tracking-wider py-1.5" style={{ color: 'var(--danger)' }}>ПРОДАЖИ (ASK)</div>
      <div className="space-y-0">
        {Array.from({ length: OB_ROWS }, (_, i) => {
          const row = askRows[i];
          return (
            <div
              key={`ask-${i}`}
              className="flex justify-between items-center gap-3 py-1 h-7 box-border"
              style={{ color: 'var(--danger)', minHeight: '28px' }}
            >
              <span className="min-w-0 flex-1 truncate">
                {row ? Number(row[0]).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </span>
              <span className="text-right min-w-[4rem] shrink-0" style={{ color: 'var(--text-muted)' }}>
                {row ? Number(row[1]).toFixed(4) : '—'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="border-t py-2 my-1 font-bold text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--warning)' }}>Спред</div>
      <div className="text-[10px] uppercase tracking-wider py-1.5" style={{ color: 'var(--success)' }}>ПОКУПКИ (BID)</div>
      <div className="space-y-0">
        {Array.from({ length: OB_ROWS }, (_, i) => {
          const row = bidRows[i];
          return (
            <div
              key={`bid-${i}`}
              className="flex justify-between items-center gap-3 py-1 h-7 box-border"
              style={{ color: 'var(--success)', minHeight: '28px' }}
            >
              <span className="min-w-0 flex-1 truncate">
                {row ? Number(row[0]).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </span>
              <span className="text-right min-w-[4rem] shrink-0" style={{ color: 'var(--text-muted)' }}>
                {row ? Number(row[1]).toFixed(4) : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderbookDepthChart({ bids, asks }: { bids: [number, number][]; asks: [number, number][] }) {
  const askRows = [...(asks || [])].reverse().slice(0, OB_ROWS);
  const bidRows = (bids || []).slice(0, OB_ROWS);
  const maxVol = Math.max(
    ...askRows.map(([, a]) => a),
    ...bidRows.map(([, a]) => a),
    0.001
  );
  return (
    <div className="space-y-1 text-xs font-mono px-1">
      <div className="text-[10px] uppercase tracking-wider py-1" style={{ color: 'var(--danger)' }}>Ask</div>
      {Array.from({ length: OB_ROWS }, (_, i) => {
        const row = askRows[i];
        const [price, amt] = row ?? [0, 0];
        const pct = row ? Math.min(100, (amt / maxVol) * 100) : 0;
        return (
          <div key={`ask-${i}`} className="flex items-center gap-3 py-0.5 h-6" style={{ minHeight: '24px' }}>
            <div className="min-w-[4.5rem] flex-shrink-0" style={{ color: 'var(--danger)' }}>
              {row ? Number(price).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—'}
            </div>
            <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
              <div
                className="h-full rounded transition-[width] duration-150"
                style={{ width: `${pct}%`, background: 'var(--danger)', opacity: 0.7 }}
              />
            </div>
            <span className="min-w-[3.5rem] text-right text-[var(--text-muted)]">
              {row ? Number(amt).toFixed(2) : '—'}
            </span>
          </div>
        );
      })}
      <div className="border-t py-2 my-1 font-bold text-center text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--warning)' }}>Спред</div>
      <div className="text-[10px] uppercase tracking-wider py-1" style={{ color: 'var(--success)' }}>Bid</div>
      {Array.from({ length: OB_ROWS }, (_, i) => {
        const row = bidRows[i];
        const [price, amt] = row ?? [0, 0];
        const pct = row ? Math.min(100, (amt / maxVol) * 100) : 0;
        return (
          <div key={`bid-${i}`} className="flex items-center gap-3 py-0.5 h-6" style={{ minHeight: '24px' }}>
            <div className="min-w-[4.5rem] flex-shrink-0" style={{ color: 'var(--primary)' }}>
              {row ? Number(price).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) : '—'}
            </div>
            <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
              <div
                className="h-full rounded transition-[width] duration-150"
                style={{ width: `${pct}%`, background: 'var(--success)', opacity: 0.7 }}
              />
            </div>
            <span className="min-w-[3.5rem] text-right text-[var(--text-muted)]">
              {row ? Number(amt).toFixed(2) : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ChartView() {
  const { navigateTo } = useNavigation();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lastCandleTimeRef = useRef<number | null>(null);
  const lastHaOpenRef = useRef<number | null>(null);
  const lastHaCloseRef = useRef<number | null>(null);
  const [platform, setPlatform] = useState('bitget');
  const initialSymbol = (() => {
    if (typeof window === 'undefined') return 'BTC-USDT';
    const q = new URLSearchParams(window.location.search);
    const s = q.get('symbol')?.trim();
    return s && /^[A-Z0-9\-/]+$/i.test(s) ? s.replace(/\//g, '-') : 'BTC-USDT';
  })();
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState('5m');
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [orderbook, setOrderbook] = useState<{ bids: [number, number][]; asks: [number, number][] } | null>(null);
  const orderbookSigRef = useRef<string>('');
  const orderbookPendingRef = useRef<{ bids: [number, number][]; asks: [number, number][] } | null>(null);
  const orderbookTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushOrderbook = () => {
    if (orderbookTimerRef.current) {
      clearTimeout(orderbookTimerRef.current);
      orderbookTimerRef.current = null;
    }
    const pending = orderbookPendingRef.current;
    if (pending != null) {
      orderbookPendingRef.current = null;
      setOrderbook(pending);
    }
  };

  const scheduleOrderbookUpdate = (data: { bids: [number, number][]; asks: [number, number][] }) => {
    orderbookPendingRef.current = data;
    if (orderbookTimerRef.current) return;
    orderbookTimerRef.current = setTimeout(flushOrderbook, 180);
  };

  useEffect(() => {
    return () => {
      if (orderbookTimerRef.current) {
        clearTimeout(orderbookTimerRef.current);
        orderbookTimerRef.current = null;
      }
    };
  }, []);

  const displaySettings = getSettings().display;
  const orderbookView: 'list' | 'depth' = displaySettings.orderbookStyle === 'heatmap' ? 'depth' : 'list';
  const [trades, setTrades] = useState<{ price: number; amount: number; time: number; isBuy: boolean }[]>([]);
  const [lastSignal, setLastSignal] = useState<any>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [lastCandle, setLastCandle] = useState<OHLCVCandle | null>(null);

  const exchangeId = 'bitget';
  const { token } = useAuth();
  const chartStyle = displaySettings.chartStyle;

  useEffect(() => {
    if (!chartRef.current) return;
    const el = chartRef.current;
    const chart = createChart(el, {
      layout: { background: { color: '#000' }, textColor: '#71757A' },
      grid: { vertLines: { color: '#1E2023' }, horzLines: { color: '#1E2023' } },
      rightPriceScale: { scaleMargins: { top: 0.05, bottom: 0.15 }, borderColor: '#25282C' },
      timeScale: {
        visible: true,
        rightOffset: 12,
        timeVisible: true,
        borderColor: '#25282C'
      },
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

    const resize = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) chart.resize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          requestAnimationFrame(() => {
            requestAnimationFrame(resize);
          });
        }
      },
      { threshold: 0.01 }
    );
    io.observe(el);
    resize();

    return () => {
      io.disconnect();
      ro.disconnect();
      chart.remove();
      chartInstance.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
    };
  }, [chartStyle]);

  const loadCandles = (isInitial: boolean) => {
    const sym = normSymbol(symbol) || symbol.replace(/_/g, '-');
    const style = getSettings().display.chartStyle;
    const isLine = style === 'line';
    fetch(`${API}/market/candles/${encodeURIComponent(sym)}?timeframe=${timeframe}&limit=200&exchange=${exchangeId}`)
      .then((r) => r.json())
      .then((data) => {
        const candles = Array.isArray(data) ? data : [];
        if (!candles.length || !seriesRef.current) return;
        const last = candles[candles.length - 1] as OHLCVCandle;
        setLastCandle(last);
        const volData: HistogramData[] = candles.map((c: OHLCVCandle) => ({
          time: toChartTime(c.timestamp, timeframe) as any,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(76,175,80,0.5)' : 'rgba(255,82,82,0.5)'
        }));
        if (isLine) {
          const lineData = candles.map((c: OHLCVCandle) => ({
            time: toChartTime(c.timestamp, timeframe) as any,
            value: c.close
          }));
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
            style === 'heikin-ashi'
              ? ohlcToHeikinAshi(candles, timeframe)
              : candles.map((c: OHLCVCandle) => ({
                  time: toChartTime(c.timestamp, timeframe) as any,
                  open: c.open,
                  high: c.high,
                  low: c.low,
                  close: c.close
                }));
          if (isInitial || lastCandleTimeRef.current === null) {
            seriesRef.current.setData(candleData);
            volumeRef.current?.setData(volData);
            if (isInitial) chartInstance.current?.timeScale().fitContent();
            lastCandleTimeRef.current = candleData.length ? (candleData[candleData.length - 1].time as number) : null;
            if (style === 'heikin-ashi' && candleData.length) {
              const last = candleData[candleData.length - 1];
              lastHaOpenRef.current = last.open;
              lastHaCloseRef.current = last.close;
            } else {
              lastHaOpenRef.current = null;
              lastHaCloseRef.current = null;
            }
          } else {
            const last = candleData[candleData.length - 1];
            const lastVol = volData[volData.length - 1];
            if (last && lastVol) {
              seriesRef.current.update(last);
              volumeRef.current?.update(lastVol);
              lastCandleTimeRef.current = last.time as number;
              if (style === 'heikin-ashi') {
                lastHaOpenRef.current = last.open;
                lastHaCloseRef.current = last.close;
              }
            }
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    setLoading(true);
    setLastCandle(null);
    lastCandleTimeRef.current = null;
    loadCandles(true);
    const t = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(t);
  }, [symbol, timeframe, platform]);

  useEffect(() => {
    if (!live) return;
    const interval =
      TF_SECONDS[timeframe] && TF_SECONDS[timeframe] <= 300
        ? 1000
        : TF_SECONDS[timeframe] && TF_SECONDS[timeframe] <= 3600
          ? 2000
          : 3000;
    const id = setInterval(() => loadCandles(false), interval);
    return () => clearInterval(id);
  }, [symbol, timeframe, live, platform]);

  useEffect(() => {
    if (!live) return;
    const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
    const ws = new WebSocket(wsUrl);
    const sym = symbol.replace(/_/g, '-');
    ws.onopen = () => {
      if (token) ws.send(JSON.stringify({ type: 'auth', token }));
      ws.send(JSON.stringify({ type: 'subscribe_candle', symbol: sym, timeframe }));
      ws.send(JSON.stringify({ type: 'subscribe_market', symbol: sym }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'candle' && msg.data && seriesRef.current) {
          const c = msg.data;
          const time = toChartTime(c.timestamp || c.t || 0, timeframe);
          if (time !== null && time !== undefined) {
            const chartStyleNow = getSettings().display.chartStyle;
            if (chartStyleNow === 'line') {
              (seriesRef.current as any).update({ time: time as any, value: c.close });
            } else if (chartStyleNow === 'heikin-ashi') {
              const prevHaOpen = lastHaOpenRef.current ?? (c.open + c.close) / 2;
              const prevHaClose = lastHaCloseRef.current ?? (c.open + c.high + c.low + c.close) / 4;
              const haClose = (c.open + c.high + c.low + c.close) / 4;
              const haOpen = (prevHaOpen + prevHaClose) / 2;
              const haHigh = Math.max(c.high, haOpen, haClose);
              const haLow = Math.min(c.low, haOpen, haClose);
              seriesRef.current.update({ time: time as any, open: haOpen, high: haHigh, low: haLow, close: haClose });
              lastHaOpenRef.current = haOpen;
              lastHaCloseRef.current = haClose;
            } else {
              seriesRef.current.update({
                time: time as any,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close
              });
            }
            volumeRef.current?.update({
              time: time as any,
              value: c.volume || 0,
              color: c.close >= c.open ? 'rgba(76,175,80,0.5)' : 'rgba(255,82,82,0.5)'
            });
          }
        } else if (msg.type === 'orderbook' && msg.data) {
          const data = msg.data as { bids?: [number, number][]; asks?: [number, number][] };
          const topBid = data.bids?.[0]?.[0] ?? 0;
          const topAsk = data.asks?.[0]?.[0] ?? 0;
          const sig = `${topBid}-${topAsk}-${(data.bids?.length ?? 0)}-${(data.asks?.length ?? 0)}`;
          if (sig !== orderbookSigRef.current) {
            orderbookSigRef.current = sig;
            scheduleOrderbookUpdate({ bids: data.bids ?? [], asks: data.asks ?? [] });
          }
        }
        else if (msg.type === 'trade' && msg.data) setTrades((prev) => [{ ...msg.data }, ...prev.slice(0, 29)]);
        else if (msg.type === 'signal') setLastSignal(msg.data);
      } catch {}
    };
    return () => {
      try {
        ws.send(JSON.stringify({ type: 'unsubscribe_candle', symbol: sym, timeframe }));
        ws.send(JSON.stringify({ type: 'unsubscribe_market' }));
      } catch {}
      ws.close();
    };
  }, [symbol, timeframe, live, token]);

  useEffect(() => {
    const sym = normSymbol(symbol) || symbol.replace(/_/g, '-');
    if (!sym) return;
    const applyOrderbook = (data: { bids?: [number, number][]; asks?: [number, number][] } | null) => {
      if (!data?.bids?.length && !data?.asks?.length) {
        orderbookPendingRef.current = null;
        if (orderbookTimerRef.current) {
          clearTimeout(orderbookTimerRef.current);
          orderbookTimerRef.current = null;
        }
        setOrderbook(null);
        orderbookSigRef.current = '';
        return;
      }
      const topBid = data.bids?.[0]?.[0] ?? 0;
      const topAsk = data.asks?.[0]?.[0] ?? 0;
      const sig = `${topBid}-${topAsk}-${(data.bids?.length ?? 0)}-${(data.asks?.length ?? 0)}`;
      if (sig !== orderbookSigRef.current) {
        orderbookSigRef.current = sig;
        scheduleOrderbookUpdate({ bids: data.bids ?? [], asks: data.asks ?? [] });
      }
    };
    fetch(`${API}/market/orderbook/${encodeURIComponent(sym)}?limit=15&exchange=${exchangeId}`)
      .then((r) => r.json())
      .then(applyOrderbook)
      .catch(() => setOrderbook(null));
    const tid = setInterval(() => {
      fetch(`${API}/market/orderbook/${encodeURIComponent(sym)}?limit=15&exchange=${exchangeId}`)
        .then((r) => r.json())
        .then(applyOrderbook)
        .catch(() => {});
    }, live ? 1000 : 5000);
    return () => clearInterval(tid);
  }, [symbol, live, platform]);

  useEffect(() => {
    setTrades([]);
  }, [symbol, platform]);

  useEffect(() => {
    const sym = normSymbol(symbol) || symbol.replace(/_/g, '-');
    if (!sym) return;
    let cancelled = false;
    const load = () => fetchPrice(sym).then((p) => !cancelled && p != null && setCurrentPrice(p));
    load();
    const id = live ? setInterval(load, 2000) : undefined;
    return () => { cancelled = true; if (id) clearInterval(id); };
  }, [symbol, live]);

  useEffect(() => {
    if (!live) return;
    const sym = normSymbol(symbol) || symbol.replace(/_/g, '-');
    const loadTrades = () => {
      fetch(`${API}/market/trades/${encodeURIComponent(sym)}?limit=30&exchange=${exchangeId}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data) && data.length) setTrades(data);
        })
        .catch(() => {});
    };
    loadTrades();
    const tid = setInterval(loadTrades, 3000);
    return () => clearInterval(tid);
  }, [symbol, live, platform]);

  useEffect(() => {
    fetch(`${API}/signals?limit=5`)
      .then((r) => r.json())
      .then((list) => {
        const sym = symbol.replace(/-/g, '/');
        const match =
          Array.isArray(list) &&
          list.find((s: any) => s.symbol?.replace('/', '-') === symbol || s.symbol === sym);
        if (match) setLastSignal(match);
      })
      .catch(() => {});
  }, [symbol]);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 rounded-lg p-3 glass border" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: 'var(--accent)' }}>
            <path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1 className="text-sm font-bold tracking-tight">График</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.history.pushState({}, '', '/signals');
            }
            navigateTo('signals');
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--accent)' }}
        >
          Сигналы →
        </button>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col gap-4 min-h-0 overflow-hidden">
          <div className="flex flex-wrap gap-4 items-center shrink-0">
          <div className="flex rounded-[10px] overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className={`px-4 py-2 text-sm font-medium transition ${
                  platform === p.id
                    ? 'btn-primary text-white'
                    : 'rounded-[10px] px-4 py-2 text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/\s/g, ''))}
            placeholder="BTC-USDT"
            className="input-field min-w-[140px]"
          />
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="input-field w-auto"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Real-time</span>
          </label>
          {loading && <span style={{ color: 'var(--text-muted)' }}>Загрузка...</span>}
          {live && <span className="text-[var(--primary)] text-sm flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" style={{ boxShadow: '0 0 8px var(--primary)' }} /> Live</span>}
        </div>

        <div className="rounded-[14px] overflow-hidden shrink-0 card flex flex-col">
            <div className="px-4 py-2 flex flex-wrap items-center gap-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Инструмент: <strong style={{ color: 'var(--text-primary)' }}>{symbol || 'BTC-USDT'}</strong>
              </span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>•</span>
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Таймфрейм: <strong style={{ color: 'var(--text-primary)' }}>{timeframe}</strong>
              </span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>•</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{platform.toUpperCase()}</span>
              {currentPrice != null && (
                <>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>•</span>
                  <span className="text-sm font-mono" style={{ color: 'var(--primary)' }}>
                    Цена: {currentPrice.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </>
              )}
            </div>
            {lastCandle && (
              <div className="px-4 py-2 flex flex-wrap items-center gap-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>ОТКР</span>
                <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                  {Number(lastCandle.open).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>МАКС</span>
                <span className="text-sm font-mono" style={{ color: 'var(--success)' }}>
                  {Number(lastCandle.high).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>МИН</span>
                <span className="text-sm font-mono" style={{ color: 'var(--danger)' }}>
                  {Number(lastCandle.low).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>ЗАКР</span>
                <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                  {Number(lastCandle.close).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {(() => {
                  const ch = lastCandle.close - lastCandle.open;
                  const pct = lastCandle.open ? (ch / lastCandle.open) * 100 : 0;
                  const up = ch >= 0;
                  return (
                    <>
                      <span className="text-sm font-mono" style={{ color: up ? 'var(--success)' : 'var(--danger)' }}>
                        {up ? '+' : ''}{ch.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-sm font-mono" style={{ color: up ? 'var(--success)' : 'var(--danger)' }}>
                        ({up ? '+' : ''}{pct.toFixed(2)}%)
                      </span>
                    </>
                  );
                })()}
              </div>
            )}
            <div
              ref={chartRef}
              className="w-full"
              style={{ height: 'min(70vh, 620px)' }}
            />
        </div>
      </div>

      <div className="w-full lg:w-72 space-y-4 shrink-0 flex flex-col">
        <div
          className="rounded-lg p-4 shrink-0"
          style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Стакан ({platform})</h3>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => updateSettings({ display: { ...getSettings().display, orderbookStyle: 'default' } })}
                className="px-2 py-0.5 text-xs rounded-lg font-medium"
                style={orderbookView === 'list' ? { background: 'var(--accent)', color: 'white' } : { background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
              >
                Список
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ display: { ...getSettings().display, orderbookStyle: 'heatmap' } })}
                className="px-2 py-0.5 text-xs rounded-lg font-medium"
                style={orderbookView === 'depth' ? { background: 'var(--accent)', color: 'white' } : { background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
              >
                Depth
              </button>
            </div>
          </div>
          {currentPrice != null && (
            <p className="text-sm font-mono mb-3" style={{ color: 'var(--accent)' }}>
              {currentPrice.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
          <div className="overflow-hidden shrink-0" style={{ height: '300px', minHeight: '300px' }}>
            {orderbook ? (
              orderbookView === 'depth' ? (
                <div className="mt-1"><OrderbookDepthChart bids={orderbook.bids || []} asks={orderbook.asks || []} /></div>
              ) : (
                <div className="mt-1">
                  <StableOrderbookList bids={orderbook.bids || []} asks={orderbook.asks || []} />
                </div>
              )
            ) : (
              <p className="text-sm py-3" style={{ color: 'var(--text-muted)' }}>Загрузка стакана...</p>
            )}
          </div>
        </div>

        <div
          className="rounded-lg p-4 shrink-0"
          style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Сделки (Trades)</h3>
          <div className="space-y-0 text-sm font-mono">
            {trades.length ? (
              trades.slice(0, 4).map((t, i) => (
                <div key={i} className="flex justify-between items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <span className="min-w-0 flex-1" style={{ color: t.isBuy ? 'var(--success)' : 'var(--danger)' }}>
                    {t.price.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-right min-w-[3.5rem]" style={{ color: 'var(--text-muted)' }}>{t.amount.toFixed(4)}</span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {new Date(t.time).toLocaleTimeString('ru-RU', { hour12: false })}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm py-3" style={{ color: 'var(--text-muted)' }}>Ожидание сделок...</p>
            )}
          </div>
        </div>

        {lastSignal && (
          <div
            className={`rounded-lg p-4 shrink-0 border-l-4 ${lastSignal.direction === 'LONG' ? 'border-l-[var(--success)]' : 'border-l-[var(--danger)]'}`}
            style={lastSignal.direction === 'LONG' ? { background: 'var(--success-bg)' } : { background: 'var(--danger-bg)' }}
          >
            <h3 className="font-semibold mb-3">Прогноз</h3>
            <div className="text-sm space-y-2">
              <p className={lastSignal.direction === 'LONG' ? 'badge-long inline-block' : 'badge-short inline-block'}>
                {lastSignal.direction === 'LONG' ? 'ПОКУПАТЬ ↑' : 'ПРОДАВАТЬ ↓'}
              </p>
              <p className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>Вход: {lastSignal.entry_price?.toLocaleString('ru-RU')}</p>
              <p style={{ color: 'var(--danger)' }}>SL: {lastSignal.stop_loss?.toLocaleString('ru-RU')}</p>
              <p style={{ color: 'var(--success)' }}>
                TP: {lastSignal.take_profit?.map((t: number) => t.toLocaleString('ru-RU')).join(' / ')}
              </p>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
