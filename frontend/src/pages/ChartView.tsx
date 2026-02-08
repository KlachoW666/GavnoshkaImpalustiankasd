import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData } from 'lightweight-charts';
import { OHLCVCandle } from '../types/signal';
import { fetchPrice, normSymbol } from '../utils/fetchPrice';

const API = '/api';
const PLATFORMS = [{ id: 'okx', label: 'OKX', exchange: 'okx' }];
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

function OrderbookDepthChart({ bids, asks }: { bids: [number, number][]; asks: [number, number][] }) {
  const bidRows = bids.slice(0, 10);
  const askRows = [...(asks || [])].reverse().slice(0, 10);
  const maxBid = Math.max(...bidRows.map(([, a]) => a), 0.001);
  const maxAsk = Math.max(...askRows.map(([, a]) => a), 0.001);
  const maxVol = Math.max(maxBid, maxAsk);
  return (
    <div className="space-y-2 text-xs font-mono px-1">
      <div className="text-[10px] uppercase tracking-wider py-1" style={{ color: 'var(--danger)' }}>Ask</div>
      {askRows.map(([price, amt], i) => (
        <div key={`a-${i}`} className="flex items-center gap-3 py-0.5">
          <div className="min-w-[4.5rem] flex-shrink-0" style={{ color: 'var(--danger)' }}>{Number(price).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</div>
          <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <div className="h-full rounded" style={{ width: `${Math.min(100, (amt / maxVol) * 100)}%`, background: 'var(--danger)', opacity: 0.7 }} />
          </div>
          <span className="min-w-[3.5rem] text-right text-[var(--text-muted)]">{Number(amt).toFixed(2)}</span>
        </div>
      ))}
      <div className="border-t py-2 my-1 font-bold text-center text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--warning)' }}>Спред</div>
      <div className="text-[10px] uppercase tracking-wider py-1" style={{ color: 'var(--success)' }}>Bid</div>
      {bidRows.map(([price, amt], i) => (
        <div key={`b-${i}`} className="flex items-center gap-3 py-0.5">
            <div className="min-w-[4.5rem] flex-shrink-0" style={{ color: 'var(--primary)' }}>{Number(price).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</div>
          <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <div className="h-full rounded" style={{ width: `${Math.min(100, (amt / maxVol) * 100)}%`, background: 'var(--success)', opacity: 0.7 }} />
          </div>
          <span className="min-w-[3.5rem] text-right text-[var(--text-muted)]">{Number(amt).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ChartView() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lastCandleTimeRef = useRef<number | null>(null);
  const [platform, setPlatform] = useState('okx');
  const [symbol, setSymbol] = useState('BTC-USDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [orderbook, setOrderbook] = useState<{ bids: [number, number][]; asks: [number, number][] } | null>(null);
  const [orderbookView, setOrderbookView] = useState<'list' | 'depth'>('list');
  const [trades, setTrades] = useState<{ price: number; amount: number; time: number; isBuy: boolean }[]>([]);
  const [lastSignal, setLastSignal] = useState<any>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  const exchangeId = 'okx';

  useEffect(() => {
    if (!chartRef.current) return;
    const el = chartRef.current;
    const chart = createChart(el, {
      layout: { background: { color: '#242424' }, textColor: 'rgba(255,255,255,0.6)' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
      rightPriceScale: { scaleMargins: { top: 0.05, bottom: 0.15 } },
      timeScale: {
        visible: true,
        rightOffset: 12
      },
      handleScale: { axisPressedMouseMove: true, pinch: true },
      handleScroll: { vertTouchDrag: true, horzTouchDrag: true }
    });
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#47A663',
      downColor: '#ef4444',
      borderUpColor: '#47A663',
      borderDownColor: '#ef4444'
    });
    candlestickSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.15 } });
    const volumeSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, borderVisible: false });
    chartInstance.current = chart;
    seriesRef.current = candlestickSeries;
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
  }, []);

  const loadCandles = (isInitial: boolean) => {
    const sym = normSymbol(symbol) || symbol.replace(/_/g, '-');
    fetch(`${API}/market/candles/${encodeURIComponent(sym)}?timeframe=${timeframe}&limit=200&exchange=${exchangeId}`)
      .then((r) => r.json())
      .then((data) => {
        const candles = Array.isArray(data) ? data : [];
        if (!candles.length || !seriesRef.current) return;
        const candleData: CandlestickData[] = candles.map((c: OHLCVCandle) => ({
          time: toChartTime(c.timestamp, timeframe) as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close
        }));
        const volData: HistogramData[] = candles.map((c: OHLCVCandle) => ({
          time: toChartTime(c.timestamp, timeframe) as any,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(76,175,80,0.5)' : 'rgba(255,82,82,0.5)'
        }));
        if (isInitial || lastCandleTimeRef.current === null) {
          seriesRef.current.setData(candleData);
          volumeRef.current?.setData(volData);
          if (isInitial) chartInstance.current?.timeScale().fitContent();
          lastCandleTimeRef.current = candleData.length ? (candleData[candleData.length - 1].time as number) : null;
        } else {
          const last = candleData[candleData.length - 1];
          const lastVol = volData[volData.length - 1];
          if (last && lastVol) {
            seriesRef.current.update(last);
            volumeRef.current?.update(lastVol);
            lastCandleTimeRef.current = last.time as number;
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    setLoading(true);
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
            seriesRef.current.update({
              time: time as any,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close
            });
            volumeRef.current?.update({
              time: time as any,
              value: c.volume || 0,
              color: c.close >= c.open ? 'rgba(76,175,80,0.5)' : 'rgba(255,82,82,0.5)'
            });
          }
        } else if (msg.type === 'orderbook' && msg.data) setOrderbook(msg.data);
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
  }, [symbol, timeframe, live]);

  useEffect(() => {
    const sym = normSymbol(symbol) || symbol.replace(/_/g, '-');
    if (!sym) return;
    fetch(`${API}/market/orderbook/${encodeURIComponent(sym)}?limit=15&exchange=${exchangeId}`)
      .then((r) => r.json())
      .then((data) => setOrderbook(data))
      .catch(() => setOrderbook(null));
    const tid = setInterval(() => {
      fetch(`${API}/market/orderbook/${encodeURIComponent(sym)}?limit=15&exchange=${exchangeId}`)
        .then((r) => r.json())
        .then((data) => setOrderbook(data))
        .catch(() => {});
    }, live ? 500 : 5000);
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
    <div className="flex gap-6 flex-col lg:flex-row h-full min-h-0 overflow-hidden max-w-[1600px] mx-auto">
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

        <div
          ref={chartRef}
          className="w-full rounded-[14px] overflow-hidden shrink-0 card"
          style={{ height: 'min(70vh, 650px)' }}
        />
      </div>

      <div className="w-full lg:w-72 space-y-4 shrink-0">
        <div className="card p-5">
          <div className="flex justify-between items-center mb-4 px-1">
            <div>
              <h3 className="font-semibold">Стакан ({platform})</h3>
              {currentPrice != null && (
                <p className="text-sm mt-0.5 font-mono" style={{ color: 'var(--primary)' }}>
                  {currentPrice.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setOrderbookView('list')}
                className={`px-2 py-0.5 text-xs rounded-[10px] ${orderbookView === 'list' ? 'text-white' : ''}`}
                style={orderbookView === 'list' ? { background: 'var(--gradient-cyan)' } : { color: 'var(--text-muted)' }}
              >
                Список
              </button>
              <button
                type="button"
                onClick={() => setOrderbookView('depth')}
                className={`px-2 py-0.5 text-xs rounded-[10px] ${orderbookView === 'depth' ? 'text-white' : ''}`}
                style={orderbookView === 'depth' ? { background: 'var(--gradient-cyan)' } : { color: 'var(--text-muted)' }}
              >
                Depth
              </button>
            </div>
          </div>
          {orderbook ? (
            orderbookView === 'depth' ? (
              <div className="mt-2"><OrderbookDepthChart bids={orderbook.bids || []} asks={orderbook.asks || []} /></div>
            ) : (
              <div className="space-y-2 text-sm font-mono mt-2 px-1">
                <div className="text-xs mb-2 uppercase tracking-wider py-1" style={{ color: 'var(--danger)' }}>Продажи (Ask)</div>
                {orderbook.asks?.slice(0, 8).reverse().map(([price, amt], i) => (
                  <div key={i} className="flex justify-between items-center py-0.5 gap-4" style={{ color: 'var(--danger)' }}>
                    <span className="min-w-0 flex-1">{Number(price).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</span>
                    <span className="text-right min-w-[4rem]" style={{ color: 'var(--text-muted)' }}>{Number(amt).toFixed(4)}</span>
                  </div>
                ))}
                <div className="border-t my-3 pt-3 font-bold text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--warning)' }}>Спред</div>
                <div className="text-xs mb-2 uppercase tracking-wider py-1" style={{ color: 'var(--success)' }}>Покупки (Bid)</div>
                {orderbook.bids?.slice(0, 8).map(([price, amt], i) => (
                  <div key={i} className="flex justify-between items-center py-0.5 gap-4" style={{ color: 'var(--success)' }}>
                    <span className="min-w-0 flex-1">{Number(price).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</span>
                    <span className="text-right min-w-[4rem]" style={{ color: 'var(--text-muted)' }}>{Number(amt).toFixed(4)}</span>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Загрузка стакана...</p>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold mb-4">Сделки (Trades)</h3>
          <div className="space-y-1 text-sm font-mono max-h-48 overflow-y-auto px-1">
            {trades.length ? (
              trades.slice(0, 15).map((t, i) => (
                <div key={i} className="flex justify-between items-center gap-4 py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
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
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Ожидание сделок...</p>
            )}
          </div>
        </div>

        {lastSignal && (
          <div
            className={`card p-5 border-l-4 ${lastSignal.direction === 'LONG' ? 'border-l-[var(--success)]' : 'border-l-[var(--danger)]'}`}
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
  );
}
