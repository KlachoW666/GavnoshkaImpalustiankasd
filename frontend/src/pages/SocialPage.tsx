import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

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
  const navigateToCopy = () => (window as any).__navigateTo?.('copy');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ leaderboard: LeaderboardEntry[] }>('/social/leaderboard?limit=30')
      .then((r) => setLeaderboard(r.leaderboard ?? []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Социальная торговля</h1>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Рейтинг трейдеров по суммарному PnL. Можно подписаться на топовых и копировать их сделки в разделе Копитрейдинг.
      </p>

      <section className="rounded-2xl p-6" style={cardStyle}>
        <h2 className="text-lg font-semibold mb-4">Лидерборд</h2>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
        ) : leaderboard.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Пока нет данных. Закройте сделки — появятся в рейтинге.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-card-solid)' }}>
                  <th className="text-left py-3 px-2">#</th>
                  <th className="text-left py-3 px-2">Трейдер</th>
                  <th className="text-right py-3 px-2">PnL $</th>
                  <th className="text-right py-3 px-2">Сделок</th>
                  <th className="text-right py-3 px-2">Winrate %</th>
                  <th className="text-center py-3 px-2">Копировать</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((e, i) => (
                  <tr key={e.userId} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 px-2 font-medium">{i + 1}</td>
                    <td className="py-3 px-2">
                      <button
                        type="button"
                        onClick={() => (window as any).__navigateToTrader?.(e.userId)}
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
