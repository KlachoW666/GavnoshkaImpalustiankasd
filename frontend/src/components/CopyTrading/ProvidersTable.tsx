/**
 * Providers Table — таблица провайдеров копитрейдинга
 */

import { useState, useEffect, useMemo } from 'react';
import { api } from '../../utils/api';
import { useTableSort } from '../../utils/useTableSort';
import { SortableTh } from '../SortableTh';

interface Provider {
  userId: string;
  username: string;
  displayName: string | null;
  description: string | null;
  enabled: boolean;
  totalPnl: number;
  wins: number;
  losses: number;
  winRate: number;
  subscribersCount: number;
  totalTrades: number;
  /** Фейковая накрутка — для синхронизации с админкой */
  fakePnl?: number;
  fakeWinRate?: number;
  fakeTrades?: number;
  fakeSubscribers?: number;
}

/** Итоговые показатели (реальные + фейк), как в админке — синхронизация везде */
function getDisplayStats(p: Provider) {
  return {
    pnl: p.totalPnl + (p.fakePnl ?? 0),
    winRate: (p.fakeWinRate != null && p.fakeWinRate > 0) ? p.fakeWinRate : p.winRate,
    trades: p.totalTrades + (p.fakeTrades ?? 0),
    subscribers: p.subscribersCount + (p.fakeSubscribers ?? 0)
  };
}

interface ProvidersTableProps {
  token: string | null;
  subscribedIds: Set<string>;
  onSubscribe: (providerId: string, sizePercent: number, profitSharePercent: number) => void;
  onUnsubscribe: (providerId: string) => void;
  onViewProfile: (providerId: string) => void;
}

export default function ProvidersTable({ 
  token, 
  subscribedIds, 
  onSubscribe, 
  onUnsubscribe,
  onViewProfile 
}: ProvidersTableProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribeSize, setSubscribeSize] = useState<Record<string, number>>({});
  const [profitShare, setProfitShare] = useState<Record<string, number>>({});

  useEffect(() => {
    setLoading(true);
    api.get<{ providers: Provider[] }>('/copy-trading-api/providers')
      .then(r => setProviders(r.providers ?? []))
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, [token]);

  const compareFns = useMemo(() => ({
    username: (a: Provider, b: Provider) => a.username.localeCompare(b.username),
    totalPnl: (a: Provider, b: Provider) => (getDisplayStats(a).pnl - getDisplayStats(b).pnl),
    winRate: (a: Provider, b: Provider) => (getDisplayStats(a).winRate - getDisplayStats(b).winRate),
    subscribersCount: (a: Provider, b: Provider) => (getDisplayStats(a).subscribers - getDisplayStats(b).subscribers),
    totalTrades: (a: Provider, b: Provider) => (getDisplayStats(a).trades - getDisplayStats(b).trades)
  }), []);

  const { sortedItems, sortKey, sortDir, toggleSort } = useTableSort(providers, compareFns, 'totalPnl', 'desc');

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--bg-hover)' }} />
        ))}
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="text-center py-12 rounded-lg" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Нет доступных провайдеров</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--bg-card-solid)' }}>
            <SortableTh label="Трейдер" sortKey="username" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableTh label="PnL" sortKey="totalPnl" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
            <SortableTh label="Win%" sortKey="winRate" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
            <SortableTh label="Сделок" sortKey="totalTrades" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
            <SortableTh label="Подписчиков" sortKey="subscribersCount" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
            <th className="py-3 px-3 text-right text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Действие</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((p) => {
            const isSubscribed = subscribedIds.has(p.userId);
            const display = getDisplayStats(p);
            return (
              <tr key={p.userId} className="border-b transition-colors hover:bg-[var(--bg-hover)]" style={{ borderColor: 'var(--border)' }}>
                <td className="py-3 px-3">
                  <button onClick={() => onViewProfile(p.userId)} className="flex items-center gap-2 hover:underline text-left">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                      {p.username[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.displayName || p.username}</p>
                    </div>
                  </button>
                </td>
                <td className={"py-3 px-3 text-right font-mono font-semibold " + (display.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>
                  {display.pnl >= 0 ? '+' : ''}{display.pnl.toFixed(2)} $
                </td>
                <td className={"py-3 px-3 text-right tabular-nums " + (display.winRate >= 60 ? 'text-[var(--success)]' : 'text-[var(--text-primary)]')}>
                  {display.winRate.toFixed(0)}%
                </td>
                <td className="py-3 px-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{display.trades}</td>
                <td className="py-3 px-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{display.subscribers}</td>
                <td className="py-3 px-3 text-right">
                  {isSubscribed ? (
                    <button onClick={() => onUnsubscribe(p.userId)} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: 'var(--danger)', color: '#fff' }}>Отписаться</button>
                  ) : (
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <input type="number" min={5} max={100} value={subscribeSize[p.userId] ?? 25} onChange={(e) => setSubscribeSize(prev => ({ ...prev, [p.userId]: Number(e.target.value) }))} className="w-14 px-2 py-1 rounded text-right text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} title="Размер позиции (%)" />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <input type="number" min={0} max={100} value={profitShare[p.userId] ?? 10} onChange={(e) => setProfitShare(prev => ({ ...prev, [p.userId]: Number(e.target.value) }))} className="w-12 px-2 py-1 rounded text-right text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} title="Доля прибыли трейдера (%)" />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>🎁</span>
                      </div>
                      <button onClick={() => onSubscribe(p.userId, subscribeSize[p.userId] ?? 25, profitShare[p.userId] ?? 10)} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>Подписаться</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
