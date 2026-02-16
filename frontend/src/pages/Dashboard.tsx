import { useState, useEffect } from 'react';
import { TradingSignal } from '../types/signal';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { formatNum4, formatNum4Signed } from '../utils/formatNum';
import { useNavigation } from '../contexts/NavigationContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

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

function StatSkeleton() {
  return (
    <Card variant="glass" padding="normal">
      <div className="animate-shimmer h-3 w-20 rounded mb-3" />
      <div className="animate-shimmer h-7 w-28 rounded mb-2" />
      <div className="animate-shimmer h-3 w-16 rounded" />
    </Card>
  );
}

export default function Dashboard() {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const { token, user } = useAuth();
  const { navigateTo } = useNavigation();

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

  /* ── Activation wall ──────────────────────────────────────────────── */
  if (!user?.activationActive) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4">
        <Card variant="glass" padding="spacious" className="text-center">
          <div className="w-14 h-14 mx-auto mb-6 rounded-lg flex items-center justify-center animate-pulse-glow" style={{ background: 'var(--accent-dim)' }}>
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: 'var(--accent)' }}>
              <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-3">PREMIUM-доступ к CLABX</h1>
          <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
            Для работы с сервисом нужен ключ активации. Приобретите его в нашем Telegram-боте.
          </p>

          <div className="text-left space-y-4 mb-8 max-w-sm mx-auto">
            {[
              'Откройте бота в Telegram',
              'Выберите тариф (1–90 дней)',
              'Оплатите Stars — ключ придёт в чат',
              'Вставьте ключ во вкладку «Активировать»'
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded flex items-center justify-center text-xs font-bold" style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}>
                  {i + 1}
                </span>
                <p className="text-sm pt-1" style={{ color: 'var(--text-muted)' }}>{text}</p>
              </div>
            ))}
          </div>

          <a
            href="https://t.me/clabx_bot"
            target="_blank"
            rel="noreferrer"
            className="btn-primary inline-flex items-center gap-2 text-base px-8 py-3"
          >
            @clabx_bot — приобрести ключ
          </a>

          <p className="text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
            Уже есть ключ?{' '}
            <button type="button" onClick={() => navigateTo('activate')} className="font-semibold underline" style={{ color: 'var(--accent)', background: 'none', border: 'none' }}>
              Активировать
            </button>
          </p>
        </Card>
      </div>
    );
  }

  /* ── Main dashboard ───────────────────────────────────────────────── */
  return (
    <div className="space-y-6">

      {/* ── Hero stats row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {statsLoading ? (
          [1, 2, 3, 4].map((i) => <StatSkeleton key={i} />)
        ) : (
          <>
            {/* Volume */}
            <Card variant="glass" padding="normal" className="col-span-2 lg:col-span-1">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-dim)' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: 'var(--accent)' }}>
                    <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1m9-9a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Объём PnL</p>
                  <p className={`text-xl font-bold tabular-nums mt-0.5 ${(display?.volumeEarned ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {display ? formatNum4Signed(display.volumeEarned) : '—'} $
                  </p>
                </div>
              </div>
            </Card>

            {/* Orders */}
            <Card variant="glass" padding="normal">
              <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Ордера</p>
              <p className="text-xl font-bold tabular-nums mt-1">{display ? display.ordersTotal : '—'}</p>
              {display && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="success" dot>{display.ordersWins} W</Badge>
                  <Badge variant="danger" dot>{display.ordersLosses} L</Badge>
                  <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{formatNum4(display.ordersWinRate)}%</span>
                </div>
              )}
            </Card>

            {/* Users */}
            <Card variant="glass" padding="normal">
              <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Пользователи</p>
              <p className="text-xl font-bold tabular-nums mt-1" style={{ color: 'var(--accent)' }}>{display ? display.usersCount : '—'}</p>
              {display && (
                <p className="text-[11px] mt-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                  <span style={{ color: 'var(--success)' }}>онлайн {display.onlineUsersCount}</span>
                </p>
              )}
            </Card>

            {/* System status */}
            <Card variant="glass" padding="normal">
              <p className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Система</p>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${stats?.status === 'ok' ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--warning)]'}`} />
                <span className="text-sm font-semibold" style={{ color: stats?.status === 'ok' ? 'var(--success)' : 'var(--warning)' }}>
                  {stats?.status === 'ok' ? 'Online' : 'Degraded'}
                </span>
              </div>
              <div className="space-y-1 text-[11px]">
                <p className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stats?.okxConnected ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
                  <span style={{ color: 'var(--text-muted)' }}>OKX: {stats?.okxConnected ? 'OK' : 'нет ключей'}</span>
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--success)]" />
                  <span style={{ color: 'var(--text-muted)' }}>БД: {stats?.databaseMode === 'sqlite' ? 'SQLite' : 'memory'}</span>
                </p>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* ── Quick actions ───────────────────────────────────────────── */}
      <Card variant="glass" padding="normal">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => navigateTo('autotrade')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Авто-трейд
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigateTo('scanner')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Скринер
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigateTo('signals')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Сигналы
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigateTo('chart')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16" strokeLinecap="round" strokeLinejoin="round" /></svg>
            График
          </Button>
        </div>
      </Card>

      {/* ── How to start ────────────────────────────────────────────── */}
      <Card variant="accent" padding="normal">
        <h2 className="text-sm font-bold uppercase tracking-wider mb-5 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: 'var(--accent)' }}>
            <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Как начать
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { n: 1, title: 'Подключите OKX', desc: 'В «Настройки → Биржа» сохраните API-ключи для авто-торговли и баланса.' },
            { n: 2, title: 'Ключ доступа', desc: 'Купите ключ в боте @clabx_bot, введите во вкладке «Активировать».' },
            { n: 3, title: 'Скринер и Авто', desc: 'Топ монет в «Скринер», автоматические сделки в «Авто-трейд».' },
          ].map((s) => (
            <div key={s.n} className="flex gap-3">
              <span className="shrink-0 w-8 h-8 rounded flex items-center justify-center text-sm font-bold" style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}>
                {s.n}
              </span>
              <div>
                <p className="text-sm font-semibold mb-0.5">{s.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Recent signals + integrations ───────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card variant="glass" padding="normal">
          <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Последние сигналы</h3>
          {signals.length === 0 ? (
            <p className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>Пока нет сигналов. Они появятся при анализе рынка.</p>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
              {signals.slice(0, 8).map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-sm py-2 px-3 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
                  <span className="font-medium truncate tabular-nums">{s.symbol ?? '—'}</span>
                  <Badge variant={s.direction === 'LONG' ? 'long' : 'short'}>
                    {s.direction === 'LONG' ? 'LONG' : 'SHORT'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card variant="glass" padding="normal">
          <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Интеграции</h3>
          <ul className="space-y-3 text-sm">
            {[
              { label: 'OKX — биржа для авто-торговли и баланса', active: true },
              { label: 'TradingView — идеи и графики', active: true },
              { label: 'Telegram — @clabx_bot для ключей', active: true },
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${item.active ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'}`} />
                <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
