import { useState, useEffect } from 'react';
import { adminApi } from '../../utils/adminApi';

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
}

interface TradeRow {
  id: string;
  pair: string;
  direction: string;
  openPrice: number;
  closePrice: number | null;
  pnl: number | null;
  openTime: string;
  closeTime: string | null;
}

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [a, t] = await Promise.all([
          adminApi.get<AnalyticsData>('/admin/analytics?limit=500'),
          adminApi.get<TradeRow[]>('/admin/trades/history?limit=100')
        ]);
        setAnalytics(a);
        setTrades(t);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>;
  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;

  const a = analytics!;
  const cardStyle = {
    background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  };
  const miniCardStyle = { background: 'var(--bg-hover)' };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📈</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Аналитика и отчёты</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Сводка по сделкам и история</p>
        </div>
      </div>

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-3xl">📊</span>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Сводка по сделкам</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Win Rate, PnL, Profit Factor</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Всего сделок', value: String(a.totalTrades), color: 'var(--text-primary)' },
            { label: 'Win Rate', value: `${a.winRate.toFixed(1)}%`, color: 'var(--accent)' },
            { label: 'Прибыльных', value: String(a.wins), color: 'var(--success)' },
            { label: 'Убыточных', value: String(a.losses), color: 'var(--danger)' },
            { label: 'Total PnL', value: `${a.totalPnl >= 0 ? '+' : ''}${a.totalPnl.toFixed(2)}`, color: a.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' },
            { label: 'Profit Factor', value: a.profitFactor.toFixed(2), color: 'var(--text-primary)' },
            { label: 'Лучшая сделка', value: `+${a.bestTrade.toFixed(2)}`, color: 'var(--success)' },
            { label: 'Худшая сделка', value: String(a.worstTrade.toFixed(2)), color: 'var(--danger)' }
          ].map((row) => (
            <div key={row.label} className="rounded-xl p-3 flex flex-col" style={miniCardStyle}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
              <span className="text-sm font-semibold mt-0.5 tabular-nums" style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl overflow-hidden shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
        <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-2xl">📜</span>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>История сделок</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Последние 100 закрытых</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-hover)' }}>
                <th className="text-left py-3 px-2">Пара</th>
                <th className="text-left py-3 px-2">Направление</th>
                <th className="text-right py-3 px-2">Вход</th>
                <th className="text-right py-3 px-2">Выход</th>
                <th className="text-right py-3 px-2">P&L</th>
                <th className="text-left py-3 px-2">Время закрытия</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center" style={{ color: 'var(--text-muted)' }}>Нет закрытых сделок</td></tr>
              ) : (
                trades.map((row) => (
                  <tr key={row.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2 px-2">{row.pair}</td>
                    <td className="py-2 px-2">{row.direction}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{row.openPrice?.toFixed(4) ?? '—'}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{row.closePrice != null ? row.closePrice.toFixed(4) : '—'}</td>
                    <td className={`text-right py-2 px-2 tabular-nums ${(row.pnl ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {row.pnl != null ? (row.pnl >= 0 ? '+' : '') + row.pnl.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-2 text-xs" style={{ color: 'var(--text-muted)' }}>{row.closeTime ? new Date(row.closeTime).toLocaleString('ru-RU') : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
