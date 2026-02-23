import { useState, useEffect } from 'react';
import { TradingSignal } from '../types/signal';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { formatNum4, formatNum4Signed } from '../utils/formatNum';
import { useNavigation } from '../contexts/NavigationContext';
import { Card, StatCard } from '../components/ui/Card';
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
  orders: { total: number; wins: number; losses: number; totalPnl: number; totalPnlPercent: number; winRate: number; openCount: number };
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
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
      <div className="animate-shimmer h-3 w-20 rounded mb-3" />
      <div className="animate-shimmer h-8 w-32 rounded" />
    </div>
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
    : stats ? {
        volumeEarned: stats.volumeEarned,
        ordersTotal: stats.orders.total,
        ordersWins: stats.orders.wins,
        ordersLosses: stats.orders.losses,
        ordersWinRate: stats.orders.winRate,
        usersCount: stats.usersCount,
        onlineUsersCount: stats.onlineUsersCount,
        signalsCount: signals.length
      } : null;

  useEffect(() => {
    const fetchStats = () => {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      api.get<AppStats>('/stats', { headers }).then(setStats).catch(() => setStats(null)).finally(() => setStatsLoading(false));
    };
    fetchStats();
    const id = setInterval(fetchStats, 10000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    api.get<TradingSignal[]>('/signals?limit=10', { headers }).then(setSignals).catch(() => {});
    const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => { if (token) ws.send(JSON.stringify({ type: 'auth', token })); };
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

  if (!user?.activationActive) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4">
        <Card variant="premium" padding="spacious" className="text-center animate-fade-in-up">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-gradient)', boxShadow: '0 8px 24px var(--accent-glow)' }}>
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-3">PREMIUM-доступ</h1>
          <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>Для работы с сервисом нужен ключ активации. Приобретите его в Telegram-боте.</p>
          <div className="text-left space-y-4 mb-8 max-w-sm mx-auto">
            {['Откройте бота в Telegram', 'Выберите тариф', 'Оплатите Stars', 'Вставьте ключ'].map((text, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: 'var(--accent-gradient)', color: '#000' }}>{i + 1}</span>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{text}</p>
              </div>
            ))}
          </div>
          <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer">
            <Button variant="primary" size="lg" fullWidth>@clabx_bot — приобрести ключ</Button>
          </a>
          <p className="text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
            Уже есть ключ? <button onClick={() => navigateTo('activate')} style={{ color: 'var(--accent)', background: 'none', border: 'none', textDecoration: 'underline' }}>Активировать</button>
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-page-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          [1, 2, 3, 4].map((i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <Card variant="glass" hoverable className="col-span-2 lg:col-span-1">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: 'var(--accent)' }}>
                    <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1m9-9a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Объём PnL</p>
                  <p className={`text-2xl font-bold tabular-nums ${display && display.volumeEarned >= 0 ? 'text-gradient-success' : 'text-gradient-danger'}`}>
                    {display ? formatNum4Signed(display.volumeEarned) : '—'} $
                  </p>
                </div>
              </div>
            </Card>

            <Card variant="glass" hoverable>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Ордера</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{display ? display.ordersTotal : '—'}</p>
              {display && <div className="flex gap-2 mt-2"><Badge variant="success">{display.ordersWins}W</Badge><Badge variant="danger">{display.ordersLosses}L</Badge></div>}
            </Card>

            <Card variant="glass" hoverable>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Пользователи</p>
              <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: 'var(--accent)' }}>{display ? display.usersCount : '—'}</p>
              {display && <p className="text-xs mt-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} /><span style={{ color: 'var(--success)' }}>онлайн {display.onlineUsersCount}</span></p>}
            </Card>

            <Card variant="glass" hoverable>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Система</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`w-2.5 h-2.5 rounded-full ${stats?.status === 'ok' ? 'animate-pulse' : ''}`} style={{ background: stats?.status === 'ok' ? 'var(--success)' : 'var(--warning)' }} />
                <span className="text-sm font-semibold" style={{ color: stats?.status === 'ok' ? 'var(--success)' : 'var(--warning)' }}>{stats?.status === 'ok' ? 'Online' : 'Degraded'}</span>
              </div>
              <div className="text-xs mt-2 space-y-1" style={{ color: 'var(--text-muted)' }}>
                <p>Bitget: <span style={{ color: stats?.okxConnected ? 'var(--success)' : 'var(--danger)' }}>{stats?.okxConnected ? 'OK' : 'Нет'}</span></p>
              </div>
            </Card>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => navigateTo('autotrade')}>Авто-трейд</Button>
        <Button variant="secondary" onClick={() => navigateTo('scanner')}>Скринер</Button>
        <Button variant="secondary" onClick={() => navigateTo('signals')}>Сигналы</Button>
        <Button variant="secondary" onClick={() => navigateTo('chart')}>График</Button>
      </div>

      <Card variant="accent" padding="spacious">
        <h2 className="text-sm font-bold uppercase tracking-wider mb-6 flex items-center gap-2">
          <span className="text-gradient">⚡</span> Как начать
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { n: 1, title: 'Подключите Bitget', desc: 'В «Настройки → Подключения» сохраните API-ключи' },
            { n: 2, title: 'Ключ доступа', desc: 'Купите ключ в боте @clabx_bot' },
            { n: 3, title: 'Авто-трейд', desc: 'Запустите автоматические сделки' },
          ].map((s) => (
            <div key={s.n} className="flex gap-4">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0" style={{ background: 'var(--accent-gradient)', color: '#000' }}>{s.n}</span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card variant="glass" padding="normal">
          <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Последние сигналы</h3>
          {signals.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>Пока нет сигналов</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-auto custom-scrollbar">
              {signals.slice(0, 8).map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-sm py-2 px-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                  <span className="font-medium">{s.symbol}</span>
                  <Badge variant={s.direction === 'LONG' ? 'long' : 'short'}>{s.direction}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card variant="glass" padding="normal">
          <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Интеграции</h3>
          <ul className="space-y-3">
            {[
              { label: 'Bitget — биржа', active: true },
              { label: 'TradingView — графики', active: true },
              { label: 'Telegram — @clabx_bot', active: true },
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="w-2 h-2 rounded-full" style={{ background: item.active ? 'var(--accent)' : 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
