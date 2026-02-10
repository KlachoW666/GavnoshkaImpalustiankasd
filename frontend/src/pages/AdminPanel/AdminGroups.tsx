import { useState, useEffect } from 'react';
import { adminApi, clearAdminToken } from '../../utils/adminApi';

const TAB_IDS = ['dashboard', 'signals', 'chart', 'demo', 'autotrade', 'scanner', 'pnl', 'settings', 'admin'] as const;
const TAB_LABELS: Record<string, string> = {
  dashboard: 'Обзор',
  signals: 'Сигналы',
  chart: 'График',
  demo: 'Демо',
  autotrade: 'Авто',
  scanner: 'Скринер',
  pnl: 'PNL',
  settings: 'Настройки',
  admin: 'Админ'
};

interface GroupRow {
  id: number;
  name: string;
  allowedTabs: string[];
}

export default function AdminGroups() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<number, string[]>>({});
   const [newName, setNewName] = useState('');
   const [creating, setCreating] = useState(false);

  const fetchGroups = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await adminApi.get<GroupRow[]>('/admin/groups');
      setGroups(list);
      setDraft(list.reduce((acc, g) => ({ ...acc, [g.id]: g.allowedTabs }), {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      if (String(e).includes('401')) clearAdminToken();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const toggleTab = (groupId: number, tabId: string) => {
    setDraft((prev) => {
      const list = prev[groupId] ?? [];
      const next = list.includes(tabId) ? list.filter((t) => t !== tabId) : [...list, tabId];
      return { ...prev, [groupId]: next };
    });
  };

  const saveGroup = async (groupId: number) => {
    setSaving(groupId);
    setError('');
    try {
      const allowedTabs = draft[groupId] ?? [];
      await adminApi.put(`/admin/groups/${groupId}`, { allowedTabs });
      setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, allowedTabs } : g)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(null);
    }
  };

  const createGroupHandler = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError('');
    try {
      const allowedTabs: string[] = ['dashboard', 'settings'];
      const created = await adminApi.post<GroupRow>('/admin/groups', { name, allowedTabs });
      setGroups((prev) => [...prev, created]);
      setDraft((prev) => ({ ...prev, [created.id]: created.allowedTabs }));
      setNewName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания группы');
      if (String(e).includes('401')) clearAdminToken();
    } finally {
      setCreating(false);
    }
  };

  const deleteGroupHandler = async (groupId: number) => {
    if (!window.confirm('Удалить эту группу? Пользователи с этой группой не должны существовать.')) return;
    setError('');
    try {
      await adminApi.del(`/admin/groups/${groupId}`);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      setDraft((prev) => {
        const next = { ...prev };
        delete next[groupId];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления группы');
      if (String(e).includes('401')) clearAdminToken();
    }
  };

  const displayName = (name: string) => {
    const lower = name.toLowerCase();
    if (lower === 'pro' || lower === 'premium') return 'PREMIUM';
    if (lower === 'user') return 'Пользователь';
    if (lower === 'admin') return 'Администратор';
    return name;
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
      <h2 className="text-xl font-bold tracking-tight">Группы и вкладки (Super-Admin)</h2>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Выберите, какие вкладки видит каждая группа. Пользователям назначайте группу во вкладке «Пользователи».
      </p>
      <div className="rounded-xl border p-4 flex flex-col sm:flex-row gap-3 items-center"
        style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Название новой группы (например, PREMIUM)"
          className="input-field flex-1"
        />
        <button
          type="button"
          onClick={createGroupHandler}
          disabled={creating || !newName.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {creating ? 'Создание…' : 'Создать группу'}
        </button>
      </div>
      {error && (
        <div className="p-4 rounded-xl border" style={{ background: 'var(--danger-dim)', borderColor: 'var(--danger)' }}>
          {error}
        </div>
      )}
      <div className="space-y-6">
        {groups.map((g) => (
          <div
            key={g.id}
            className="rounded-xl border p-6"
            style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold">{displayName(g.name)}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => saveGroup(g.id)}
                  disabled={saving === g.id}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {saving === g.id ? '…' : 'Сохранить'}
                </button>
                {g.id > 4 && (
                  <button
                    type="button"
                    onClick={() => deleteGroupHandler(g.id)}
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {TAB_IDS.map((tabId) => (
                <label
                  key={tabId}
                  className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition"
                  style={{
                    borderColor: (draft[g.id] ?? g.allowedTabs).includes(tabId) ? 'var(--accent)' : 'var(--border)',
                    background: (draft[g.id] ?? g.allowedTabs).includes(tabId) ? 'var(--accent-dim)' : 'transparent'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={(draft[g.id] ?? g.allowedTabs).includes(tabId)}
                    onChange={() => toggleTab(g.id, tabId)}
                    className="rounded accent-[var(--accent)]"
                  />
                  <span className="text-sm">{TAB_LABELS[tabId] ?? tabId}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
