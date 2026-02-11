import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { formatNum4, formatNum4Signed } from '../utils/formatNum';

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
    }, 20000);
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

  const cardStyle = {
    background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  };
  const miniCardStyle = { background: 'var(--bg-hover)' };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">👤</span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Профиль</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Аккаунт, подписка и статистика</p>
        </div>
      </div>

      {showWelcome && !active && (
        <div className="rounded-2xl p-6 shadow-lg border-l-4" style={{ ...cardStyle, borderLeftColor: 'var(--accent)' }}>
          <p className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Добро пожаловать!</p>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            Для получения доступа к PREMIUM-версии необходимо приобрести ключ в нашем Telegram-боте.
          </p>
          <a
            href="https://t.me/clabx_bot"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            @clabx_bot — приобрести ключ
          </a>
        </div>
      )}

      <div className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">🪪</span>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Аккаунт</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Идентификация и группа</p>
          </div>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between items-center gap-4 py-2 px-3 rounded-xl" style={miniCardStyle}>
            <dt style={{ color: 'var(--text-muted)' }}>User ID</dt>
            <dd className="font-mono text-xs truncate max-w-[60%]" style={{ color: 'var(--accent)' }} title={user?.id ?? ''}>{user?.id ?? '—'}</dd>
          </div>
          <div className="flex justify-between items-center gap-4 py-2 px-3 rounded-xl" style={miniCardStyle}>
            <dt style={{ color: 'var(--text-muted)' }}>Имя пользователя</dt>
            <dd className="font-medium" style={{ color: 'var(--text-primary)' }}>{user?.username ?? '—'}</dd>
          </div>
          {user?.groupName && (
            <div className="flex justify-between items-center gap-4 py-2 px-3 rounded-xl" style={miniCardStyle}>
              <dt style={{ color: 'var(--text-muted)' }}>Группа</dt>
              <dd style={{ color: 'var(--text-primary)' }}>{user.groupName.toLowerCase() === 'pro' ? 'PREMIUM' : user.groupName}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">⭐</span>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Подписка</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Статус и продление ключом</p>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 py-2 px-3 rounded-xl" style={miniCardStyle}>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--danger)]'}`}
            />
            <span style={{ color: active ? 'var(--success)' : 'var(--text-muted)' }}>
              {active ? 'Подписка активна' : 'Требуется активация ключа'}
            </span>
          </div>
          {expiresAt && (
            <div className="space-y-1 py-2 px-3 rounded-xl" style={miniCardStyle}>
              <p style={{ color: 'var(--text-muted)' }}>
                Действует до: <strong style={{ color: 'var(--text-primary)' }}>{formatDate(expiresAt)}</strong>
              </p>
              {days !== null && (
                <p style={{ color: 'var(--accent)' }}>
                  Осталось дней: <strong>{days}</strong>
                </p>
              )}
            </div>
          )}
          {!expiresAt && (
            <p className="py-2 px-3 rounded-xl text-sm" style={{ ...miniCardStyle, color: 'var(--text-muted)' }}>
              Введите ключ ниже или приобретите у{' '}
              <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                @clabx_bot
              </a>
              .
            </p>
          )}
          <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Добавить ключ (доступ плюсуется к текущему)</p>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                value={activationKey}
                onChange={(e) => { setActivationKey(e.target.value); setKeyError(''); setKeySuccess(''); }}
                placeholder="Ключ активации"
                className="input-field flex-1 min-w-[180px]"
                autoComplete="off"
                disabled={keyLoading}
              />
              <button
                type="button"
                onClick={onAddKey}
                disabled={keyLoading || !token}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 shrink-0"
                style={{ background: 'var(--accent)' }}
              >
                {keyLoading ? '…' : 'Добавить ключ'}
              </button>
            </div>
            {keyError && <p className="text-sm mt-2" style={{ color: 'var(--danger)' }}>{keyError}</p>}
            {keySuccess && <p className="text-sm mt-2" style={{ color: 'var(--success)' }}>{keySuccess}</p>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">📊</span>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Статистика</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Закрытые сделки в разделе «Авто»</p>
          </div>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Ордера, открытые ботом на OKX, и закрытые в приложении или на бирже (данные обновляются автоматически).
        </p>
        {!token ? (
          <p className="text-sm py-4 rounded-xl text-center" style={{ ...miniCardStyle, color: 'var(--text-muted)' }}>Войдите в аккаунт для просмотра статистики.</p>
        ) : stats ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl p-3 text-center" style={miniCardStyle}>
              <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>Ордеров всего</dt>
              <dd className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>{Number(stats.orders?.total) || 0}</dd>
            </div>
            <div className="rounded-xl p-3 text-center" style={miniCardStyle}>
              <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>Прибыльных / Убыточных</dt>
              <dd className="text-lg font-bold mt-0.5 tabular-nums">
                <span style={{ color: 'var(--success)' }}>{formatNum4Signed(Number(stats.orders?.wins) || 0)}</span>
                <span style={{ color: 'var(--text-muted)' }}> / </span>
                <span style={{ color: 'var(--danger)' }}>-{formatNum4(Number(stats.orders?.losses) || 0)}</span>
              </dd>
            </div>
            <div className="rounded-xl p-3 text-center col-span-2" style={miniCardStyle}>
              <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>Объём (PnL)</dt>
              <dd className={`text-xl font-bold mt-0.5 tabular-nums ${(Number(stats.volumeEarned) || 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {formatNum4Signed(Number(stats.volumeEarned) || 0)} $
              </dd>
            </div>
            <p className="col-span-2 text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Прибыльных, убыточных и объём — по закрытым сделкам. При 0 закрытых значения будут +0,0000 / -0,0000 и +0,0000 $.
            </p>
          </dl>
        ) : (
          <p className="text-sm py-4 rounded-xl text-center" style={{ ...miniCardStyle, color: 'var(--text-muted)' }}>Загрузка…</p>
        )}
      </div>
    </div>
  );
}
