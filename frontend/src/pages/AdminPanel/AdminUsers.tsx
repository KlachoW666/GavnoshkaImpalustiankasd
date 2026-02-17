import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminApi, clearAdminToken } from '../../utils/adminApi';
import { formatNum4, formatNum4Signed } from '../../utils/formatNum';
import { useTableSort } from '../../utils/useTableSort';
import { SortableTh } from '../../components/SortableTh';

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
  balance?: number;
  okxBalance: number | null;
  okxBalanceError: string | null;
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
  const [detailError, setDetailError] = useState<string | null>(null);
  const [extendDuration, setExtendDuration] = useState('');
  const [extendLoading, setExtendLoading] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [patchLoading, setPatchLoading] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceLoading, setBalanceLoading] = useState(false);

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
      const msg = e instanceof Error ? e.message : 'Ошибка загрузки';
      setError(msg === 'Failed to fetch' ? 'Нет связи с сервером. Проверьте адрес API и сеть.' : msg);
      if (String(e).includes('401')) clearAdminToken();
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  const fetchUserDetail = useCallback(async (userId: string) => {
    setDetailLoading(true);
    setUserDetail(null);
    setDetailError(null);
    try {
      const d = await adminApi.get<UserDetail>(`/admin/users/${userId}`);
      setUserDetail(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка загрузки';
      setDetailError(msg === 'Failed to fetch' ? 'Нет связи с сервером. Проверьте адрес API и сеть.' : msg);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const usersCompare = useMemo(() => ({
    username: (a: UserRow, b: UserRow) => (a.username || '').localeCompare(b.username || ''),
    groupId: (a: UserRow, b: UserRow) => a.groupId - b.groupId,
    createdAt: (a: UserRow, b: UserRow) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  }), []);
  const { sortedItems: sortedUsers, sortKey, sortDir, toggleSort } = useTableSort(users, usersCompare, 'createdAt', 'desc');

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
    if (selectedUserId) {
      fetchUserDetail(selectedUserId);
      setEditUsername('');
      setEditPassword('');
    } else setUserDetail(null);
  }, [selectedUserId, fetchUserDetail]);

  useEffect(() => {
    if (!selectedUserId) return;
    const id = setInterval(() => fetchUserDetail(selectedUserId), 15000);
    return () => clearInterval(id);
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

  const revokeSubscription = async () => {
    if (!selectedUserId || !window.confirm('Отменить подписку у этого пользователя?')) return;
    setRevokeLoading(true);
    setError('');
    try {
      await adminApi.post(`/admin/users/${selectedUserId}/revoke-subscription`, {});
      await fetchUserDetail(selectedUserId);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отмены подписки');
    } finally {
      setRevokeLoading(false);
    }
  };

  const adjustBalance = async (operation: 'add' | 'subtract') => {
    if (!selectedUserId) return;
    const amount = parseFloat(balanceAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Укажите положительную сумму');
      return;
    }
    setBalanceLoading(true);
    setError('');
    try {
      await adminApi.post(`/admin/users/${selectedUserId}/balance`, { operation, amount });
      setBalanceAmount('');
      await fetchUserDetail(selectedUserId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка изменения баланса');
    } finally {
      setBalanceLoading(false);
    }
  };

  const patchUser = async () => {
    if (!selectedUserId) return;
    if (!editUsername.trim() && !editPassword.trim()) return;
    if (editUsername.trim().length > 0 && editUsername.trim().length < 2) {
      setError('Логин от 2 символов');
      return;
    }
    if (editPassword.length > 0 && editPassword.length < 4) {
      setError('Пароль от 4 символов');
      return;
    }
    setPatchLoading(true);
    setError('');
    try {
      await adminApi.patch(`/admin/users/${selectedUserId}`, {
        ...(editUsername.trim().length >= 2 ? { username: editUsername.trim() } : {}),
        ...(editPassword.length >= 4 ? { password: editPassword } : {})
      });
      setEditUsername('');
      setEditPassword('');
      await fetchUserDetail(selectedUserId);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setPatchLoading(false);
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

  const cardStyle = {
    background: 'var(--bg-card)',
    backdropFilter: 'blur(12px)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    color: 'var(--text-primary)'
  };
  const miniCardStyle = { background: 'var(--bg-hover)' };

  const openProfile = (userId: string) => setSelectedUserId(userId);
  const closeProfile = () => {
    setSelectedUserId(null);
    setUserDetail(null);
    setDetailError(null);
    setExtendDuration('');
  };

  // Режим просмотра профиля: при выборе пользователя показываем только страницу профиля
  if (selectedUserId) {
    return (
      <div className="space-y-6 max-w-5xl">
        <button
          type="button"
          onClick={closeProfile}
          className="flex items-center gap-2 text-sm font-medium rounded-lg px-4 py-2 transition-opacity hover:opacity-90"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
        >
          ← К списку пользователей
        </button>

        <section className="rounded-lg p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👤</span>
              <div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Профиль пользователя</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Редактирование логина, пароля, подписки и ордера</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeProfile}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
            >
              Закрыть
            </button>
          </div>
          {detailLoading ? (
            <div className="py-12 text-center" style={{ color: 'var(--text-muted)' }}>Загрузка…</div>
          ) : detailError ? (
            <div className="py-8 text-center">
              <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{detailError}</p>
              <button
                type="button"
                onClick={() => selectedUserId && fetchUserDetail(selectedUserId)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Повторить
              </button>
            </div>
          ) : userDetail ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-lg p-4" style={miniCardStyle}>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>User ID</p>
                  <p className="text-sm font-mono truncate" style={{ color: 'var(--text-primary)' }}>{userDetail.id}</p>
                </div>
                <div className="rounded-lg p-4" style={miniCardStyle}>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Логин</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{userDetail.username}</p>
                </div>
                <div className="rounded-lg p-4" style={miniCardStyle}>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Telegram ID</p>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{userDetail.telegramId ?? '—'}</p>
                </div>
                <div className="rounded-lg p-4" style={miniCardStyle}>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Подписка до</p>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {userDetail.activationExpiresAt ? new Date(userDetail.activationExpiresAt).toLocaleString('ru-RU') : 'не активирована'}
                  </p>
                </div>
                <div className="rounded-lg p-4" style={miniCardStyle}>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Прибыль (PnL)</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: userDetail.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatNum4Signed(userDetail.totalPnl)} $
                  </p>
                </div>
                <div className="rounded-lg p-4" style={miniCardStyle}>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Сделок</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{userDetail.ordersCount}</p>
                </div>
                <div className="rounded-lg p-4" style={miniCardStyle}>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Баланс (USDT)</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                    {(userDetail.balance ?? 0).toFixed(2)} USDT
                  </p>
                </div>
                <div className="rounded-lg p-4" style={miniCardStyle}>
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Bitget баланс (USDT)</p>
                  {userDetail.okxBalanceError ? (
                    <p className="text-sm font-medium" style={{ color: 'var(--danger)' }} title={userDetail.okxBalanceError}>Ошибка</p>
                  ) : userDetail.okxBalance != null ? (
                    <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--success)' }}>{formatNum4(userDetail.okxBalance)} $</p>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Не подключено</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg p-4" style={miniCardStyle}>
                <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Изменить баланс USDT</h4>
                <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Добавить или отнять сумму с внутреннего баланса пользователя.</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="number"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value)}
                    placeholder="Сумма"
                    min={0}
                    step={0.01}
                    className="input-field w-28 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => adjustBalance('add')}
                    disabled={balanceLoading || !balanceAmount || parseFloat(balanceAmount.replace(',', '.')) <= 0}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ background: 'var(--success)', color: 'white' }}
                  >
                    {balanceLoading ? '…' : 'Добавить'}
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustBalance('subtract')}
                    disabled={balanceLoading || !balanceAmount || parseFloat(balanceAmount.replace(',', '.')) <= 0}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ background: 'var(--danger)', color: 'white' }}
                  >
                    Отнять
                  </button>
                </div>
              </div>

              <div className="rounded-lg p-4" style={miniCardStyle}>
                <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Добавить время подписки</h4>
                <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Формат: 1h (час), 99d (дней), 30m (минут). Примеры: 1h, 7d, 99d</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    value={extendDuration}
                    onChange={(e) => setExtendDuration(e.target.value)}
                    placeholder="1h или 99d"
                    className="input-field w-32 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={extendSubscription}
                    disabled={extendLoading || !extendDuration.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    {extendLoading ? '…' : 'Добавить'}
                  </button>
                  {userDetail.activationExpiresAt && (
                    <button
                      type="button"
                      onClick={revokeSubscription}
                      disabled={revokeLoading}
                      className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
                      style={{ background: 'var(--danger)', color: 'white' }}
                    >
                      {revokeLoading ? '…' : 'Отменить подписку'}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-lg p-4" style={miniCardStyle}>
                <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Изменить логин и пароль</h4>
                <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Новый логин от 2 символов, пароль от 4. Оставьте пустым, чтобы не менять.</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    placeholder="Новый логин"
                    className="input-field w-40 rounded-lg"
                  />
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Новый пароль"
                    className="input-field w-40 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={patchUser}
                    disabled={patchLoading || (!editUsername.trim() && !editPassword.trim())}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    {patchLoading ? '…' : 'Сохранить'}
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Ордера (последние 100)</h4>
                {userDetail.orders.length === 0 ? (
                  <div className="py-8 text-center rounded-lg text-sm" style={miniCardStyle}>Нет сделок</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
                          <th className="text-left p-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Пара</th>
                          <th className="text-left p-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Направление</th>
                          <th className="text-left p-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Открытие</th>
                          <th className="text-left p-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Закрытие</th>
                          <th className="text-right p-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>PnL</th>
                          <th className="text-left p-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Дата</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetail.orders.map((o) => (
                          <tr key={o.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                            <td className="p-3 font-medium">{o.pair}</td>
                            <td className="p-3" style={{ color: o.direction === 'LONG' ? 'var(--success)' : 'var(--danger)' }}>{o.direction}</td>
                            <td className="p-3">{o.openPrice}</td>
                            <td className="p-3">{o.closePrice ?? '—'}</td>
                            <td className="p-3 text-right font-medium tabular-nums" style={{ color: (o.pnl ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {formatNum4Signed(o.pnl ?? 0)}
                            </td>
                            <td className="p-3" style={{ color: 'var(--text-muted)' }}>{o.closeTime ? new Date(o.closeTime).toLocaleString('ru-RU') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <span className="text-2xl">👥</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Пользователи и группы</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Поиск, карточки, подписки и ордера</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск: user_id, ник, Telegram ID..."
            className="input-field w-72 pl-10 rounded-lg border"
            style={{ background: 'var(--bg-card)', backdropFilter: 'blur(12px)', borderColor: 'var(--border)' }}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>🔍</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="rounded-lg overflow-hidden shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
              <SortableTh label="Логин" sortKey="username" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="p-4" />
              <SortableTh label="Группа" sortKey="groupId" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="p-4" />
              <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Статус</th>
              <SortableTh label="Дата" sortKey="createdAt" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="p-4" />
              <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((u) => (
              <tr key={u.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="p-4">
                  <button
                    type="button"
                    onClick={() => openProfile(u.id)}
                    className="text-left font-medium cursor-pointer hover:underline focus:outline-none focus:ring-2 focus:ring-inset rounded px-1 -ml-1"
                    style={{ color: 'var(--accent)' }}
                  >
                    {u.username}
                  </button>
                </td>
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
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Нажмите на логин, чтобы открыть профиль и редактировать пользователя.</p>
    </div>
  );
}
