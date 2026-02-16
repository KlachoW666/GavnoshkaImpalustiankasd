import { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { SkeletonTable } from '../components/Skeleton';
import { useTableSort } from '../utils/useTableSort';
import { SortableTh } from '../components/SortableTh';
import { useNavigation } from '../contexts/NavigationContext';

const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

interface LeaderboardEntry {
  userId: string;
  username: string;
  totalPnl: number;
  wins: number;
  losses: number;
  trades: number;
  winRate: number;
  isProvider: boolean;
}

export default function SocialPage() {
  const { token } = useAuth();
  const { navigateTo, navigateToTrader } = useNavigation();
  const navigateToCopy = () => navigateTo('copy');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('all');

  useEffect(() => {
    setLoading(true);
    api
      .get<{ leaderboard: LeaderboardEntry[] }>(`/social/leaderboard?limit=30&period=${period}`)
      .then((r) => setLeaderboard(r.leaderboard ?? []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLoading(false));
  }, [period]);

  const leaderboardCompare = useMemo(() => ({
    username: (a: LeaderboardEntry, b: LeaderboardEntry) => (a.username || '').localeCompare(b.username || ''),
    totalPnl: (a: LeaderboardEntry, b: LeaderboardEntry) => a.totalPnl - b.totalPnl,
    trades: (a: LeaderboardEntry, b: LeaderboardEntry) => a.trades - b.trades,
    winRate: (a: LeaderboardEntry, b: LeaderboardEntry) => a.winRate - b.winRate
  }), []);
  const { sortedItems: sortedLeaderboard, sortKey, sortDir, toggleSort } = useTableSort(leaderboard, leaderboardCompare, 'totalPnl', 'desc');

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Социальная торговля</h1>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Рейтинг трейдеров по суммарному PnL. Можно подписаться на топовых и копировать их сделки в разделе Копитрейдинг.
      </p>

      <section className="rounded-2xl p-6" style={cardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold">Лидерборд</h2>
          <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--bg-hover)' }}>
            {(['7d', '30d', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition"
                style={{
                  background: period === p ? 'var(--accent)' : 'transparent',
                  color: period === p ? 'white' : 'var(--text-muted)'
                }}
              >
                {p === '7d' ? '7 дней' : p === '30d' ? '30 дней' : 'Всё время'}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : leaderboard.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Пока нет данных. Закройте сделки — появятся в рейтинге.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}>
                  <th className="text-left py-3 px-2 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>#</th>
                  <SortableTh label="Трейдер" sortKey="username" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="PnL $" sortKey="totalPnl" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="Сделок" sortKey="trades" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="Winrate %" sortKey="winRate" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <th className="text-center py-3 px-2 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Копировать</th>
                </tr>
              </thead>
              <tbody>
                {sortedLeaderboard.map((e, i) => (
                  <tr key={e.userId} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 px-2 font-medium">{i + 1}</td>
                    <td className="py-3 px-2">
                      <button
                        type="button"
                        onClick={() => navigateToTrader(e.userId)}
                        className="font-medium text-left hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset rounded"
                        style={{ color: 'var(--accent)' }}
                      >
                        {e.username}
                      </button>
                      {e.isProvider && <span className="ml-1 text-xs" style={{ color: 'var(--accent)' }}>• провайдер</span>}
                    </td>
                    <td className={`text-right py-3 px-2 tabular-nums ${e.totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {e.totalPnl >= 0 ? '+' : ''}{e.totalPnl.toFixed(2)}
                    </td>
                    <td className="text-right py-3 px-2 tabular-nums">{e.trades} ({e.wins}+ / {e.losses}-)</td>
                    <td className="text-right py-3 px-2 tabular-nums">{e.winRate.toFixed(1)}%</td>
                    <td className="py-3 px-2 text-center">
                      {token && e.isProvider && (
                        <button
                          onClick={navigateToCopy}
                          className="px-3 py-1 rounded-lg text-sm"
                          style={{ background: 'var(--accent)', color: 'white' }}
                        >
                          К подписке
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
