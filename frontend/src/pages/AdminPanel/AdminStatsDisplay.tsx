import { useState, useEffect } from 'react';
import { adminApi } from '../../utils/adminApi';

export interface StatsDisplayConfig {
  enabled: boolean;
  launchDate: string;
  volumePerDay: number;
  ordersPerDay: number;
  winRateShare: number;
  usersPerDay: number;
  onlineAddMax: number;
  signalsPerDay: number;
}

export default function AdminStatsDisplay() {
  const [config, setConfig] = useState<StatsDisplayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const fetchConfig = async () => {
    try {
      const data = await adminApi.get<StatsDisplayConfig>('/admin/stats-display-config');
      setConfig(data);
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setMessage('');
    try {
      await adminApi.put<StatsDisplayConfig>('/admin/stats-display-config', config);
      setMessage('Настройки сохранены. Статистика на главной и на странице входа обновится автоматически.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<StatsDisplayConfig>) => {
    setConfig((c) => (c ? { ...c, ...patch } : c));
  };

  if (loading || !config) {
    return (
      <div className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Демо-статистика</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          Значения на главной и на странице входа растут автоматически от даты запуска (не зависят от визитов пользователей). Здесь задаёте дату старта и прирост в день.
        </p>

        <form onSubmit={handleSave} className="space-y-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="rounded w-5 h-5 accent-[var(--accent)]"
            />
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Включить демо-статистику</span>
          </label>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Дата запуска (от неё считаются дни)</label>
            <input
              type="date"
              value={config.launchDate.slice(0, 10)}
              onChange={(e) => update({ launchDate: e.target.value || config.launchDate })}
              className="rounded-lg border px-3 py-2 w-full max-w-xs"
              style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Прирост объёма ($/день)</label>
              <input
                type="number"
                step={0.5}
                min={0}
                value={config.volumePerDay}
                onChange={(e) => update({ volumePerDay: parseFloat(e.target.value) || 0 })}
                className="rounded-lg border px-3 py-2 w-full"
                style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Прирост ордеров (шт/день)</label>
              <input
                type="number"
                step={1}
                min={0}
                value={config.ordersPerDay}
                onChange={(e) => update({ ordersPerDay: parseInt(e.target.value, 10) || 0 })}
                className="rounded-lg border px-3 py-2 w-full"
                style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Доля выигрышных ордеров (0.4–0.8)</label>
              <input
                type="number"
                step={0.01}
                min={0.4}
                max={0.8}
                value={config.winRateShare}
                onChange={(e) => update({ winRateShare: parseFloat(e.target.value) || 0.56 })}
                className="rounded-lg border px-3 py-2 w-full"
                style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Прирост пользователей (шт/день)</label>
              <input
                type="number"
                step={0.5}
                min={0}
                value={config.usersPerDay}
                onChange={(e) => update({ usersPerDay: parseFloat(e.target.value) || 0 })}
                className="rounded-lg border px-3 py-2 w-full"
                style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Макс. доп. онлайн (к реальному)</label>
              <input
                type="number"
                step={1}
                min={0}
                max={20}
                value={config.onlineAddMax}
                onChange={(e) => update({ onlineAddMax: parseInt(e.target.value, 10) || 0 })}
                className="rounded-lg border px-3 py-2 w-full"
                style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Прирост сигналов (шт/день)</label>
              <input
                type="number"
                step={1}
                min={0}
                value={config.signalsPerDay}
                onChange={(e) => update({ signalsPerDay: parseInt(e.target.value, 10) || 0 })}
                className="rounded-lg border px-3 py-2 w-full"
                style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {message && (
            <p className={`text-sm ${message.startsWith('Настройки') ? '' : ''}`} style={{ color: message.startsWith('Настройки') ? 'var(--success)' : 'var(--danger)' }}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl font-medium disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </form>
      </div>
    </div>
  );
}
