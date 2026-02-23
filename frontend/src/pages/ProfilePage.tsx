import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { formatNum4, formatNum4Signed } from '../utils/formatNum';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface OkxBalanceState {
  real: number | null;
  realError: string | null;
  demo: number | null;
  demoError: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  const now = Date.now();
  if (end <= now) return 0;
  return Math.ceil((end - now) / (24 * 60 * 60 * 1000));
}

const hasWelcomeParam = () => {
  try {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('welcome') === '1';
  } catch {
    return false;
  }
};

export default function ProfilePage() {
  const { user, token, fetchMe } = useAuth();
  const [stats, setStats] = useState<{ orders: { total: number; wins: number; losses: number }; volumeEarned?: number } | null>(null);
  const [okxBalance, setOkxBalance] = useState<OkxBalanceState>({ real: null, realError: null, demo: null, demoError: null });
  const [activationKey, setActivationKey] = useState('');
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [keySuccess, setKeySuccess] = useState('');
  const [showWelcome] = useState(hasWelcomeParam);

  useEffect(() => {
    if (!token) {
      setStats(null);
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    api.get<{ orders: { total: number; wins: number; losses: number }; volumeEarned?: number }>('/auth/me/stats', { headers })
      .then(setStats)
      .catch(() => setStats(null));
    const id = setInterval(() => {
      api.get<{ orders: { total: number; wins: number; losses: number }; volumeEarned?: number }>('/auth/me/stats', { headers })
        .then(setStats)
        .catch(() => {});
    }, 60000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setOkxBalance({ real: null, realError: null, demo: null, demoError: null });
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      api.get<{ balance: number; balanceError?: string; useTestnet?: boolean }>('/trading/positions?useTestnet=false', { headers }).catch((e) => ({ balance: 0, balanceError: (e as Error).message })),
      api.get<{ balance: number; balanceError?: string; useTestnet?: boolean }>('/trading/positions?useTestnet=true', { headers }).catch((e) => ({ balance: 0, balanceError: (e as Error).message }))
    ]).then(([realRes, demoRes]) => {
      setOkxBalance({
        real: typeof (realRes as any).balance === 'number' ? (realRes as any).balance : null,
        realError: (realRes as any).balanceError || null,
        demo: typeof (demoRes as any).balance === 'number' ? (demoRes as any).balance : null,
        demoError: (demoRes as any).balanceError || null
      });
    });
    const id = setInterval(() => {
      Promise.all([
        api.get<{ balance: number; balanceError?: string }>('/trading/positions?useTestnet=false', { headers }).catch(() => ({ balance: 0 })),
        api.get<{ balance: number; balanceError?: string }>('/trading/positions?useTestnet=true', { headers }).catch(() => ({ balance: 0 }))
      ]).then(([realRes, demoRes]) => {
        setOkxBalance((prev) => ({
          ...prev,
          real: typeof (realRes as any).balance === 'number' ? (realRes as any).balance : prev.real,
          demo: typeof (demoRes as any).balance === 'number' ? (demoRes as any).balance : prev.demo
        }));
      });
    }, 60000);
    return () => clearInterval(id);
  }, [token]);

  const expiresAt = user?.activationExpiresAt ?? null;
  const active = !!user?.activationActive;
  const days = daysLeft(expiresAt);

  const onAddKey = async () => {
    const k = activationKey.trim();
    if (!k) {
      setKeyError('Введите ключ активации');
      return;
    }
    if (!token) return;
    setKeyError('');
    setKeySuccess('');
    setKeyLoading(true);
    try {
      const res = await api.post<{ ok: boolean; activationExpiresAt?: string; error?: string }>(
        '/auth/activate',
        { key: k },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setKeySuccess(res.activationExpiresAt ? `Ключ применён. Доступ до: ${formatDate(res.activationExpiresAt)}` : 'Ключ применён, доступ продлён.');
        setActivationKey('');
        await fetchMe();
      } else {
        setKeyError((res as any).error || 'Неверный или использованный ключ');
      }
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : 'Ошибка активации');
    } finally {
      setKeyLoading(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card-solid)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-lg)'
  };
  const miniCardStyle: React.CSSProperties = { background: 'var(--bg-hover)', borderRadius: 'var(--radius-lg)', padding: '12px' };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-page-in">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-gradient)', boxShadow: '0 8px 24px var(--accent-glow)' }}>
          <span className="text-2xl">👤</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Профиль</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Аккаунт, подписка и статистика</p>
        </div>
      </div>

      {showWelcome && !active && (
        <Card variant="premium" padding="normal">
          <p className="font-semibold mb-2">Добро пожаловать!</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Для доступа к PREMIUM приобретите ключ в Telegram-боте.</p>
          <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer">
            <Button variant="primary">@clabx_bot — приобрести ключ</Button>
          </a>
        </Card>
      )}

      <Card variant="glass" padding="normal">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">🪪</span>
          <div>
            <h2 className="text-lg font-bold">Аккаунт</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Идентификация и группа</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center py-2.5 px-4 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
            <span style={{ color: 'var(--text-muted)' }}>User ID</span>
            <span className="font-mono text-sm" style={{ color: 'var(--accent)' }}>{user?.id ?? '—'}</span>
          </div>
          <div className="flex justify-between items-center py-2.5 px-4 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Имя пользователя</span>
            <span className="font-medium">{user?.username ?? '—'}</span>
          </div>
          {user?.groupName && (
            <div className="flex justify-between items-center py-2.5 px-4 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Группа</span>
              <span className="badge-premium">{user.groupName.toLowerCase() === 'pro' ? 'PREMIUM' : user.groupName}</span>
            </div>
          )}
        </div>
      </Card>

      <Card variant="glass" padding="normal">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">💵</span>
          <div>
            <h2 className="text-lg font-bold">Баланс Bitget</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>USDT по ключам из настроек</p>
          </div>
        </div>
        {!token ? (
          <p className="text-sm py-6 text-center rounded-xl" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>Войдите в аккаунт</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Реальный счёт</p>
              {okxBalance.realError && okxBalance.real === null ? (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>{okxBalance.realError}</p>
              ) : okxBalance.real !== null ? (
                <p className="text-xl font-bold tabular-nums">{formatNum4(okxBalance.real)} USDT</p>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
              )}
            </div>
            <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Демо (Testnet)</p>
              {okxBalance.demoError && okxBalance.demo === null ? (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>{okxBalance.demoError}</p>
              ) : okxBalance.demo !== null ? (
                <p className="text-xl font-bold tabular-nums">{formatNum4(okxBalance.demo)} USDT</p>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card variant="success" padding="normal">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">⭐</span>
          <div>
            <h2 className="text-lg font-bold">Подписка</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Статус и продление</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 py-3 px-4 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
            <span className={`w-3 h-3 rounded-full ${active ? 'animate-pulse' : ''}`} style={{ background: active ? 'var(--success)' : 'var(--danger)' }} />
            <span style={{ color: active ? 'var(--success)' : 'var(--text-muted)' }}>{active ? 'Подписка активна' : 'Требуется активация'}</span>
          </div>
          {expiresAt && (
            <div className="py-3 px-4 rounded-xl space-y-1" style={{ background: 'var(--bg-hover)' }}>
              <p style={{ color: 'var(--text-muted)' }}>Действует до: <strong>{formatDate(expiresAt)}</strong></p>
              {days !== null && <p style={{ color: 'var(--accent)' }}>Осталось дней: <strong>{days}</strong></p>}
            </div>
          )}
          {!expiresAt && (
            <p className="py-3 px-4 rounded-xl text-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              Приобретите ключ у <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>@clabx_bot</a>
            </p>
          )}
          <div className="pt-4 mt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>Добавить ключ</p>
            <div className="flex gap-3">
              <input
                value={activationKey}
                onChange={(e) => { setActivationKey(e.target.value); setKeyError(''); setKeySuccess(''); }}
                placeholder="Ключ активации"
                className="input-field flex-1"
                disabled={keyLoading}
              />
              <Button variant="primary" onClick={onAddKey} loading={keyLoading} disabled={!token}>Добавить</Button>
            </div>
            {keyError && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{keyError}</p>}
            {keySuccess && <p className="text-sm mt-2" style={{ color: 'var(--success)' }}>{keySuccess}</p>}
          </div>
        </div>
      </Card>

      <Card variant="accent" padding="normal">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">📊</span>
          <div>
            <h2 className="text-lg font-bold">Статистика</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Закрытые сделки</p>
          </div>
        </div>
        {!token ? (
          <p className="text-sm py-6 text-center rounded-xl" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>Войдите для просмотра</p>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ордеров</p>
              <p className="text-xl font-bold tabular-nums mt-1">{stats.orders?.total || 0}</p>
            </div>
            <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>W / L</p>
              <p className="text-xl font-bold tabular-nums mt-1">
                <span style={{ color: 'var(--success)' }}>{stats.orders?.wins || 0}</span>
                <span style={{ color: 'var(--text-muted)' }}> / </span>
                <span style={{ color: 'var(--danger)' }}>{stats.orders?.losses || 0}</span>
              </p>
            </div>
            <div className="p-4 rounded-xl text-center col-span-2" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>PnL</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${Number(stats.volumeEarned) >= 0 ? 'text-gradient-success' : 'text-gradient-danger'}`}>
                {formatNum4Signed(Number(stats.volumeEarned) || 0)} $
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm py-6 text-center rounded-xl" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>Загрузка…</p>
        )}
      </Card>
    </div>
  );
}
