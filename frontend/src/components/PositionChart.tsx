import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, LineData } from 'lightweight-charts';
import { getSettings } from '../store/settingsStore';

const API = '/api';
const TF_SECONDS: Record<string, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400
};

function toChartTime(tsMs: number, tf: string): number | string {
  const sec = TF_SECONDS[tf] || 300;
  const aligned = Math.floor(tsMs / 1000 / sec) * sec;
  if (tf === '1d') {
    const d = new Date(aligned * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  return aligned;
}

interface OHLCVCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface PositionChartProps {
  symbol: string;
  timeframe?: string;
  height?: number;
  live?: boolean;
}

/** Нормализация символа для API: всегда BASE-USDT */
function chartSymbol(s: string): string {
  if (!s) return '';
  // Убираем любой суффикс USDT и слэши, затем добавляем -USDT
  const base = s.replace(/[-:\/]USDT$/i, '').replace(/\//g, '-');
  return base + '-USDT';
}

export default function PositionChart({
  symbol,
  timeframe = '5m',
  height = 200,
  live = true
}: PositionChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const loadingHistoryRef = useRef(false);
  const hasMoreHistoryRef = useRef(true);
  const rawCandlesRef = useRef<OHLCVCandle[]>([]);
  const loadCandlesRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || !symbol) return;
    const el = containerRef.current;
    const requestedSymbol = chartSymbol(symbol);
    let cancelled = false;
    const settings = getSettings();
    const chartStyle = settings.display.chartStyle;

    const chart = createChart(el, {
      layout: { background: { color: 'transparent' }, textColor: 'rgba(255,255,255,0.6)' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { scaleMargins: { top: 0.1, bottom: 0.15 }, borderVisible: false },
      timeScale: { visible: true, rightOffset: 6, borderVisible: false },
      handleScale: { axisPressedMouseMove: false },
      handleScroll: { vertTouchDrag: false }
    });

    let candlestickSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;
    if (chartStyle === 'line') {
      candlestickSeries = chart.addLineSeries({
        color: '#40DDFF',
        lineWidth: 2
      }) as any;
    } else {
      candlestickSeries = chart.addCandlestickSeries({
        upColor: '#47A663',
        downColor: '#ef4444',
        borderUpColor: '#47A663',
        borderDownColor: '#ef4444'
      });
    }
    chartRef.current = chart;
    seriesRef.current = candlestickSeries as ISeriesApi<'Candlestick'>;

    const handleRangeChange = (logicalRange: any) => {
      if (!logicalRange) return;
      if (logicalRange.from < 20 && !loadingHistoryRef.current && hasMoreHistoryRef.current) {
        const oldestCandle = rawCandlesRef.current[0];
        if (oldestCandle && loadCandlesRef.current) {
          loadCandlesRef.current(false, oldestCandle.timestamp - 1);
        }
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);

    const loadCandles = (isInitial: boolean, endTime?: number) => {
      if (endTime) loadingHistoryRef.current = true;
      const sym = requestedSymbol || chartSymbol(symbol);
      const limit = endTime ? 500 : 100;
      fetch(`${API}/market/candles/${encodeURIComponent(sym)}?timeframe=${timeframe}&limit=${limit}&exchange=bitget${endTime ? `&endTime=${endTime}` : ''}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const candles = Array.isArray(data) ? data : [];
          if (!candles.length || !seriesRef.current) {
            if (endTime) { hasMoreHistoryRef.current = false; loadingHistoryRef.current = false; }
            return;
          }

          if (endTime) {
            const firstExistingTs = rawCandlesRef.current[0]?.timestamp;
            const freshCandles = firstExistingTs ? candles.filter((c: any) => c.timestamp < firstExistingTs) : candles;
            if (freshCandles.length === 0) {
              hasMoreHistoryRef.current = false;
              loadingHistoryRef.current = false;
              return;
            }
            rawCandlesRef.current = [...freshCandles, ...rawCandlesRef.current];
          } else if (isInitial) {
            rawCandlesRef.current = candles;
            hasMoreHistoryRef.current = true;
          } else {
            const lastC = candles[candles.length - 1];
            if (lastC) {
              const existingLast = rawCandlesRef.current[rawCandlesRef.current.length - 1];
              if (existingLast && existingLast.timestamp === lastC.timestamp) {
                rawCandlesRef.current[rawCandlesRef.current.length - 1] = lastC;
              } else {
                rawCandlesRef.current.push(lastC);
              }
            }
          }

          const allCandles = rawCandlesRef.current;
          if (chartStyle === 'line') {
            const lineData: LineData[] = allCandles.map((c: OHLCVCandle) => ({
              time: toChartTime(c.timestamp, timeframe) as any,
              value: c.close
            }));
            if (isInitial || endTime) {
              (seriesRef.current as any).setData(lineData);
              if (isInitial) chart.timeScale().fitContent();
            } else {
              const last = lineData[lineData.length - 1];
              if (last) (seriesRef.current as any).update(last);
            }
          } else {
            const candleData: CandlestickData[] = allCandles.map((c: OHLCVCandle) => ({
              time: toChartTime(c.timestamp, timeframe) as any,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close
            }));
            if (isInitial || endTime) {
              seriesRef.current.setData(candleData);
              if (isInitial) chart.timeScale().fitContent();
            } else {
              const last = candleData[candleData.length - 1];
              if (last) seriesRef.current.update(last);
            }
          }
          if (endTime) loadingHistoryRef.current = false;
        })
        .catch(() => { if (endTime) loadingHistoryRef.current = false; });
    };
    loadCandlesRef.current = loadCandles;

    loadCandles(true);

    const intervalMs = TF_SECONDS[timeframe] && TF_SECONDS[timeframe] <= 300 ? 1000 : 2000;
    const intervalId = live ? setInterval(() => loadCandles(false), intervalMs) : undefined;

    let ws: WebSocket | null = null;
    if (live) {
      const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'subscribe_candle', symbol: requestedSymbol, timeframe }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'candle' && msg.data && seriesRef.current) {
            const c = msg.data;
            const time = toChartTime(c.timestamp || c.t || 0, timeframe);
            if (time != null) {
              seriesRef.current.update({
                time: time as any,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close
              });
            }
          }
        } catch { }
      };
    }

    const resize = () => {
      const w = el.offsetWidth;
      if (w > 0) chart.resize(w, height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    return () => {
      cancelled = true;
      ro.disconnect();
      if (intervalId) clearInterval(intervalId);
      if (ws) {
        try {
          ws.send(JSON.stringify({ type: 'unsubscribe_candle', symbol: requestedSymbol, timeframe }));
        } catch { }
        ws.close();
      }
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [symbol, timeframe, height, live]);

  return (
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden flex-1 min-w-0"
      style={{ height, background: 'var(--bg-elevated)' }}
    />
  );
}
