import { useState, useEffect } from 'react';
import { adminApi, clearAdminToken } from '../../utils/adminApi';

const TAB_IDS = ['dashboard', 'signals', 'chart', 'trade', 'demo', 'autotrade', 'autodemo', 'scanner', 'pnl', 'analytics', 'backtest', 'copy', 'social', 'trader', 'wallet', 'settings', 'activate', 'profile', 'help', 'admin'] as const;
const TAB_LABELS: Record<string, string> = {
  dashboard: 'Главная',
  signals: 'Сигналы',
  chart: 'График',
  trade: 'Торговля',
  demo: 'Демо',
  autotrade: 'Авто',
  autodemo: 'Авто-Демо',
  scanner: 'Скринер',
  pnl: 'PNL',
  analytics: 'Аналитика',
  backtest: 'Бэктест',
  copy: 'Копитрейдинг',
  social: 'Соц. торговля',
  trader: 'Трейдер',
  wallet: 'Кошелёк',
  settings: 'Настройки',
  activate: 'Активировать',
  profile: 'Профиль',
  help: 'Помощь',
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
      setDraft((prev) => ({ ...prev, [created.id]: created.allowedTabs ?? ['dashboard', 'settings'] }));
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

  const cardStyle = {
    background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  };
  const miniCardStyle = { background: 'var(--bg-hover)' };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <span className="text-2xl">👥</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Группы и вкладки</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Доступ по вкладкам для каждой группы. Группу назначайте в «Пользователи». При включённом «Авто» пользователь также получает Бэктест, Копитрейдинг и Соц. торговля.</p>
        </div>
      </div>
      <div className="rounded-lg p-4 shadow-lg flex flex-col sm:flex-row gap-3 items-center" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
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
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}
      <div className="space-y-6">
        {groups.map((g) => (
          <div
            key={g.id}
            className="rounded-lg p-6 shadow-lg"
            style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {TAB_IDS.map((tabId) => (
                <label
                  key={tabId}
                  className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-colors"
                  style={{
                    borderColor: (draft[g.id] ?? g.allowedTabs).includes(tabId) ? 'var(--accent)' : 'var(--border)',
                    background: (draft[g.id] ?? g.allowedTabs).includes(tabId) ? 'var(--accent-dim)' : 'var(--bg-hover)'
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
