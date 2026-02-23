/**
 * Admin Copy Trading — управление провайдерами и заявками
 */

import { useState, useEffect } from 'react';
import { adminApi } from '../../utils/adminApi';

interface Transaction {
  id: number;
  user_id: string;
  username: string;
  type: 'deposit' | 'withdraw';
  amount_usdt: number;
  status: 'pending' | 'completed' | 'rejected';
  created_at: string;
  tx_hash?: string;
  withdraw_address?: string;
  admin_note?: string;
}

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
  fakePnl: number;
  fakeWinRate: number;
  fakeTrades: number;
  fakeSubscribers: number;
}

type Tab = 'pending' | 'providers';

interface EditStats {
  [key: string]: {
    fakePnl: string;
    fakeWinRate: string;
    fakeTrades: string;
    fakeSubscribers: string;
  };
}

export default function AdminCopyTrading() {
  const [tab, setTab] = useState<Tab>('pending');
  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [editStats, setEditStats] = useState<EditStats>({});
  const [savingStats, setSavingStats] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [pendingRes, providersRes] = await Promise.all([
        adminApi.get<{ transactions: Transaction[] }>('/copy-trading-api/admin/pending'),
        adminApi.get<{ providers: Provider[] }>('/copy-trading-api/providers')
      ]);
      setPendingTxs(pendingRes.transactions ?? []);
      setProviders(providersRes.providers ?? []);
      
      const initialEdit: EditStats = {};
      for (const p of providersRes.providers ?? []) {
        initialEdit[p.userId] = {
          fakePnl: String(p.fakePnl ?? 0),
          fakeWinRate: String(p.fakeWinRate ?? 0),
          fakeTrades: String(p.fakeTrades ?? 0),
          fakeSubscribers: String(p.fakeSubscribers ?? 0)
        };
      }
      setEditStats(initialEdit);
    } catch (e) {
      console.error('Fetch error:', e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApproveDeposit = async (txId: number) => {
    setProcessingId(txId);
    try {
      await adminApi.post(`/copy-trading-api/admin/deposits/${txId}/approve`, {});
      await fetchData();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectDeposit = async (txId: number) => {
    setProcessingId(txId);
    try {
      await adminApi.post(`/copy-trading-api/admin/deposits/${txId}/reject`, {});
      await fetchData();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveWithdraw = async (txId: number) => {
    setProcessingId(txId);
    try {
      await adminApi.post(`/copy-trading-api/admin/withdrawals/${txId}/approve`, {});
      await fetchData();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectWithdraw = async (txId: number) => {
    setProcessingId(txId);
    try {
      await adminApi.post(`/copy-trading-api/admin/withdrawals/${txId}/reject`, {});
      await fetchData();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddProvider = async () => {
    if (!addUsername.trim()) return;
    setLoading(true);
    try {
      const result = await adminApi.post<{ ok: boolean; providerId?: string; username?: string; error?: string }>('/copy-trading-api/admin/providers', { providerUserId: addUsername.trim() });
      if (result.ok) {
        alert(`Провайдер "${result.username || addUsername}" добавлен!`);
        setAddUsername('');
        await fetchData();
      } else {
        alert('Ошибка: ' + (result.error || 'Неизвестная ошибка'));
      }
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveProvider = async (userId: string) => {
    if (!confirm('Удалить провайдера?')) return;
    try {
      await adminApi.del('/copy-trading-api/admin/providers/' + userId);
      await fetchData();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    }
  };

  const handleSaveStats = async (userId: string) => {
    const stats = editStats[userId];
    if (!stats) {
      alert('Нет данных для сохранения');
      return;
    }
    
    setSavingStats(userId);
    try {
      const payload = {
        fake_pnl: parseFloat(stats.fakePnl) || 0,
        fake_win_rate: parseFloat(stats.fakeWinRate) || 0,
        fake_trades: parseInt(stats.fakeTrades) || 0,
        fake_subscribers: parseInt(stats.fakeSubscribers) || 0
      };
      console.log('Saving stats for', userId, payload);
      
      const result = await adminApi.patch<{ ok: boolean; stats: any }>(`/copy-trading-api/admin/providers/${encodeURIComponent(userId)}/stats`, payload);
      console.log('Save result:', result);
      
      if (result.ok) {
        alert('Статистика обновлена!');
        await fetchData();
      } else {
        alert('Ошибка: неожиданный ответ');
      }
    } catch (e) {
      console.error('Save stats error:', e);
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setSavingStats(null);
    }
  };

  const updateEditStat = (userId: string, field: string, value: string) => {
    setEditStats(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value
      }
    }));
  };

  const getDisplayStats = (p: Provider) => ({
    pnl: p.totalPnl + p.fakePnl,
    winRate: p.fakeWinRate > 0 ? p.fakeWinRate : p.winRate,
    trades: p.totalTrades + p.fakeTrades,
    subscribers: p.subscribersCount + p.fakeSubscribers
  });

  const cardStyle = {
    background: 'var(--bg-card-solid)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)'
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Копитрейдинг</h2>
      
      <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <button 
          onClick={() => setTab('pending')} 
          className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          style={{ 
            color: tab === 'pending' ? 'var(--accent)' : 'var(--text-muted)', 
            borderColor: tab === 'pending' ? 'var(--accent)' : 'transparent' 
          }}
        >
          Заявки {pendingTxs.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--danger)', color: '#fff' }}>
              {pendingTxs.length}
            </span>
          )}
        </button>
        <button 
          onClick={() => setTab('providers')} 
          className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          style={{ 
            color: tab === 'providers' ? 'var(--accent)' : 'var(--text-muted)', 
            borderColor: tab === 'providers' ? 'var(--accent)' : 'transparent' 
          }}
        >
          Провайдеры
        </button>
      </div>

      {tab === 'pending' && (
        <div className="space-y-4">
          {pendingTxs.length === 0 ? (
            <div className="text-center py-12 rounded-lg" style={cardStyle}>
              <p style={{ color: 'var(--text-muted)' }}>Нет заявок</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-card-solid)' }}>
                    <th className="py-3 px-3 text-left">Дата</th>
                    <th className="py-3 px-3 text-left">Пользователь</th>
                    <th className="py-3 px-3 text-left">Тип</th>
                    <th className="py-3 px-3 text-right">Сумма</th>
                    <th className="py-3 px-3 text-left">Адрес</th>
                    <th className="py-3 px-3 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingTxs.map(tx => (
                    <tr key={tx.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-3 px-3">{new Date(tx.created_at).toLocaleString('ru-RU')}</td>
                      <td className="py-3 px-3 font-medium">{tx.username}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-1 rounded text-xs" style={{ 
                          background: tx.type === 'deposit' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', 
                          color: tx.type === 'deposit' ? 'var(--success)' : 'var(--danger)' 
                        }}>
                          {tx.type === 'deposit' ? 'Депозит' : 'Вывод'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono">{tx.amount_usdt.toFixed(2)} USDT</td>
                      <td className="py-3 px-3">
                        {tx.type === 'withdraw' && tx.withdraw_address ? (
                          <code className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                            {tx.withdraw_address.length > 20 ? `${tx.withdraw_address.slice(0, 8)}...${tx.withdraw_address.slice(-8)}` : tx.withdraw_address}
                          </code>
                        ) : tx.type === 'deposit' && tx.tx_hash ? (
                          <code className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                            {tx.tx_hash.slice(0, 8)}...
                          </code>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => tx.type === 'deposit' ? handleApproveDeposit(tx.id) : handleApproveWithdraw(tx.id)} 
                            disabled={processingId === tx.id} 
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-50"
                            style={{ background: 'var(--success)', color: '#fff' }}
                          >
                            OK
                          </button>
                          <button 
                            onClick={() => tx.type === 'deposit' ? handleRejectDeposit(tx.id) : handleRejectWithdraw(tx.id)} 
                            disabled={processingId === tx.id} 
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-50"
                            style={{ background: 'var(--danger)', color: '#fff' }}
                          >
                            X
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'providers' && (
        <div className="space-y-6">
          <div className="flex gap-2">
            <input 
              type="text" 
              value={addUsername} 
              onChange={e => setAddUsername(e.target.value)} 
              placeholder="Логин пользователя для добавления" 
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <button 
              onClick={handleAddProvider} 
              disabled={loading || !addUsername.trim()} 
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {loading ? '...' : 'Добавить'}
            </button>
          </div>

          {providers.length === 0 ? (
            <div className="text-center py-12 rounded-lg" style={cardStyle}>
              <p style={{ color: 'var(--text-muted)' }}>Нет провайдеров</p>
            </div>
          ) : (
            <div className="space-y-4">
              {providers.map(p => {
                const display = getDisplayStats(p);
                return (
                  <div key={p.userId} className="rounded-lg p-4 space-y-4" style={cardStyle}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {p.displayName || p.username}
                        </h3>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>ID: {p.userId}</p>
                        {p.description && (
                          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{p.description}</p>
                        )}
                      </div>
                      <button 
                        onClick={() => handleRemoveProvider(p.userId)} 
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: 'var(--danger)', color: '#fff' }}
                      >
                        Удалить
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>PnL</p>
                        <p className={`text-lg font-bold font-mono ${display.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {display.pnl >= 0 ? '+' : ''}{display.pnl.toFixed(2)}
                        </p>
                      </div>
                      <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Win Rate</p>
                        <p className="text-lg font-bold font-mono" style={{ color: 'var(--accent)' }}>
                          {display.winRate.toFixed(1)}%
                        </p>
                      </div>
                      <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Сделок</p>
                        <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                          {display.trades}
                        </p>
                      </div>
                      <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Подписчиков</p>
                        <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                          {display.subscribers}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                        Накрутка статистики (фейк):
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>+PnL</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editStats[p.userId]?.fakePnl || '0'}
                            onChange={e => updateEditStat(p.userId, 'fakePnl', e.target.value)}
                            className="w-full px-2 py-1.5 rounded text-sm mt-1"
                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Win %</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={editStats[p.userId]?.fakeWinRate || '0'}
                            onChange={e => updateEditStat(p.userId, 'fakeWinRate', e.target.value)}
                            className="w-full px-2 py-1.5 rounded text-sm mt-1"
                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>+Сделок</label>
                          <input
                            type="number"
                            min="0"
                            value={editStats[p.userId]?.fakeTrades || '0'}
                            onChange={e => updateEditStat(p.userId, 'fakeTrades', e.target.value)}
                            className="w-full px-2 py-1.5 rounded text-sm mt-1"
                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>+Подписчиков</label>
                          <input
                            type="number"
                            min="0"
                            value={editStats[p.userId]?.fakeSubscribers || '0'}
                            onChange={e => updateEditStat(p.userId, 'fakeSubscribers', e.target.value)}
                            className="w-full px-2 py-1.5 rounded text-sm mt-1"
                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end mt-3">
                        <button
                          onClick={() => handleSaveStats(p.userId)}
                          disabled={savingStats === p.userId}
                          className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
                          style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                          {savingStats === p.userId ? 'Сохранение...' : 'Сохранить'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
