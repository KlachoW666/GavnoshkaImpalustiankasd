import { useState, useEffect, useCallback } from 'react';
import { adminApi, clearAdminToken } from '../../utils/adminApi';

interface UserRow {
  id: string;
  username: string;
  groupId: number;
  groupName?: string;
  banned?: number;
  banReason?: string | null;
  createdAt: string;
  online?: boolean;
}

interface GroupRow {
  id: number;
  name: string;
  allowedTabs: string[];
}

interface UserDetail {
  id: string;
  username: string;
  groupId: number;
  groupName?: string;
  banned?: number;
  banReason?: string | null;
  createdAt: string;
  online?: boolean;
  activationExpiresAt: string | null;
  telegramId: string | null;
  totalPnl: number;
  ordersCount: number;
  orders: Array<{
    id: string;
    pair: string;
    direction: string;
    openPrice: number;
    closePrice: number | null;
    pnl: number | null;
    pnlPercent: number | null;
    openTime: string;
    closeTime: string | null;
    status: string;
  }>;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [extendDuration, setExtendDuration] = useState('');
  const [extendLoading, setExtendLoading] = useState(false);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const searchParam = debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : '';
      const [u, g] = await Promise.all([
        adminApi.get<UserRow[]>(`/admin/users${searchParam}`),
        adminApi.get<GroupRow[]>('/admin/groups')
      ]);
      setUsers(u);
      setGroups(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      if (String(e).includes('401')) clearAdminToken();
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  const fetchUserDetail = useCallback(async (userId: string) => {
    setDetailLoading(true);
    setUserDetail(null);
    try {
      const d = await adminApi.get<UserDetail>(`/admin/users/${userId}`);
      setUserDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const displayGroupName = (name: string | undefined) => {
    if (!name) return '';
    const lower = name.toLowerCase();
    if (lower === 'pro' || lower === 'premium') return 'PREMIUM';
    if (lower === 'user') return 'Пользователь';
    if (lower === 'admin') return 'Администратор';
    return name;
  };

  useEffect(() => {
    fetchData();
    const tid = setInterval(fetchData, 15000);
    return () => clearInterval(tid);
  }, [fetchData]);

  useEffect(() => {
    if (selectedUserId) fetchUserDetail(selectedUserId);
    else setUserDetail(null);
  }, [selectedUserId, fetchUserDetail]);

  const extendSubscription = async () => {
    if (!selectedUserId || !extendDuration.trim()) return;
    setExtendLoading(true);
    setError('');
    try {
      await adminApi.post(`/admin/users/${selectedUserId}/extend-subscription`, { duration: extendDuration.trim() });
      setExtendDuration('');
      await fetchUserDetail(selectedUserId);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка продления');
    } finally {
      setExtendLoading(false);
    }
  };

  const changeGroup = async (userId: string, groupId: number) => {
    setUpdating(userId);
    setError('');
    try {
      await adminApi.put(`/admin/users/${userId}`, { groupId });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, groupId, groupName: groups.find((g) => g.id === groupId)?.name } : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setUpdating(null);
    }
  };

  const toggleBan = async (userId: string, isBanned: boolean) => {
    if (isBanned) {
      if (!window.confirm('Разблокировать этого пользователя?')) return;
    } else {
      if (!window.confirm('Заблокировать этого пользователя?')) return;
    }
    setUpdating(userId);
    setError('');
    try {
      if (isBanned) {
        await adminApi.post(`/admin/users/${userId}/unban`, {});
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, banned: 0, banReason: null } : u)));
      } else {
        await adminApi.post(`/admin/users/${userId}/ban`, { reason: 'Нарушение правил' });
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, banned: 1, banReason: 'Нарушение правил' } : u)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setUpdating(null);
    }
  };

  const deleteUser = async (userId: string) => {
    const u = users.find((x) => x.id === userId);
    if (!window.confirm(`Удалить пользователя ${u?.username ?? userId}? Это действие нельзя отменить.`)) return;
    setUpdating(userId);
    setError('');
    try {
      await adminApi.del(`/admin/users/${userId}`);
      setUsers((prev) => prev.filter((x) => x.id !== userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h2 className="text-xl font-bold tracking-tight">Пользователи и группы (Super-Admin)</h2>

      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Поиск (user_id, ник, Telegram ID):
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Введите для поиска..."
            className="input-field w-56"
          />
        </label>
      </div>

      {error && (
        <div className="p-4 rounded-xl border" style={{ background: 'var(--danger-dim)', borderColor: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
              <th className="text-left p-3">Логин</th>
              <th className="text-left p-3">Группа</th>
              <th className="text-left p-3">Статус</th>
              <th className="text-left p-3">Дата</th>
              <th className="text-left p-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                style={{ borderColor: 'var(--border)' }}
                className="border-t cursor-pointer hover:opacity-90"
                onClick={() => setSelectedUserId(u.id)}
              >
                <td className="p-3 font-medium" style={{ color: 'var(--accent)' }}>{u.username}</td>
                <td className="p-3">
                  <select
                    value={u.groupId}
                    onChange={(e) => changeGroup(u.id, Number(e.target.value))}
                    disabled={updating === u.id}
                    className="input-field py-1.5 text-sm"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{displayGroupName(g.name)}</option>
                    ))}
                  </select>
                </td>
                <td className="p-3">
                  {(u.banned ?? 0) === 1 ? (
                    <span className="px-2 py-1 rounded text-xs font-medium" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>
                      Заблокирован
                    </span>
                  ) : u.online ? (
                    <span className="px-2 py-1 rounded text-xs font-medium flex items-center gap-1" style={{ background: 'var(--success-dim)', color: 'var(--success)' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                      Онлайн
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded text-xs font-medium" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                      Офлайн
                    </span>
                  )}
                </td>
                <td className="p-3" style={{ color: 'var(--text-muted)' }}>{new Date(u.createdAt).toLocaleString('ru-RU')}</td>
                <td className="p-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => toggleBan(u.id, (u.banned ?? 0) === 1)}
                    disabled={updating === u.id}
                    className={`px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50 ${
                      (u.banned ?? 0) === 1
                        ? 'hover:brightness-110'
                        : ''
                    }`}
                    style={(u.banned ?? 0) === 1 ? { background: 'var(--success-dim)', color: 'var(--success)' } : { background: 'var(--danger-dim)', color: 'var(--danger)' }}
                  >
                    {(u.banned ?? 0) === 1 ? 'Разблокировать' : 'Заблокировать'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteUser(u.id)}
                    disabled={updating === u.id}
                    className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                    style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>Нет пользователей</p>
        )}
      </div>

      {/* Детали пользователя */}
      {selectedUserId && (
        <div className="rounded-xl border-2 p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--accent)' }}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">Карточка пользователя</h3>
            <button
              type="button"
              onClick={() => { setSelectedUserId(null); setUserDetail(null); setExtendDuration(''); }}
              className="px-3 py-1.5 rounded text-sm"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              Закрыть
            </button>
          </div>
          {detailLoading ? (
            <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
          ) : userDetail ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div><span style={{ color: 'var(--text-muted)' }}>User ID:</span> <code className="ml-1">{userDetail.id}</code></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Логин:</span> <strong>{userDetail.username}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Telegram ID:</span> {userDetail.telegramId ?? '—'}</div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Подписка до:</span>{' '}
                  {userDetail.activationExpiresAt
                    ? new Date(userDetail.activationExpiresAt).toLocaleString('ru-RU')
                    : 'не активирована'}
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Прибыль (PnL):</span>{' '}
                  <span style={{ color: userDetail.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {userDetail.totalPnl >= 0 ? '+' : ''}{userDetail.totalPnl.toFixed(2)} $
                  </span>
                </div>
                <div><span style={{ color: 'var(--text-muted)' }}>Сделок:</span> {userDetail.ordersCount}</div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Добавить время подписки</h4>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Формат: 1h (час), 99d (дней), 30m (минут). Примеры: 1h, 7d, 99d</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    value={extendDuration}
                    onChange={(e) => setExtendDuration(e.target.value)}
                    placeholder="1h или 99d"
                    className="input-field w-32"
                  />
                  <button
                    type="button"
                    onClick={extendSubscription}
                    disabled={extendLoading || !extendDuration.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    {extendLoading ? '…' : 'Добавить'}
                  </button>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Ордера (последние 100)</h4>
                {userDetail.orders.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Нет сделок</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
                          <th className="text-left p-2">Пара</th>
                          <th className="text-left p-2">Направление</th>
                          <th className="text-left p-2">Открытие</th>
                          <th className="text-left p-2">Закрытие</th>
                          <th className="text-right p-2">PnL</th>
                          <th className="text-left p-2">Дата</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetail.orders.map((o) => (
                          <tr key={o.id} style={{ borderColor: 'var(--border)' }} className="border-t">
                            <td className="p-2">{o.pair}</td>
                            <td className="p-2" style={{ color: o.direction === 'LONG' ? 'var(--success)' : 'var(--danger)' }}>{o.direction}</td>
                            <td className="p-2">{o.openPrice}</td>
                            <td className="p-2">{o.closePrice ?? '—'}</td>
                            <td className="p-2 text-right" style={{ color: (o.pnl ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {(o.pnl ?? 0) >= 0 ? '+' : ''}{(o.pnl ?? 0).toFixed(2)}
                            </td>
                            <td className="p-2" style={{ color: 'var(--text-muted)' }}>{o.closeTime ? new Date(o.closeTime).toLocaleString('ru-RU') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
