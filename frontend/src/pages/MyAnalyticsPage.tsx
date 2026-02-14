/**
 * «Моя аналитика» — сводка по сделкам текущего пользователя (аналог Admin Analytics).
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { formatNum4, formatNum4Signed } from '../utils/formatNum';

interface EquityPoint {
  date: string;
  pnl: number;
  cumulative: number;
}

interface DayRow {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
}

interface PairRow {
  pair: string;
  pnl: number;
  trades: number;
}

interface AnalyticsData {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  equityCurve?: EquityPoint[];
  maxDrawdownUsdt?: number;
  maxDrawdownPct?: number;
  sharpeRatio?: number;
  sortinoRatio?: number;
  byDay?: DayRow[];
  avgHoldTimeMinutes?: number;
  pairCorrelation?: PairRow[];
}

export default function MyAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [alerts, setAlerts] = useState<Array<{ type: string; message: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (isInitial: boolean) => {
    if (isInitial) setLoading(true);
    try {
      const a = await api.get<AnalyticsData>('/auth/me/analytics?limit=500');
      setAnalytics(a);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setAnalytics(null);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), 30000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>;
  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;

  const a = analytics!;
  const cardStyle = {
    background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  };
  const miniCardStyle = { background: 'var(--bg-hover)' };

  const curve = a.equityCurve ?? [];
  const curveMin = curve.length ? Math.min(...curve.map((p) => p.cumulative)) : 0;
  const curveMax = curve.length ? Math.max(...curve.map((p) => p.cumulative)) : 1;
  const curveRange = curveMax - curveMin || 1;
  const w = 600;
  const h = 120;
  const pad = { top: 8, right: 8, bottom: 8, left: 8 };
  const pathD = curve
    .map((p, i) => {
      const x = pad.left + (i / Math.max(1, curve.length - 1)) * (w - pad.left - pad.right);
      const y = h - pad.bottom - ((p.cumulative - curveMin) / curveRange) * (h - pad.top - pad.bottom);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const metrics = [
    { label: 'Всего сделок', value: formatNum4(a.totalTrades), color: 'var(--text-primary)' },
    { label: 'Win Rate', value: `${formatNum4(a.winRate)}%`, color: 'var(--accent)' },
    { label: 'Прибыльных', value: formatNum4Signed(a.wins), color: 'var(--success)' },
    { label: 'Убыточных', value: `-${formatNum4(a.losses)}`, color: 'var(--danger)' },
    { label: 'Total PnL', value: formatNum4Signed(a.totalPnl), color: a.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' },
    { label: 'Profit Factor', value: formatNum4(a.profitFactor), color: 'var(--text-primary)' },
    { label: 'Лучшая сделка', value: formatNum4Signed(a.bestTrade), color: 'var(--success)' },
    { label: 'Худшая сделка', value: formatNum4Signed(a.worstTrade), color: 'var(--danger)' },
    ...(a.maxDrawdownUsdt != null ? [{ label: 'Max Drawdown', value: `$${a.maxDrawdownUsdt.toFixed(2)} (${(a.maxDrawdownPct ?? 0).toFixed(1)}%)`, color: 'var(--danger)' }] : []),
    ...(a.sharpeRatio != null ? [{ label: 'Sharpe Ratio', value: formatNum4(a.sharpeRatio), color: 'var(--text-primary)' }] : []),
    ...(a.sortinoRatio != null ? [{ label: 'Sortino Ratio', value: formatNum4(a.sortinoRatio), color: 'var(--text-primary)' }] : []),
    ...(a.avgHoldTimeMinutes != null ? [{ label: 'Ср. время в поз.', value: a.avgHoldTimeMinutes >= 60 ? `${Math.floor(a.avgHoldTimeMinutes / 60)}ч ${a.avgHoldTimeMinutes % 60}м` : `${a.avgHoldTimeMinutes} мин`, color: 'var(--text-muted)' }] : [])
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {alerts.length > 0 && (
        <div className="rounded-xl p-4 border" style={{ background: 'var(--danger)', borderColor: 'rgba(255,255,255,0.3)', color: 'white' }}>
          <p className="font-semibold">⚠️ Алерты</p>
          <ul className="mt-1 list-disc list-inside text-sm">
            {alerts.map((a, i) => (
              <li key={i}>{a.message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-2xl">📈</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Моя аналитика</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Сводка по вашим сделкам</p>
        </div>
      </div>

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-3xl">📊</span>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Сводка</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Win Rate, PnL, Profit Factor, Max Drawdown, Sharpe, Sortino</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {metrics.map((row) => (
            <div key={row.label} className="rounded-xl p-3 flex flex-col" style={miniCardStyle}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
              <span className="text-sm font-semibold mt-0.5 tabular-nums" style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>
      </section>

      {curve.length > 0 && (
        <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Кривая эквити</h3>
          <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="max-h-40">
            <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </section>
      )}

      {(a.pairCorrelation ?? []).length > 0 && (
        <section className="rounded-2xl overflow-hidden shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--warning)' }}>
          <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="text-2xl">🔗</span>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Корреляция по парам</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>PnL и количество сделок на пару</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
                  <th className="py-2 px-2 text-left">Пара</th>
                  <th className="py-2 px-2 text-right">P&L</th>
                  <th className="py-2 px-2 text-right">Сделок</th>
                </tr>
              </thead>
              <tbody>
                {a.pairCorrelation!.map((row) => (
                  <tr key={row.pair} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2 px-2">{row.pair}</td>
                    <td className={`py-2 px-2 text-right tabular-nums ${row.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {formatNum4Signed(row.pnl)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{row.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(a.byDay ?? []).length > 0 && (
        <section className="rounded-2xl overflow-hidden shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--warning)' }}>
          <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="text-2xl">📅</span>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Разбивка по дням</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Последние 30 дней</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
                  <th className="py-2 px-2 text-left">Дата</th>
                  <th className="py-2 px-2 text-right">P&L</th>
                  <th className="py-2 px-2 text-right">Сделок</th>
                  <th className="py-2 px-2 text-right">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {a.byDay!.map((row) => (
                  <tr key={row.date} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2 px-2">{row.date}</td>
                    <td className={`py-2 px-2 text-right tabular-nums ${row.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {formatNum4Signed(row.pnl)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{row.trades}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{row.winRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {a.totalTrades === 0 && (
        <p className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
          Пока нет закрытых сделок. Аналитика появится после первых операций.
        </p>
      )}
    </div>
  );
}
