import { useState, useEffect } from 'react';
import { adminApi, clearAdminToken } from '../../utils/adminApi';
import { api } from '../../utils/api';
import { formatNum4, formatNum4Signed } from '../../utils/formatNum';
import { useNavigation } from '../../contexts/NavigationContext';

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
  const { navigateToTrader } = useNavigation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [maintenanceEnabled, setMaintenanceEnabled] = useState<boolean | null>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  const fetchMaintenance = async () => {
    try {
      const res = await adminApi.get<{ enabled: boolean }>('/admin/maintenance');
      setMaintenanceEnabled(res.enabled);
    } catch {
      setMaintenanceEnabled(null);
    }
  };

  const setMaintenance = async (enabled: boolean) => {
    setMaintenanceLoading(true);
    try {
      const res = await adminApi.post<{ enabled: boolean }>('/admin/maintenance', { enabled });
      setMaintenanceEnabled(res.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка изменения режима ТО');
    } finally {
      setMaintenanceLoading(false);
    }
  };

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
    fetchMaintenance();
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

  const cardStyle = {
    background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  };
  const miniCardStyle = { background: 'var(--bg-hover)' };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📋</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Dashboard</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Главная: система и статистика</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => (window as any).__adminSetTab?.('trading')}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          📈 Управление торговлей
        </button>
        {/* Техническое обслуживание */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {maintenanceEnabled === null ? '…' : maintenanceEnabled ? '🔧 Сайт закрыт на ТО' : '✅ Сайт открыт'}
          </span>
          <button
            type="button"
            onClick={() => maintenanceEnabled !== null && setMaintenance(!maintenanceEnabled)}
            disabled={maintenanceLoading || maintenanceEnabled === null}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{
              background: maintenanceEnabled ? 'var(--success)' : 'var(--warning)',
              color: 'white'
            }}
          >
            {maintenanceLoading ? '…' : maintenanceEnabled ? 'Открыть сайт' : 'Закрыть на ТО'}
          </button>
        </div>
      </div>

      {/* Верхний ряд: System, Trading, Risk */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* System Status */}
        <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">{d.system.online ? '🟢' : '🔴'}</span>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Состояние системы</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Сервисы и подключения</p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Система', value: d.system.online ? 'ONLINE' : 'OFFLINE', ok: d.system.online },
              { label: 'Авто-торговля', value: d.system.autoTrading === 'active' ? 'Активна' : 'Выкл.', ok: d.system.autoTrading === 'active' },
              { label: 'WebSocket', value: d.system.websocket, ok: true },
              { label: 'Bitget API', value: d.system.okxApi, ok: d.system.okxApi === 'connected' },
              { label: 'БД', value: `${d.system.database}${d.system.databaseMode === 'memory' ? ' (memory)' : d.system.databaseMode === 'sqlite' ? ' (SQLite)' : ''}`, ok: d.system.database === 'ok' },
              { label: 'Uptime', value: formatUptime(d.system.uptimeSeconds), ok: true }
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-2 px-3 rounded-lg text-sm" style={miniCardStyle}>
                <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                <span style={{ color: row.ok ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 600 }}>{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Trading Summary */}
        <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">📊</span>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Торговля (24ч)</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Сделки и PnL</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-lg p-3 text-center" style={miniCardStyle}>
              <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{d.trading.totalTrades24h}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>сделок</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={miniCardStyle}>
              <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatNum4(d.trading.winRate)}%</p>
              <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>Win ({formatNum4Signed(d.trading.wins)} / -{formatNum4(d.trading.losses)})</p>
            </div>
          </div>
          <div className="rounded-lg p-3 mb-2" style={miniCardStyle}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total PnL</p>
            <p className="text-lg font-bold tabular-nums" style={{ color: d.trading.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatNum4Signed(d.trading.totalPnl)} $ ({formatNum4Signed(d.trading.totalPnlPercent)}%)
            </p>
          </div>
          {(d.trading.bestTrade || d.trading.worstTrade) && (
            <div className="grid grid-cols-2 gap-2">
              {d.trading.bestTrade && (
                <div className="rounded-lg p-2 text-center" style={miniCardStyle}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Лучшая</p>
                  <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--success)' }}>{formatNum4Signed(d.trading.bestTrade.pnl)} $</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{d.trading.bestTrade.pair}</p>
                </div>
              )}
              {d.trading.worstTrade && (
                <div className="rounded-lg p-2 text-center" style={miniCardStyle}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Худшая</p>
                  <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--danger)' }}>-{formatNum4(Math.abs(d.trading.worstTrade.pnl))} $</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{d.trading.worstTrade.pair}</p>
                </div>
              )}
            </div>
          )}
          <div className="mt-2 rounded-lg py-2 px-3 flex justify-between text-sm" style={miniCardStyle}>
            <span style={{ color: 'var(--text-muted)' }}>Открыто позиций</span>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{d.trading.openPositionsCount}</span>
          </div>
        </section>

        {/* Risk Indicators */}
        <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--warning)' }}>
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">🛡️</span>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Риски</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Лимиты и допуск к сделкам</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="rounded-lg p-3 flex justify-between items-center text-sm" style={miniCardStyle}>
              <span style={{ color: 'var(--text-muted)' }}>Просадка дня</span>
              <span className="font-semibold" style={{ color: d.risk.dailyDrawdownPercent >= d.risk.dailyDrawdownLimitPercent ? 'var(--danger)' : 'var(--success)' }}>
                {formatNum4(d.risk.dailyDrawdownPercent)}% / {d.risk.dailyDrawdownLimitPercent}%
              </span>
            </div>
            <div className="rounded-lg p-3 flex justify-between items-center text-sm" style={miniCardStyle}>
              <span style={{ color: 'var(--text-muted)' }}>Позиции</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{d.risk.openPositions} / {d.risk.maxPositions}</span>
            </div>
            <div className="rounded-lg p-3 flex justify-between items-center text-sm" style={miniCardStyle}>
              <span style={{ color: 'var(--text-muted)' }}>Подряд убытков</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{d.risk.consecutiveLosses} / {d.risk.maxConsecutiveLosses}</span>
            </div>
            <div className="rounded-lg p-3 flex justify-between items-center text-sm" style={miniCardStyle}>
              <span style={{ color: 'var(--text-muted)' }}>Можно открыть сделку</span>
              <span className="font-semibold" style={{ color: d.risk.canOpenTrade ? 'var(--success)' : 'var(--danger)' }}>{d.risk.canOpenTrade ? 'Да' : 'Нет'}</span>
            </div>
            {d.risk.reason && (
              <p className="text-xs pt-1 px-2" style={{ color: 'var(--text-muted)' }}>{d.risk.reason}</p>
            )}
          </div>
        </section>
      </div>

      {/* Нижний ряд: ключи, топ пользователей, пользователи */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1) Покупки ключей */}
        <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">🔑</span>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Покупки ключей</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Статистика по ключам активации</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg p-4 flex flex-col items-center text-center" style={miniCardStyle}>
              <span className="text-2xl mb-1">📦</span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{d.keysStats.totalCreated}</span>
              <span className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>создано</span>
            </div>
            <div className="rounded-lg p-4 flex flex-col items-center text-center" style={miniCardStyle}>
              <span className="text-2xl mb-1">✅</span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--success)' }}>{d.keysStats.totalUsed}</span>
              <span className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>использовано</span>
            </div>
          </div>
          {Object.keys(d.keysStats.byDuration).length > 0 && (
            <div className="pt-4 mt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <span>📅</span> По срокам
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(d.keysStats.byDuration)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([days, { used, total }]) => (
                    <div
                      key={days}
                      className="rounded-lg px-3 py-2.5 flex items-center justify-between"
                      style={miniCardStyle}
                    >
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{days} дн.</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                        {used}<span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>/{total}</span>
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>

        {/* 2) Топ 5 пользователей */}
        <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">👥</span>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Топ по заработку</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>По закрытым сделкам</p>
            </div>
          </div>
          {d.topUsers.length === 0 ? (
            <div className="py-10 text-center rounded-lg" style={miniCardStyle}>
              <span className="text-4xl opacity-50">💰</span>
              <p className="text-sm mt-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>Сводка PnL: {formatNum4Signed(0)} $</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.8 }}>Данные появятся после закрытия ордеров</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {d.topUsers.map((u, i) => (
                <li key={u.userId} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg text-sm" style={miniCardStyle}>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => navigateToTrader(u.userId)}
                      className="font-medium truncate text-left hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset rounded"
                      style={{ color: 'var(--accent)' }}
                    >
                      {u.username}
                    </button>
                  </span>
                  <span className="flex-shrink-0 font-semibold tabular-nums" style={{ color: u.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatNum4Signed(u.totalPnl)} $
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3) Пользователи */}
        <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">👤</span>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Пользователи</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Регистрации и активность</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg p-4 flex flex-col items-center text-center" style={miniCardStyle}>
              <span className="text-2xl mb-1">📋</span>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{d.usersStats.total}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Всего</p>
            </div>
            <div className="rounded-lg p-4 flex flex-col items-center text-center" style={miniCardStyle}>
              <span className="text-2xl mb-1">⭐</span>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--success)' }}>{d.usersStats.premium}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>PREMIUM</p>
            </div>
            <div className="rounded-lg p-4 flex flex-col items-center text-center" style={miniCardStyle}>
              <span className="text-2xl mb-1">👤</span>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-secondary)' }}>{d.usersStats.inactive}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Обычные</p>
            </div>
            <div className="rounded-lg p-4 flex flex-col items-center text-center" style={miniCardStyle}>
              <span className="text-2xl mb-1">🟢</span>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{d.usersStats.online}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Онлайн</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
