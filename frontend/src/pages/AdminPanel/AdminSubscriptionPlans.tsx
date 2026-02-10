import { useEffect, useState } from 'react';
import { adminApi } from '../../utils/adminApi';

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

  if (loading) {
    return <p style={{ color: 'var(--text-muted)' }}>Загрузка тарифов…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="card p-4" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h3 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>API для бота</h3>
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
        <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
      )}

      <div className="card overflow-hidden" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
              <th className="text-left p-3">ID</th>
              <th className="text-left p-3">Дней</th>
              <th className="text-left p-3">USD</th>
              <th className="text-left p-3">Stars</th>
              <th className="text-left p-3">Скидка %</th>
              <th className="text-left p-3">Вкл.</th>
              <th className="text-left p-3">Порядок</th>
              <th className="text-left p-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
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
