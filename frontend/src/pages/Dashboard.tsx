import { useState, useEffect } from 'react';
import { TradingSignal } from '../types/signal';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { formatNum4, formatNum4Signed } from '../utils/formatNum';
import { SkeletonCard } from '../components/Skeleton';

export interface DisplayStats {
  volumeEarned: number;
  ordersTotal: number;
  ordersWins: number;
  ordersLosses: number;
  ordersWinRate: number;
  usersCount: number;
  onlineUsersCount: number;
  signalsCount: number;
}

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
  displayEnabled?: boolean;
  display?: DisplayStats;
}

export default function Dashboard() {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const { token, user } = useAuth();

  // Отображаемая статистика: с сервера (демо-слой растёт автоматически от даты запуска) или реальная
  const display = stats?.displayEnabled && stats?.display
    ? { ...stats.display, signalsCount: stats.display.signalsCount + signals.length }
    : stats
      ? {
          volumeEarned: stats.volumeEarned,
          ordersTotal: stats.orders.total,
          ordersWins: stats.orders.wins,
          ordersLosses: stats.orders.losses,
          ordersWinRate: stats.orders.winRate,
          usersCount: stats.usersCount,
          onlineUsersCount: stats.onlineUsersCount,
          signalsCount: signals.length
        }
      : null;

  useEffect(() => {
    const fetchStats = () => {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      api.get<AppStats>('/stats', { headers })
        .then(setStats)
        .catch(() => setStats(null))
        .finally(() => setStatsLoading(false));
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

  const cardBase = { background: 'var(--bg-card-solid)', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Hero + главный показатель */}
      <header className="rounded-2xl overflow-hidden" style={{ ...cardBase, borderLeft: '4px solid var(--accent)' }}>
        <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
              Главная
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Сводка по платформе, ваша статистика и быстрые шаги для старта
            </p>
          </div>
          {!statsLoading && stats != null && display && (
            <div className="shrink-0 rounded-xl px-6 py-4 text-center md:text-right" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>
                Объём заработанных (все пользователи)
              </p>
              <p className={`text-2xl md:text-3xl font-bold tabular-nums ${display.volumeEarned >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {formatNum4Signed(display.volumeEarned)} $
              </p>
            </div>
          )}
        </div>
      </header>

      {/* Ключевые метрики — компактная сетка */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {statsLoading ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl p-4 md:p-5" style={cardBase}>
              <SkeletonCard lines={2} />
            </div>
          ))
        ) : (
          <>
            <div className="rounded-xl p-4 md:p-5 transition-colors hover:bg-[var(--bg-hover)]" style={cardBase}>
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Ордера</p>
              <p className="text-xl md:text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{display ? display.ordersTotal : '—'}</p>
              {display && (
                <p className="text-xs mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span style={{ color: 'var(--success)' }}>+{display.ordersWins}</span>
                  <span style={{ color: 'var(--text-muted)' }}>/</span>
                  <span style={{ color: 'var(--danger)' }}>-{display.ordersLosses}</span>
                  <span style={{ color: 'var(--text-muted)' }}>· Win rate {formatNum4(display.ordersWinRate)}%</span>
                </p>
              )}
            </div>
            <div className="rounded-xl p-4 md:p-5 transition-colors hover:bg-[var(--bg-hover)]" style={cardBase}>
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Пользователи</p>
              <p className="text-xl md:text-2xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{display ? display.usersCount : '—'}</p>
              {display && (
                <p className="text-xs mt-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                  <span style={{ color: 'var(--success)' }}>онлайн {display.onlineUsersCount}</span>
                </p>
              )}
            </div>
            <div className="rounded-xl p-4 md:p-5 transition-colors hover:bg-[var(--bg-hover)]" style={cardBase}>
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Сигналов за сессию</p>
              <p className="text-xl md:text-2xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{display ? display.signalsCount : signals.length}</p>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>вкладка «Сигналы»</p>
            </div>
            <div className="rounded-xl p-4 md:p-5 transition-colors hover:bg-[var(--bg-hover)]" style={cardBase}>
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Система</p>
              <p className="flex items-center gap-2 text-sm font-medium" style={{ color: stats?.status === 'ok' ? 'var(--success)' : 'var(--warning)' }}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${stats?.status === 'ok' ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--warning)]'}`} />
                {stats?.status === 'ok' ? 'Сервис Online' : 'Degraded'}
              </p>
              <p className="text-xs mt-2 space-y-1">
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stats?.okxConnected ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
                  OKX (сервер): {stats?.okxConnected ? 'подключён' : 'нет ключей'}
                </span>
                <span className="flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--success)]" />
                  БД: {stats?.databaseMode === 'sqlite' ? 'SQLite' : 'memory'}
                </span>
              </p>
            </div>
          </>
        )}
      </section>

      {/* Как начать — пошагово */}
      <section className="rounded-2xl overflow-hidden" style={{ ...cardBase, borderLeft: '4px solid var(--accent)' }}>
        <div className="p-6 md:p-8">
          <h2 className="text-lg font-bold mb-5 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <span className="text-xl">🚀</span> Как начать пользоваться CLABX
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex gap-4">
              <span className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold" style={{ background: 'var(--accent)', color: 'white' }}>1</span>
              <div>
                <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Подключите OKX</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>В «Настройки → Биржа» сохраните API‑ключи — они нужны для авто‑торговли и отображения баланса.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <span className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold" style={{ background: 'var(--accent)', color: 'white' }}>2</span>
              <div>
                <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Ключ доступа</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Купите ключ в боте{' '}
                  <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer" className="underline font-medium" style={{ color: 'var(--accent)' }}>@clabx_bot</a>
                  , введите его во вкладке «Активировать».
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <span className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold" style={{ background: 'var(--accent)', color: 'white' }}>3</span>
              <div>
                <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Скринер и Авто</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>В «Скринер» — топ монет по волатильности и уровням. В «Авто» — сделки по сигналам, статистика обновляется здесь.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Последние сигналы + интеграции в одном ряду */}
      <section className="grid md:grid-cols-2 gap-4 md:gap-6">
        <div className="rounded-2xl overflow-hidden" style={{ ...cardBase, borderLeft: '4px solid var(--success)' }}>
          <div className="p-5 md:p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Последние сигналы</h3>
            {signals.length === 0 ? (
              <p className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>Пока нет сигналов за сессию. Они появятся при анализе рынка.</p>
            ) : (
              <ul className="space-y-2 max-h-40 overflow-y-auto">
                {signals.slice(0, 8).map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                    <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.symbol ?? '—'}</span>
                    <span className="shrink-0 font-medium" style={{ color: s.direction === 'LONG' ? 'var(--success)' : 'var(--danger)' }}>
                      {s.direction === 'LONG' ? 'LONG' : 'SHORT'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ ...cardBase, borderLeft: '4px solid var(--accent)' }}>
          <div className="p-5 md:p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Интеграции платформы</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                <span style={{ color: 'var(--text-primary)' }}>OKX — биржа для авто‑торговли и баланса</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                <span style={{ color: 'var(--text-primary)' }}>TradingView — идеи и графики</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                <span style={{ color: 'var(--text-primary)' }}>Telegram — бот @clabx_bot для ключей и поддержки</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
