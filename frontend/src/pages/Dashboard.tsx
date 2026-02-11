import { useState, useEffect } from 'react';
import { TradingSignal } from '../types/signal';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { formatNum4, formatNum4Signed } from '../utils/formatNum';

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
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      api.get<AppStats>('/stats', { headers })
        .then(setStats)
        .catch(() => setStats(null));
    };
    fetchStats();
    const id = setInterval(fetchStats, 10000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    api.get<TradingSignal[]>('/signals?limit=10', { headers })
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

  // Новому пользователю без подписки показываем только экран покупки ключа
  if (!user?.activationActive) {
    return (
      <div className="max-w-xl mx-auto py-8 md:py-12 px-4">
        <div
          className="rounded-2xl border-2 p-8 md:p-10 text-center shadow-lg"
          style={{ borderColor: 'var(--accent)', background: 'var(--bg-card-solid)', boxShadow: '0 0 0 1px var(--border)' }}
        >
          <div className="w-14 h-14 mx-auto mb-5 rounded-full flex items-center justify-center text-2xl" style={{ background: 'var(--accent)', color: 'white' }}>
            🔑
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
            PREMIUM-доступ к CLABX
          </h1>
          <p className="text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
            Для работы с сервисом нужен ключ активации. Приобретите его в нашем Telegram-боте — оплата через Telegram Stars, ключ приходит сразу после оплаты.
          </p>
          <ol className="text-left text-sm mb-8 space-y-3 max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>1</span>
              Откройте бота в Telegram
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>2</span>
              Выберите тариф (1–90 дней)
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>3</span>
              Оплатите Stars — ключ придёт в чат
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>4</span>
              Вставьте ключ во вкладку «Активировать»
            </li>
          </ol>
          <a
            href="https://t.me/clabx_bot"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white text-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'var(--accent)' }}
          >
            @clabx_bot — приобрести ключ
          </a>
          <p className="text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
            Уже есть ключ? Перейдите во вкладку{' '}
            <button
              type="button"
              onClick={() => (window as any).__navigateTo?.('activate')}
              className="font-semibold underline cursor-pointer hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 rounded"
              style={{ color: 'var(--accent)', background: 'transparent', border: 'none' }}
            >
              Активировать
            </button>{' '}
            и введите его.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Статистика приложения — ордера, пользователи, объём, статус */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 md:p-6">
          <p className="text-sm mb-1 tracking-wide" style={{ color: 'var(--text-muted)' }}>Ордера (всего)</p>
          <p className="text-2xl md:text-3xl font-bold tracking-tight">
            {stats?.orders.total ?? '—'}
          </p>
          {stats && (
            <p className="text-sm mt-2 flex items-center gap-2">
              <span style={{ color: 'var(--success)' }}>{formatNum4Signed(stats.orders.wins)}</span>
              <span style={{ color: 'var(--text-muted)' }}> / </span>
              <span style={{ color: 'var(--danger)' }}>-{formatNum4(stats.orders.losses)}</span>
              <span style={{ color: 'var(--text-muted)' }}> • Win rate {formatNum4(stats.orders.winRate)}%</span>
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
          <p className={`text-2xl md:text-3xl font-bold tracking-tight tabular-nums ${(stats?.volumeEarned ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {formatNum4Signed(stats?.volumeEarned ?? 0)} $
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
          <p className="text-sm font-medium tabular-nums">
            {stats ? (
              <>
                <span style={{ color: 'var(--success)' }}>{formatNum4Signed(stats.orders.wins)}</span>
                <span style={{ color: 'var(--text-muted)' }}> / </span>
                <span style={{ color: 'var(--danger)' }}>-{formatNum4(stats.orders.losses)}</span>
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
