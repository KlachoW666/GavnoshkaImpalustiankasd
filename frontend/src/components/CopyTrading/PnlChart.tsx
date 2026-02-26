import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { api } from '../../utils/api';

interface PnlData {
    time: string;
    value: number;
}

export default function PnlChart({ token }: { token: string }) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [chart, setChart] = useState<IChartApi | null>(null);
    const [series, setSeries] = useState<ISeriesApi<"Area"> | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const newChart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#9ca3af',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderVisible: false,
            },
            rightPriceScale: {
                borderVisible: false,
            },
            height: 300,
            autoSize: true,
        });

        const newSeries = newChart.addAreaSeries({
            lineColor: '#EF4444',
            topColor: 'rgba(239, 68, 68, 0.4)',
            bottomColor: 'rgba(239, 68, 68, 0.0)',
            lineWidth: 2,
        });

        setChart(newChart);
        setSeries(newSeries);

        return () => {
            newChart.remove();
        };
    }, []);

    useEffect(() => {
        if (!series || !token) return;

        setLoading(true);
        api.get<{ history: PnlData[] }>('/copy-trading-api/pnl-history', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => {
                if (res.history && res.history.length > 0) {
                    series.setData(res.history);
                    if (chart) {
                        chart.timeScale().fitContent();
                    }
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [series, token, chart]);

    return (
        <div className="relative w-full rounded-2xl overflow-hidden p-6" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Окупаемость инвестиций (PnL)</h2>
            {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 rounded-2xl">
                    <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                </div>
            )}
            <div ref={chartContainerRef} className="w-full h-[300px]" />
        </div>
    );
}
