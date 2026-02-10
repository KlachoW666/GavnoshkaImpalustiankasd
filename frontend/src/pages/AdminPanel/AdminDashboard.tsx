import { useState, useEffect } from 'react';
import { adminApi, clearAdminToken } from '../../utils/adminApi';
import { api } from '../../utils/api';

interface DashboardData {
  system: {
    online: boolean;
    autoTrading: 'active' | 'inactive';
    websocket: string;
    okxApi: string;
    database: string;
    databaseMode?: 'sqlite' | 'memory';
    uptimeSeconds: number;
  };
  trading: {
    totalTrades24h: number;
    winRate: number;
    wins: number;
    losses: number;
    totalPnl: number;
    totalPnlPercent: number;
    bestTrade: { pnl: number; pair: string } | null;
    worstTrade: { pnl: number; pair: string } | null;
    openPositionsCount: number;
    openPositions: unknown[];
  };
  risk: {
    dailyDrawdownPercent: number;
    dailyDrawdownLimitPercent: number;
    openPositions: number;
    maxPositions: number;
    consecutiveLosses: number;
    maxConsecutiveLosses: number;
    canOpenTrade: boolean;
    reason: string;
  };
  keysStats: {
    byDuration: Record<number, { used: number; total: number }>;
    totalUsed: number;
    totalCreated: number;
  };
  topUsers: Array<{ userId: string; username: string; totalPnl: number; okxBalance: number | null }>;
  usersStats: { total: number; premium: number; inactive: number; online: number };
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}ч ${m}м ${s}с`;
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = async () => {
    try {
      const d = await adminApi.get<DashboardData>('/admin/dashboard');
      setData(d);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      if (String(e).includes('401')) clearAdminToken();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const id = setInterval(fetchDashboard, 10000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8">
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <button
          type="button"
          onClick={() => { clearAdminToken(); window.location.reload(); }}
          className="mt-4 px-4 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
        >
          Выйти и обновить
        </button>
      </div>
    );
  }

  const d = data!;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <h2 className="text-xl font-bold tracking-tight">Dashboard</h2>

      {error && (
        <div className="p-4 rounded-xl border" style={{ background: 'var(--danger-dim)', borderColor: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* System Status */}
        <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className={d.system.online ? 'text-[var(--success)]' : ''}>🟢</span> System Status
          </h3>
          <ul className="space-y-2 text-sm">
            <li>System: {d.system.online ? 'ONLINE' : 'OFFLINE'}</li>
            <li>Auto-Trading: {d.system.autoTrading === 'active' ? 'ACTIVE' : 'INACTIVE'}</li>
            <li>WebSocket: {d.system.websocket}</li>
            <li>OKX API: {d.system.okxApi}</li>
            <li>Database: {d.system.database}{d.system.databaseMode === 'memory' ? ' (in-memory)' : d.system.databaseMode === 'sqlite' ? ' (SQLite)' : ''}</li>
            <li>Uptime: {formatUptime(d.system.uptimeSeconds)}</li>
          </ul>
        </section>

        {/* Trading Summary */}
        <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold mb-4">📊 Trading Summary (24h)</h3>
          <ul className="space-y-2 text-sm">
            <li>Total Trades: {d.trading.totalTrades24h}</li>
            <li>Win Rate: {d.trading.winRate.toFixed(1)}% ({d.trading.wins}W / {d.trading.losses}L)</li>
            <li>Total PnL: {d.trading.totalPnl >= 0 ? '+' : ''}${d.trading.totalPnl.toFixed(2)} ({d.trading.totalPnlPercent >= 0 ? '+' : ''}{d.trading.totalPnlPercent.toFixed(1)}%)</li>
            {d.trading.bestTrade && <li>Best: +${d.trading.bestTrade.pnl.toFixed(2)} ({d.trading.bestTrade.pair})</li>}
            {d.trading.worstTrade && <li>Worst: ${d.trading.worstTrade.pnl.toFixed(2)} ({d.trading.worstTrade.pair})</li>}
            <li>Open Positions: {d.trading.openPositionsCount}</li>
          </ul>
        </section>

        {/* Risk Indicators */}
        <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold mb-4">🛡️ Risk Indicators</h3>
          <ul className="space-y-2 text-sm">
            <li>Daily Drawdown: {d.risk.dailyDrawdownPercent.toFixed(1)}% / {d.risk.dailyDrawdownLimitPercent}%</li>
            <li>Open Positions: {d.risk.openPositions} / {d.risk.maxPositions}</li>
            <li>Consecutive Losses: {d.risk.consecutiveLosses} / {d.risk.maxConsecutiveLosses}</li>
            <li>Can Open Trade: {d.risk.canOpenTrade ? 'Yes' : 'No'}</li>
            {d.risk.reason && <li className="text-xs" style={{ color: 'var(--text-muted)' }}>{d.risk.reason}</li>}
          </ul>
        </section>
      </div>

      {/* 1) Статистика покупок ключей */}
      <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h3 className="text-lg font-semibold mb-4">🔑 Покупки ключей</h3>
        <ul className="space-y-2 text-sm">
          <li>Всего ключей создано: <strong>{d.keysStats.totalCreated}</strong></li>
          <li>Использовано: <strong>{d.keysStats.totalUsed}</strong></li>
          {Object.keys(d.keysStats.byDuration).length > 0 && (
            <li className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              По срокам: {Object.entries(d.keysStats.byDuration)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([days, { used, total }]) => `${days}д — ${used}/${total}`)
                .join(', ')}
            </li>
          )}
        </ul>
      </section>

      {/* 2) Топ 5 пользователей по заработку + баланс OKX */}
      <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h3 className="text-lg font-semibold mb-4">👥 Топ 5 пользователей (заработок)</h3>
        {d.topUsers.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Нет данных по сделкам</p>
        ) : (
          <ul className="space-y-2">
            {d.topUsers.map((u, i) => (
              <li key={u.userId} className="flex items-center justify-between text-sm gap-4">
                <span><strong>{i + 1}.</strong> {u.username}</span>
                <span style={{ color: u.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {u.totalPnl >= 0 ? '+' : ''}${u.totalPnl.toFixed(2)}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  OKX: {u.okxBalance != null ? `$${u.okxBalance.toFixed(2)}` : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3) Пользователи: зарегистрировано, премиум, неактивные, онлайн */}
      <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h3 className="text-lg font-semibold mb-4">📊 Пользователи</h3>
        <ul className="space-y-2 text-sm">
          <li>Зарегистрировано: <strong>{d.usersStats.total}</strong></li>
          <li>Активных (PREMIUM): <strong style={{ color: 'var(--success)' }}>{d.usersStats.premium}</strong></li>
          <li>Неактивных (обычный): <strong>{d.usersStats.inactive}</strong></li>
          <li>Онлайн: <strong style={{ color: 'var(--accent)' }}>{d.usersStats.online}</strong></li>
        </ul>
      </section>
    </div>
  );
}
