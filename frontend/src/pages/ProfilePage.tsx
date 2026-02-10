import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { api } from '../utils/api';

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

export default function ProfilePage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{ orders: { total: number; wins: number; losses: number }; volumeEarned?: number } | null>(null);

  useEffect(() => {
    api.get('/stats').then((data: any) => setStats(data)).catch(() => setStats(null));
  }, []);

  const expiresAt = user?.activationExpiresAt ?? null;
  const active = !!user?.activationActive;
  const days = daysLeft(expiresAt);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Профиль</h1>

      <div className="card p-6">
        <h2 className="section-title mb-4">Аккаунт</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt style={{ color: 'var(--text-muted)' }}>Имя пользователя</dt>
            <dd className="font-medium">{user?.username ?? '—'}</dd>
          </div>
          {user?.groupName && (
            <div className="flex justify-between gap-4">
              <dt style={{ color: 'var(--text-muted)' }}>Группа</dt>
              <dd>{user.groupName.toLowerCase() === 'pro' ? 'PREMIUM' : user.groupName}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="card p-6">
        <h2 className="section-title mb-4">Подписка</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${active ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--danger)]'}`}
            />
            <span style={{ color: active ? 'var(--success)' : 'var(--text-muted)' }}>
              {active ? 'Подписка активна' : 'Требуется активация ключа'}
            </span>
          </div>
          {expiresAt && (
            <>
              <p style={{ color: 'var(--text-muted)' }}>
                Действует до: <strong style={{ color: 'var(--text-primary)' }}>{formatDate(expiresAt)}</strong>
              </p>
              {days !== null && (
                <p style={{ color: 'var(--accent)' }}>
                  Осталось дней: <strong>{days}</strong>
                </p>
              )}
            </>
          )}
          {!expiresAt && (
            <p style={{ color: 'var(--text-muted)' }}>
              Активируйте ключ в разделе «Активировать» (если вкладка доступна) или приобретите ключ у{' '}
              <a href="https://t.me/clabx_bot" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                @clabx_bot
              </a>
              .
            </p>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="section-title mb-4">Статистика</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Общая статистика по закрытым сделкам в приложении (раздел «Авто»).
        </p>
        {stats ? (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Ордеров всего</dt>
              <dd className="text-lg font-bold mt-0.5">{stats.orders?.total ?? 0}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Прибыльных / Убыточных</dt>
              <dd className="text-lg font-bold mt-0.5">
                <span style={{ color: 'var(--success)' }}>+{stats.orders?.wins ?? 0}</span>
                <span style={{ color: 'var(--text-muted)' }}> / </span>
                <span style={{ color: 'var(--danger)' }}>-{stats.orders?.losses ?? 0}</span>
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Объём (PnL)</dt>
              <dd className={`text-lg font-bold mt-0.5 ${(stats.volumeEarned ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {(stats.volumeEarned ?? 0) >= 0 ? '+' : ''}{(stats.volumeEarned ?? 0).toFixed(2)} $
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
        )}
      </div>
    </div>
  );
}
