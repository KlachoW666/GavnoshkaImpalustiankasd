import { useState, useEffect, useMemo, useCallback } from 'react';
import { adminApi } from '../../utils/adminApi';
import { formatNum4, formatNum4Signed } from '../../utils/formatNum';
import { useTableSort } from '../../utils/useTableSort';
import { SortableTh } from '../../components/SortableTh';

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
  clientId?: string;
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

interface UserOption {
  id: string;
  username: string;
}

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (isInitial: boolean) => {
    if (isInitial) setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (selectedClientId) params.set('clientId', selectedClientId);
      const [a, t, u] = await Promise.all([
        adminApi.get<AnalyticsData>(`/admin/analytics?${params}`),
        adminApi.get<TradeRow[]>(`/admin/trades/history?limit=100${selectedClientId ? `&clientId=${encodeURIComponent(selectedClientId)}` : ''}`),
        adminApi.get<UserOption[]>('/admin/users').catch(() => [])
      ]);
      setAnalytics(a);
      setTrades(t);
      setUsers(Array.isArray(u) ? u : []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [selectedClientId]);

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), 15000);
    return () => clearInterval(id);
  }, [load]);

  const [exportSince, setExportSince] = useState('');
  const [exportUntil, setExportUntil] = useState('');
  const exportCsv = async () => {
    const params = new URLSearchParams({ limit: '5000' });
    if (selectedClientId) params.set('clientId', selectedClientId);
    if (exportSince) params.set('since', exportSince);
    if (exportUntil) params.set('until', exportUntil);
    const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || '/api';
    const { getAdminToken } = await import('../../utils/adminApi');
    const token = getAdminToken();
    const res = await fetch(`${API_BASE}/admin/analytics/export?${params}`, {
      headers: token ? { 'X-Admin-Token': token } : {}
    });
    if (!res.ok) throw new Error('Ошибка экспорта');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trades-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

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

  // Equity curve SVG
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📈</span>
          <div>
            <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Аналитика и отчёты</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Сводка по сделкам и история</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border"
            style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="">Все пользователи</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username || u.id}</option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={exportSince} onChange={(e) => setExportSince(e.target.value)} className="px-2 py-1.5 rounded border text-sm" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }} placeholder="С" />
            <input type="date" value={exportUntil} onChange={(e) => setExportUntil(e.target.value)} className="px-2 py-1.5 rounded border text-sm" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }} placeholder="По" />
            <button onClick={exportCsv} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'white' }}>Экспорт CSV</button>
          </div>
        </div>
      </div>

      <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-3xl">📊</span>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Сводка по сделкам</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Win Rate, PnL, Profit Factor, Max Drawdown, Sharpe</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {metrics.map((row) => (
            <div key={row.label} className="rounded-lg p-3 flex flex-col" style={miniCardStyle}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
              <span className="text-sm font-semibold mt-0.5 tabular-nums" style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>
      </section>

      {curve.length > 0 && (
        <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Кривая эквити</h3>
          <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="max-h-40">
            <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </section>
      )}

      {(a.pairCorrelation ?? []).length > 0 && (
        <section className="rounded-lg overflow-hidden shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
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
        <section className="rounded-lg overflow-hidden shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--warning)' }}>
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

      <section className="rounded-lg overflow-hidden shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
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
