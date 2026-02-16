import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useNavigation } from '../contexts/NavigationContext';

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)'
};

interface TraderProfile {
  userId: string;
  username: string;
  totalPnl: number;
  wins: number;
  losses: number;
  trades: number;
  winRate: number;
  isProvider: boolean;
}

interface TraderProfilePageProps {
  traderId: string | null;
  onBackToSocial: () => void;
}

export default function TraderProfilePage({ traderId, onBackToSocial }: TraderProfilePageProps) {
  const { navigateTo } = useNavigation();
  const [profile, setProfile] = useState<TraderProfile | null>(null);
  const [loading, setLoading] = useState(!!traderId);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!traderId) {
      setProfile(null);
      setLoading(false);
      setError('Не указан трейдер');
      return;
    }
    setLoading(true);
    setError('');
    api
      .get<TraderProfile>(`/social/user/${encodeURIComponent(traderId)}`)
      .then(setProfile)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить профиль');
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [traderId]);

  if (!traderId) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p style={{ color: 'var(--text-muted)' }}>Не указан трейдер.</p>
        <button
          type="button"
          onClick={onBackToSocial}
          className="mt-4 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
        >
          ← К рейтингу
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p style={{ color: 'var(--text-muted)' }}>Загрузка профиля…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <p style={{ color: 'var(--danger)' }}>{error || 'Профиль не найден'}</p>
        <button
          type="button"
          onClick={onBackToSocial}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
        >
          ← К рейтингу
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      <button
        type="button"
        onClick={onBackToSocial}
        className="flex items-center gap-2 text-sm font-medium hover:opacity-90 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      >
        ← Назад к рейтингу
      </button>

      <section className="rounded-2xl p-6 shadow-lg border-l-4" style={{ ...cardStyle, borderLeftColor: 'var(--accent)' }}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold" style={{ background: 'var(--accent)', color: 'white' }}>
            {profile.username.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{profile.username}</h1>
            {profile.isProvider && (
              <span className="inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                Провайдер копитрейдинга
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-hover)' }}>
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>PnL</p>
            <p className={`text-xl font-bold tabular-nums ${profile.totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {profile.totalPnl >= 0 ? '+' : ''}{profile.totalPnl.toFixed(2)} $
            </p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-hover)' }}>
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Сделок</p>
            <p className="text-xl font-bold tabular-nums">{profile.trades}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-hover)' }}>
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Winrate</p>
            <p className="text-xl font-bold tabular-nums">{profile.winRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-hover)' }}>
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Прибыльных / убыточных</p>
            <p className="text-lg font-bold tabular-nums">
              <span style={{ color: 'var(--success)' }}>{profile.wins}+</span>
              <span style={{ color: 'var(--text-muted)' }}> / </span>
              <span style={{ color: 'var(--danger)' }}>{profile.losses}-</span>
            </p>
          </div>
        </div>

        {profile.isProvider && (
          <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={() => navigateTo('copy')}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              Подписаться на копирование сделок
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
