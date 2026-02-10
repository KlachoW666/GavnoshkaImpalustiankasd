import { useState, useEffect } from 'react';
import { TradingSignal } from '../types/signal';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

export interface AppStats {
  orders: {
    total: number;
    wins: number;
    losses: number;
    totalPnl: number;
    totalPnlPercent: number;
    winRate: number;
    openCount: number;
  };
  usersCount: number;
  onlineUsersCount: number;
  volumeEarned: number;
  status: 'ok' | 'degraded';
  databaseMode: 'sqlite' | 'memory';
  okxConnected: boolean;
}

export default function Dashboard() {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [stats, setStats] = useState<AppStats | null>(null);
  const { token, user } = useAuth();

  useEffect(() => {
    const fetchStats = () => {
      api.get<AppStats>('/stats')
        .then(setStats)
        .catch(() => setStats(null));
    };
    fetchStats();
    const id = setInterval(fetchStats, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.get<TradingSignal[]>('/signals?limit=10')
      .then(setSignals)
      .catch(() => {});

    const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      if (token) ws.send(JSON.stringify({ type: 'auth', token }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'signal' && msg.data) {
          const payload = msg.data as { signal?: TradingSignal } & TradingSignal;
          const sig = payload.signal ?? payload;
          if (sig?.symbol != null) setSignals((prev) => [sig as TradingSignal, ...prev.slice(0, 9)]);
        }
      } catch {}
    };
    return () => ws.close();
  }, [token]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {!user?.activationActive && (
        <div className="card p-5 border-2 rounded-xl" style={{ borderColor: 'var(--accent)', background: 'var(--bg-card-solid)' }}>
          <p className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Для доступа к PREMIUM-версии необходимо приобрести ключ в нашем Telegram-боте
          </p>
          <a
            href="https://t.me/clabx_bot"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            @clabx_bot — приобрести ключ
          </a>
        </div>
      )}
      {/* Статистика приложения — ордера, пользователи, объём, статус */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 md:p-6">
          <p className="text-sm mb-1 tracking-wide" style={{ color: 'var(--text-muted)' }}>Ордера (всего)</p>
          <p className="text-2xl md:text-3xl font-bold tracking-tight">
            {stats?.orders.total ?? '—'}
          </p>
          {stats && stats.orders.total > 0 && (
            <p className="text-sm mt-2 flex items-center gap-2">
              <span style={{ color: 'var(--success)' }}>+{stats.orders.wins}</span>
              <span style={{ color: 'var(--text-muted)' }}>/</span>
              <span style={{ color: 'var(--danger)' }}>-{stats.orders.losses}</span>
              <span style={{ color: 'var(--text-muted)' }}>• Win rate {stats.orders.winRate}%</span>
            </p>
          )}
        </div>
        <div className="card p-5 md:p-6">
          <p className="text-sm mb-1 tracking-wide" style={{ color: 'var(--text-muted)' }}>Всего зарегистрировано</p>
          <p className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
            {stats?.usersCount ?? '—'}
          </p>
          {stats && stats.onlineUsersCount != null && (
            <p className="text-sm mt-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
              <span style={{ color: 'var(--success)' }}>Онлайн: {stats.onlineUsersCount}</span>
            </p>
          )}
        </div>
        <div className="card p-5 md:p-6">
          <p className="text-sm mb-1 tracking-wide" style={{ color: 'var(--text-muted)' }}>Объём заработанных</p>
          <p className={`text-2xl md:text-3xl font-bold tracking-tight ${(stats?.volumeEarned ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {(stats?.volumeEarned ?? 0) >= 0 ? '+' : ''}{(stats?.volumeEarned ?? 0).toFixed(2)} $
          </p>
        </div>
        <div className="card p-5 md:p-6">
          <p className="text-sm mb-1 tracking-wide" style={{ color: 'var(--text-muted)' }}>Статус приложения</p>
          <p className="font-medium flex items-center gap-2" style={{ color: stats?.status === 'ok' ? 'var(--success)' : 'var(--warning)' }}>
            <span className={`w-2 h-2 rounded-full ${stats?.status === 'ok' ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--warning)]'}`} />
            {stats?.status === 'ok' ? 'Online' : 'Degraded'}
          </p>
          <p className="text-xs mt-2 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${stats?.okxConnected ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--danger)]'}`} />
              <span style={{ color: stats?.okxConnected ? 'var(--success)' : 'var(--text-muted)' }}>OKX: {stats?.okxConnected ? 'Online' : 'нет'}</span>
            </span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span className="flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
              База данных Online
            </span>
          </p>
        </div>
      </section>

      {/* Info / onboarding block */}
      <div className="card p-6 md:p-8">
        <h2 className="section-title mb-4">Как начать пользоваться CLABX 💸</h2>
        <div className="grid gap-4 md:grid-cols-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <ul className="space-y-2 list-disc list-inside">
            <li>Подключите биржу OKX в разделе «Настройки → Биржа» и сохраните свои API‑ключи.</li>
            <li>
              Купите и активируйте ключ доступа у бота{' '}
              <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                @clabx_bot
              </a>.
            </li>
            <li>После активации переходите в разделы «Скринер» и «Авто» — там подбираются монеты и запускается авто‑торговля.</li>
          </ul>
          <ul className="space-y-2 list-disc list-inside">
            <li>Скринер показывает топ‑монеты по волатильности, объёму и уровням, чтобы вы быстро находили точки входа.</li>
            <li>Раздел «Авто» открывает и закрывает сделки по сигналам и записывает их в статистику на этой странице.</li>
            <li>Здесь вы видите количество закрытых ордеров, общий заработанный объём и статус подключения сервиса (OKX и база данных).</li>
          </ul>
        </div>
      </div>

      {/* Статистика — блок из старой вкладки «Статистика» */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 md:p-6">
          <p className="section-title mb-2">Сигналов за сессию</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{signals.length}</p>
        </div>
        <div className="card p-5 md:p-6">
          <p className="section-title mb-2">Ордера (прибыль / убыток)</p>
          <p className="text-sm font-medium">
            {stats ? (
              <>
                <span style={{ color: 'var(--success)' }}>+{stats.orders.wins}</span>
                <span style={{ color: 'var(--text-muted)' }}> / </span>
                <span style={{ color: 'var(--danger)' }}>-{stats.orders.losses}</span>
                <span className="block mt-1" style={{ color: 'var(--text-muted)' }}>Всего: {stats.orders.total}</span>
              </>
            ) : (
              '—'
            )}
          </p>
        </div>
        <div className="card p-5 md:p-6">
          <p className="section-title mb-2">Интеграции</p>
          <p className="text-sm font-medium flex items-center gap-2 flex-wrap" style={{ color: 'var(--accent)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> OKX
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> TradingView
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> Scalpboard
          </p>
        </div>
        <div className="card p-5 md:p-6">
          <p className="section-title mb-2">Статус</p>
          <p className="font-medium flex items-center gap-2" style={{ color: stats?.status === 'ok' ? 'var(--success)' : 'var(--warning)' }}>
            <span className={`w-2 h-2 rounded-full ${stats?.status === 'ok' ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--warning)]'}`} />
            {stats?.status === 'ok' ? 'Online' : 'Degraded'}
          </p>
        </div>
      </section>
    </div>
  );
}
