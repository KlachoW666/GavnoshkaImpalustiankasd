import { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { RiskDisclaimer } from '../components/RiskDisclaimer';
import { useTableSort } from '../utils/useTableSort';
import { SortableTh } from '../components/SortableTh';

const cardStyle = { background: 'var(--bg-card)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

interface Provider {
  providerId: string;
  username: string;
  totalPnl: number;
  wins: number;
  losses: number;
  subscribersCount: number;
}

interface Subscription {
  providerId: string;
  username: string;
  sizePercent: number;
  createdAt: string;
}

export default function CopyTradingPage() {
  const { token } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribeSize, setSubscribeSize] = useState<Record<string, number>>({});

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const fetchProviders = () => {
    api.get<{ providers: Provider[] }>('/copy-trading/providers', { headers })
      .then((r) => setProviders(r.providers ?? []))
      .catch(() => setProviders([]));
  };
  const fetchSubscriptions = () => {
    if (!token) return;
    api.get<{ subscriptions: Subscription[] }>('/copy-trading/subscriptions', { headers })
      .then((r) => setSubscriptions(r.subscriptions ?? []))
      .catch(() => setSubscriptions([]));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<{ providers: Provider[] }>('/copy-trading/providers', { headers }).then((r) => setProviders(r.providers ?? [])).catch(() => {}),
      token ? api.get<{ subscriptions: Subscription[] }>('/copy-trading/subscriptions', { headers }).then((r) => setSubscriptions(r.subscriptions ?? [])).catch(() => {}) : Promise.resolve()
    ]).finally(() => setLoading(false));
  }, [token]);

  const handleSubscribe = (providerId: string, sizePercent: number) => {
    api.post('/copy-trading/subscribe', { providerId, sizePercent }, { headers })
      .then(() => { fetchSubscriptions(); fetchProviders(); })
      .catch((e) => alert((e as Error).message || 'Ошибка подписки'));
  };
  const handleUnsubscribe = (providerId: string) => {
    api.post('/copy-trading/unsubscribe', { providerId }, { headers })
      .then(() => { fetchSubscriptions(); fetchProviders(); })
      .catch((e) => alert((e as Error).message || 'Ошибка отписки'));
  };

  const subscribedIds = new Set(subscriptions.map((s) => s.providerId));

  const providersCompare = useMemo(() => ({
    username: (a: Provider, b: Provider) => (a.username || '').localeCompare(b.username || ''),
    totalPnl: (a: Provider, b: Provider) => a.totalPnl - b.totalPnl,
    wins: (a: Provider, b: Provider) => a.wins - b.wins,
    losses: (a: Provider, b: Provider) => a.losses - b.losses,
    subscribersCount: (a: Provider, b: Provider) => a.subscribersCount - b.subscribersCount
  }), []);
  const { sortedItems: sortedProviders, sortKey, sortDir, toggleSort } = useTableSort(providers, providersCompare, 'totalPnl', 'desc');

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <RiskDisclaimer storageKey="trading" />
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Копитрейдинг</h1>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Подпишитесь на трейдера — его сделки будут копироваться на ваш счёт (доля от вашего баланса). Нужны API ключи OKX в профиле.
      </p>

      <section className="rounded-2xl p-6" style={cardStyle}>
        <h2 className="text-lg font-semibold mb-4">Мои подписки</h2>
        {!token ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Войдите, чтобы видеть подписки и подписываться на провайдеров.</p>
        ) : subscriptions.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Нет подписок. Выберите провайдера ниже.</p>
        ) : (
          <ul className="space-y-2">
            {subscriptions.map((s) => (
              <li key={s.providerId} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <span><strong>{s.username}</strong> — доля {s.sizePercent}%</span>
                <button
                  onClick={() => handleUnsubscribe(s.providerId)}
                  className="px-3 py-1 rounded-lg text-sm"
                  style={{ background: 'var(--danger)', color: 'white' }}
                >
                  Отписаться
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl p-6" style={cardStyle}>
        <h2 className="text-lg font-semibold mb-4">Провайдеры (топ по PnL)</h2>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl p-5 animate-pulse" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
                <div className="h-4 rounded w-1/3 mb-3" style={{ background: 'var(--bg-hover)' }} />
                <div className="h-3 rounded w-2/3 mb-2" style={{ background: 'var(--bg-hover)' }} />
                <div className="h-3 rounded w-1/2" style={{ background: 'var(--bg-hover)' }} />
              </div>
            ))}
          </div>
        ) : providers.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Пока нет провайдеров с подписчиками. Станьте первым — включите авто-торговлю, и другие смогут копировать ваши сделки.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}>
                  <SortableTh label="Трейдер" sortKey="username" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Суммарный PnL" sortKey="totalPnl" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="Плюс / Минус" sortKey="wins" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SortableTh label="Подписчиков" sortKey="subscribersCount" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <th className="text-right py-3 px-2 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Действие</th>
                </tr>
              </thead>
              <tbody>
                {sortedProviders.map((p) => (
                  <tr key={p.providerId} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 px-2 font-medium">{p.username}</td>
                    <td className={`text-right py-3 px-2 tabular-nums ${p.totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {p.totalPnl >= 0 ? '+' : ''}{p.totalPnl.toFixed(2)} $
                    </td>
                    <td className="text-right py-3 px-2 tabular-nums">{p.wins} / {p.losses}</td>
                    <td className="text-right py-3 px-2">{p.subscribersCount}</td>
                    <td className="py-3 px-2 text-right">
                      {subscribedIds.has(p.providerId) ? (
                        <button onClick={() => handleUnsubscribe(p.providerId)} className="px-3 py-1 rounded-lg text-sm" style={{ background: 'var(--danger)', color: 'white' }}>Отписаться</button>
                      ) : (
                        <>
                          <input
                            type="number"
                            min={5}
                            max={100}
                            value={subscribeSize[p.providerId] ?? 25}
                            onChange={(e) => setSubscribeSize((prev) => ({ ...prev, [p.providerId]: Number(e.target.value) }))}
                            className="w-14 px-1 py-0.5 rounded border mr-2 text-right"
                            style={{ borderColor: 'var(--border)' }}
                          />
                          %
                          <button
                            onClick={() => handleSubscribe(p.providerId, subscribeSize[p.providerId] ?? 25)}
                            className="ml-2 px-3 py-1 rounded-lg text-sm"
                            style={{ background: 'var(--accent)', color: 'white' }}
                          >
                            Подписаться
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
