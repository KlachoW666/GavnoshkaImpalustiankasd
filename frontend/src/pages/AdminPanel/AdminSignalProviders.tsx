/**
 * Admin Signal Providers — управление фейк-провайдерами (боты с высокой статистикой)
 */

import { useState, useEffect } from 'react';
import { adminApi } from '../../utils/adminApi';

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
  isBot?: boolean;
  avatar?: string;
}

interface EditStats {
  [key: string]: {
    displayName: string;
    description: string;
    fakePnl: string;
    fakeWinRate: string;
    fakeTrades: string;
    fakeSubscribers: string;
  };
}

const BOT_NAMES = [
  'CryptoWhale', 'AlphaTrader', 'MoonHunter', 'BitMaster', 'DegenKing',
  'SatoshiPro', 'BullRider', 'AltcoinGuru', 'DefiWizard', 'NftFlipper',
  'FuturesKing', 'ScalpMaster', 'TrendRider', 'ProfitHunter', 'ChainBreaker'
];

const BOT_AVATARS = ['🤖', '📈', '💰', '🚀', '💎', '🔥', '⚡', '🌟', '🎯', '🏆'];

export default function AdminSignalProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [editStats, setEditStats] = useState<EditStats>({});
  const [savingStats, setSavingStats] = useState<string | null>(null);
  const [showCreateBot, setShowCreateBot] = useState(false);
  const [newBot, setNewBot] = useState({
    name: '',
    pnl: '15000',
    winRate: '85',
    trades: '250',
    subscribers: '500'
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await adminApi.get<{ providers: Provider[] }>('/copy-trading-api/providers');
      setProviders(res.providers ?? []);
      
      const initialEdit: EditStats = {};
      for (const p of res.providers ?? []) {
        initialEdit[p.userId] = {
          displayName: p.displayName || '',
          description: p.description || '',
          fakePnl: String(p.fakePnl ?? 0),
          fakeWinRate: String(p.fakeWinRate ?? 0),
          fakeTrades: String(p.fakeTrades ?? 0),
          fakeSubscribers: String(p.fakeSubscribers ?? 0)
        };
      }
      setEditStats(initialEdit);
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const generateBotName = () => {
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const suffix = Math.floor(Math.random() * 999);
    return `${name}${suffix}`;
  };

  const handleCreateBot = async () => {
    const name = newBot.name.trim() || generateBotName();
    setLoading(true);
    try {
      const createRes = await adminApi.post<{ ok: boolean; providerId?: string; error?: string }>('/copy-trading-api/admin/providers', { 
        providerUserId: name, 
        isBot: true 
      });
      
      if (createRes.ok && createRes.providerId) {
        await adminApi.patch(`/copy-trading-api/admin/providers/${encodeURIComponent(createRes.providerId)}/stats`, {
          fake_pnl: parseFloat(newBot.pnl) || 0,
          fake_win_rate: parseFloat(newBot.winRate) || 0,
          fake_trades: parseInt(newBot.trades) || 0,
          fake_subscribers: parseInt(newBot.subscribers) || 0
        });
        
        setNewBot({ name: '', pnl: '15000', winRate: '85', trades: '250', subscribers: '500' });
        setShowCreateBot(false);
        await fetchData();
      } else {
        alert('Ошибка: ' + (createRes.error || 'Не удалось создать бота'));
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
    if (!stats) return;
    
    setSavingStats(userId);
    try {
      if (stats.displayName || stats.description) {
        await adminApi.put(`/copy-trading-api/admin/providers/${encodeURIComponent(userId)}`, {
          displayName: stats.displayName,
          description: stats.description
        });
      }
      
      await adminApi.patch(`/copy-trading-api/admin/providers/${encodeURIComponent(userId)}/stats`, {
        fake_pnl: parseFloat(stats.fakePnl) || 0,
        fake_win_rate: parseFloat(stats.fakeWinRate) || 0,
        fake_trades: parseInt(stats.fakeTrades) || 0,
        fake_subscribers: parseInt(stats.fakeSubscribers) || 0
      });
      
      await fetchData();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setSavingStats(null);
    }
  };

  const updateEditStat = (userId: string, field: string, value: string) => {
    setEditStats(prev => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value }
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Провайдеры сигналов</h2>
        <button
          onClick={() => setShowCreateBot(!showCreateBot)}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          + Создать бота
        </button>
      </div>

      {showCreateBot && (
        <div className="rounded-lg p-4" style={cardStyle}>
          <h3 className="font-medium mb-4" style={{ color: 'var(--text-primary)' }}>Создать фейк-бота</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Имя (пусто = авто)</label>
              <input
                type="text"
                value={newBot.name}
                onChange={e => setNewBot({ ...newBot, name: e.target.value })}
                placeholder={generateBotName()}
                className="w-full px-2 py-2 rounded text-sm mt-1"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>PnL (USDT)</label>
              <input
                type="number"
                value={newBot.pnl}
                onChange={e => setNewBot({ ...newBot, pnl: e.target.value })}
                className="w-full px-2 py-2 rounded text-sm mt-1"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Win Rate %</label>
              <input
                type="number"
                min="0"
                max="100"
                value={newBot.winRate}
                onChange={e => setNewBot({ ...newBot, winRate: e.target.value })}
                className="w-full px-2 py-2 rounded text-sm mt-1"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Кол-во сделок</label>
              <input
                type="number"
                value={newBot.trades}
                onChange={e => setNewBot({ ...newBot, trades: e.target.value })}
                className="w-full px-2 py-2 rounded text-sm mt-1"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Подписчиков</label>
              <input
                type="number"
                value={newBot.subscribers}
                onChange={e => setNewBot({ ...newBot, subscribers: e.target.value })}
                className="w-full px-2 py-2 rounded text-sm mt-1"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleCreateBot}
                disabled={loading}
                className="w-full px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--success)', color: '#fff' }}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && providers.length === 0 ? (
        <div className="text-center py-12 rounded-lg" style={cardStyle}>
          <p style={{ color: 'var(--text-muted)' }}>Загрузка...</p>
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12 rounded-lg" style={cardStyle}>
          <p style={{ color: 'var(--text-muted)' }}>Нет провайдеров. Создайте первого бота!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {providers.map(p => {
            const display = getDisplayStats(p);
            const avatar = BOT_AVATARS[providers.indexOf(p) % BOT_AVATARS.length];
            
            return (
              <div key={p.userId} className="rounded-lg p-4 space-y-3" style={cardStyle}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                      style={{ background: 'var(--accent-dim)' }}
                    >
                      {avatar}
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {p.displayName || p.username}
                      </h3>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>ID: {p.userId}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRemoveProvider(p.userId)} 
                    className="px-2 py-1 rounded text-xs"
                    style={{ background: 'var(--danger)', color: '#fff' }}
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div className="px-2 py-2 rounded text-center" style={{ background: 'var(--bg-hover)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>PnL</p>
                    <p className={`text-sm font-bold font-mono ${display.pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {display.pnl >= 0 ? '+' : ''}{(display.pnl / 1000).toFixed(1)}K
                    </p>
                  </div>
                  <div className="px-2 py-2 rounded text-center" style={{ background: 'var(--bg-hover)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Win</p>
                    <p className="text-sm font-bold font-mono" style={{ color: 'var(--accent)' }}>
                      {display.winRate.toFixed(0)}%
                    </p>
                  </div>
                  <div className="px-2 py-2 rounded text-center" style={{ background: 'var(--bg-hover)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Сделок</p>
                    <p className="text-sm font-bold font-mono">{display.trades}</p>
                  </div>
                  <div className="px-2 py-2 rounded text-center" style={{ background: 'var(--bg-hover)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Подп.</p>
                    <p className="text-sm font-bold font-mono">{display.subscribers}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Имя</label>
                    <input
                      type="text"
                      value={editStats[p.userId]?.displayName || ''}
                      onChange={e => updateEditStat(p.userId, 'displayName', e.target.value)}
                      className="w-full px-2 py-1.5 rounded text-xs mt-0.5"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>PnL</label>
                    <input
                      type="number"
                      value={editStats[p.userId]?.fakePnl || '0'}
                      onChange={e => updateEditStat(p.userId, 'fakePnl', e.target.value)}
                      className="w-full px-2 py-1.5 rounded text-xs mt-0.5"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Win %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editStats[p.userId]?.fakeWinRate || '0'}
                      onChange={e => updateEditStat(p.userId, 'fakeWinRate', e.target.value)}
                      className="w-full px-2 py-1.5 rounded text-xs mt-0.5"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Сделок</label>
                    <input
                      type="number"
                      value={editStats[p.userId]?.fakeTrades || '0'}
                      onChange={e => updateEditStat(p.userId, 'fakeTrades', e.target.value)}
                      className="w-full px-2 py-1.5 rounded text-xs mt-0.5"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Подписчиков</label>
                    <input
                      type="number"
                      value={editStats[p.userId]?.fakeSubscribers || '0'}
                      onChange={e => updateEditStat(p.userId, 'fakeSubscribers', e.target.value)}
                      className="w-full px-2 py-1.5 rounded text-xs mt-0.5"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => handleSaveStats(p.userId)}
                      disabled={savingStats === p.userId}
                      className="w-full px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      {savingStats === p.userId ? '...' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
