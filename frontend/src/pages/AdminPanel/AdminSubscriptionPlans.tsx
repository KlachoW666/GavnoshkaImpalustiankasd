import { useEffect, useState, useMemo } from 'react';
import { adminApi } from '../../utils/adminApi';
import { useTableSort } from '../../utils/useTableSort';
import { SortableTh } from '../../components/SortableTh';

type PlanRow = {
  id: number;
  days: number;
  priceUsd: number;
  priceStars: number;
  discountPercent: number;
  enabled: number;
  sortOrder: number;
};

export default function AdminSubscriptionPlans() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<PlanRow>>({});

  const fetchPlans = async () => {
    try {
      const list = await adminApi.get<PlanRow[]>('/admin/subscription-plans');
      setPlans(list);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const startEdit = (p: PlanRow) => {
    setEditingId(p.id);
    setForm({ days: p.days, priceUsd: p.priceUsd, priceStars: p.priceStars, discountPercent: p.discountPercent, enabled: p.enabled, sortOrder: p.sortOrder });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({});
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    setError('');
    try {
      await adminApi.put(`/admin/subscription-plans/${editingId}`, {
        days: form.days,
        priceUsd: form.priceUsd,
        priceStars: form.priceStars,
        discountPercent: form.discountPercent,
        enabled: form.enabled,
        sortOrder: form.sortOrder
      });
      await fetchPlans();
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    }
  };

  const apiBase = typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api';

  const plansCompare = useMemo(() => ({
    id: (a: PlanRow, b: PlanRow) => a.id - b.id,
    days: (a: PlanRow, b: PlanRow) => a.days - b.days,
    priceUsd: (a: PlanRow, b: PlanRow) => a.priceUsd - b.priceUsd,
    priceStars: (a: PlanRow, b: PlanRow) => a.priceStars - b.priceStars,
    discountPercent: (a: PlanRow, b: PlanRow) => a.discountPercent - b.discountPercent,
    sortOrder: (a: PlanRow, b: PlanRow) => a.sortOrder - b.sortOrder
  }), []);
  const { sortedItems: sortedPlans, sortKey, sortDir, toggleSort } = useTableSort(plans, plansCompare, 'sortOrder', 'asc');

  if (loading) {
    return <p style={{ color: 'var(--text-muted)' }}>Загрузка тарифов…</p>;
  }

  const cardStyle = {
    background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  };
  const miniCardStyle = { background: 'var(--bg-hover)' };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📦</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Тарифы бота</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Планы подписки и API для Telegram-бота</p>
        </div>
      </div>

      <div className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🔗</span>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>API для бота</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>X-Bot-Token = BOT_WEBHOOK_SECRET</p>
          </div>
        </div>
        <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
          Бот должен отправлять заголовок <code className="px-1 rounded" style={{ background: 'var(--bg-hover)' }}>X-Bot-Token</code> со значением переменной окружения <code className="px-1 rounded" style={{ background: 'var(--bg-hover)' }}>BOT_WEBHOOK_SECRET</code>. Значение токена в интерфейсе не показывается.
        </p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Базовый URL: <code className="px-1 rounded" style={{ background: 'var(--bg-hover)' }}>{apiBase}</code>
        </p>
        <ul className="text-sm mt-2 list-disc list-inside" style={{ color: 'var(--text-muted)' }}>
          <li>POST /bot/register-key — body: key (32 символа), durationDays, telegramUserId (опционально)</li>
          <li>POST /bot/revoke-key — body: key (отзыв при chargeback)</li>
          <li>GET /bot/plans — список включённых тарифов</li>
        </ul>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
        <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-2xl">📅</span>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Тарифы подписки</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Дней, цены USD/Stars, скидка, порядок</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
              <SortableTh label="ID" sortKey="id" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="p-3" />
              <SortableTh label="Дней" sortKey="days" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="p-3" />
              <SortableTh label="USD" sortKey="priceUsd" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="p-3" />
              <SortableTh label="Stars" sortKey="priceStars" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="p-3" />
              <SortableTh label="Скидка %" sortKey="discountPercent" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="p-3" />
              <th className="text-left p-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Вкл.</th>
              <SortableTh label="Порядок" sortKey="sortOrder" currentKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="p-3" />
              <th className="text-left p-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {sortedPlans.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="p-3">{p.id}</td>
                {editingId === p.id ? (
                  <>
                    <td className="p-3">
                      <input
                        type="number"
                        min={1}
                        value={form.days ?? p.days}
                        onChange={(e) => setForm((f) => ({ ...f, days: parseInt(e.target.value, 10) || 1 }))}
                        className="input-field w-20"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={form.priceUsd ?? p.priceUsd}
                        onChange={(e) => setForm((f) => ({ ...f, priceUsd: parseFloat(e.target.value) || 0 }))}
                        className="input-field w-24"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        min={0}
                        value={form.priceStars ?? p.priceStars}
                        onChange={(e) => setForm((f) => ({ ...f, priceStars: parseInt(e.target.value, 10) || 0 }))}
                        className="input-field w-24"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={form.discountPercent ?? p.discountPercent}
                        onChange={(e) => setForm((f) => ({ ...f, discountPercent: parseInt(e.target.value, 10) || 0 }))}
                        className="input-field w-16"
                      />
                    </td>
                    <td className="p-3">
                      <select
                        value={form.enabled ?? p.enabled}
                        onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.value === '1' ? 1 : 0 }))}
                        className="input-field w-16"
                      >
                        <option value={1}>Да</option>
                        <option value={0}>Нет</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        value={form.sortOrder ?? p.sortOrder}
                        onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value, 10) || 0 }))}
                        className="input-field w-16"
                      />
                    </td>
                    <td className="p-3 flex gap-2">
                      <button type="button" onClick={saveEdit} className="px-3 py-1 rounded text-white text-sm" style={{ background: 'var(--accent)' }}>Сохранить</button>
                      <button type="button" onClick={cancelEdit} className="px-3 py-1 rounded text-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>Отмена</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3">{p.days}</td>
                    <td className="p-3">{p.priceUsd}</td>
                    <td className="p-3">{p.priceStars} ⭐</td>
                    <td className="p-3">{p.discountPercent}%</td>
                    <td className="p-3">{p.enabled ? 'Да' : 'Нет'}</td>
                    <td className="p-3">{p.sortOrder}</td>
                    <td className="p-3">
                      <button type="button" onClick={() => startEdit(p)} className="px-3 py-1 rounded text-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>Изменить</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
