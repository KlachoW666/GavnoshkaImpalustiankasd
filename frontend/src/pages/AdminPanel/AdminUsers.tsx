import { useState, useEffect } from 'react';
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

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [u, g] = await Promise.all([
        adminApi.get<UserRow[]>('/admin/users'),
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
  };

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
  }, []);

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
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-xl font-bold tracking-tight">Пользователи и группы (Super-Admin)</h2>
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
              <tr key={u.id} style={{ borderColor: 'var(--border)' }} className="border-t">
                <td className="p-3 font-medium">{u.username}</td>
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
                <td className="p-3 flex flex-wrap gap-2">
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
  );
}
