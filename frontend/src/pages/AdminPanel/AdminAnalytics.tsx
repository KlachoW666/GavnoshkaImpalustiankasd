import { useState, useEffect, useMemo } from 'react';
import { adminApi } from '../../utils/adminApi';
import { formatNum4, formatNum4Signed } from '../../utils/formatNum';
import { useTableSort } from '../../utils/useTableSort';
import { SortableTh } from '../../components/SortableTh';

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

  const load = async (isInitial: boolean) => {
    if (isInitial) setLoading(true);
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
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), 15000);
    return () => clearInterval(id);
  }, []);

  const tradesCompare = useMemo(() => ({
    pair: (a: TradeRow, b: TradeRow) => (a.pair || '').localeCompare(b.pair || ''),
    direction: (a: TradeRow, b: TradeRow) => (a.direction || '').localeCompare(b.direction || ''),
    openPrice: (a: TradeRow, b: TradeRow) => (a.openPrice ?? 0) - (b.openPrice ?? 0),
    closePrice: (a: TradeRow, b: TradeRow) => (a.closePrice ?? 0) - (b.closePrice ?? 0),
    pnl: (a: TradeRow, b: TradeRow) => (a.pnl ?? 0) - (b.pnl ?? 0),
    closeTime: (a: TradeRow, b: TradeRow) => new Date(a.closeTime || 0).getTime() - new Date(b.closeTime || 0).getTime()
  }), []);
  const { sortedItems: sortedTrades, sortKey, sortDir, toggleSort } = useTableSort(trades, tradesCompare, 'closeTime', 'desc');

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
            { label: 'Всего сделок', value: formatNum4(a.totalTrades), color: 'var(--text-primary)' },
            { label: 'Win Rate', value: `${formatNum4(a.winRate)}%`, color: 'var(--accent)' },
            { label: 'Прибыльных', value: formatNum4Signed(a.wins), color: 'var(--success)' },
            { label: 'Убыточных', value: `-${formatNum4(a.losses)}`, color: 'var(--danger)' },
            { label: 'Total PnL', value: formatNum4Signed(a.totalPnl), color: a.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' },
            { label: 'Profit Factor', value: formatNum4(a.profitFactor), color: 'var(--text-primary)' },
            { label: 'Лучшая сделка', value: formatNum4Signed(a.bestTrade), color: 'var(--success)' },
            { label: 'Худшая сделка', value: formatNum4Signed(a.worstTrade), color: 'var(--danger)' }
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
              <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
                <SortableTh label="Пара" sortKey="pair" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Направление" sortKey="direction" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Вход" sortKey="openPrice" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="Выход" sortKey="closePrice" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="P&L" sortKey="pnl" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="Время закрытия" sortKey="closeTime" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedTrades.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center" style={{ color: 'var(--text-muted)' }}>Нет закрытых сделок</td></tr>
              ) : (
                sortedTrades.map((row) => (
                  <tr key={row.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2 px-2">{row.pair}</td>
                    <td className="py-2 px-2">{row.direction}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{row.openPrice?.toFixed(4) ?? '—'}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{row.closePrice != null ? row.closePrice.toFixed(4) : '—'}</td>
                    <td className={`text-right py-2 px-2 tabular-nums ${(row.pnl ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {row.pnl != null ? formatNum4Signed(row.pnl) : '—'}
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
