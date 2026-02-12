import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../utils/adminApi';
import { useTableSort } from '../../utils/useTableSort';

type KeyRow = {
  id: number;
  key: string;
  durationDays: number;
  note: string | null;
  createdAt: string;
  usedByUserId: string | null;
  usedAt: string | null;
  revokedAt: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

export default function AdminActivationKeys() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [durationDays, setDurationDays] = useState(30);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<KeyRow[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchKeys = async () => {
    try {
      const list = await adminApi.get<KeyRow[]>('/admin/activation-keys?limit=500');
      setKeys(list);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const stats = useMemo(() => {
    const total = keys.length;
    const used = keys.filter((k) => !!k.usedAt).length;
    const revoked = keys.filter((k) => !!k.revokedAt).length;
    const active = total - used - revoked;
    return { total, used, revoked, active };
  }, [keys]);

  const keysCompare = useMemo(() => ({
    key: (a: KeyRow, b: KeyRow) => (a.key || '').localeCompare(b.key || ''),
    durationDays: (a: KeyRow, b: KeyRow) => a.durationDays - b.durationDays,
    createdAt: (a: KeyRow, b: KeyRow) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
    usedAt: (a: KeyRow, b: KeyRow) => new Date(a.usedAt || 0).getTime() - new Date(b.usedAt || 0).getTime()
  }), []);
  const { sortedItems: sortedKeys } = useTableSort(keys, keysCompare, 'createdAt', 'desc');

  const generate = async () => {
    setCreating(true);
    setError('');
    setCreated([]);
    try {
      const res = await adminApi.post<{ ok: boolean; keys: Array<{ id: number; key: string; durationDays: number; note: string | null; createdAt: string }> }>(
        '/admin/activation-keys/generate',
        { durationDays, count, note: note.trim() ? note.trim() : null }
      );
      const made: KeyRow[] = res.keys.map((k) => ({
        id: k.id,
        key: k.key,
        durationDays: k.durationDays,
        note: k.note,
        createdAt: k.createdAt,
        usedByUserId: null,
        usedAt: null,
        revokedAt: null
      }));
      setCreated(made);
      await fetchKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: number) => {
    setError('');
    try {
      await adminApi.post(`/admin/activation-keys/${id}/revoke`);
      await fetchKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отзыва');
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  const exportCsv = () => {
    const headers = ['id', 'key', 'durationDays', 'note', 'createdAt', 'usedByUserId', 'usedAt', 'revokedAt'];
    const rows = keys.map((k) => [
      k.id,
      k.key,
      k.durationDays,
      k.note ?? '',
      k.createdAt,
      k.usedByUserId ?? '',
      k.usedAt ?? '',
      k.revokedAt ?? ''
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activation-keys-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cardStyle = {
    background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  };
  const miniCardStyle = { background: 'var(--bg-hover)' };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🔑</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Ключи активации</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Генерация, список и отзыв ключей</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">➕</span>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Создать ключи</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Срок, количество и заметка</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[180px]">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Срок (дней)</label>
            <input className="input-field w-full" type="number" min={1} max={3650} value={durationDays} onChange={(e) => setDurationDays(parseInt(e.target.value || '0', 10) || 1)} />
          </div>
          <div className="min-w-[180px]">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Количество</label>
            <input className="input-field w-full" type="number" min={1} max={100} value={count} onChange={(e) => setCount(parseInt(e.target.value || '0', 10) || 1)} />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Заметка (опционально)</label>
            <input className="input-field w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: Telegram VIP" />
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={creating}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {creating ? '…' : 'Сгенерировать'}
          </button>
        </div>

        {created.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Сгенерированные ключи</p>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {created.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-4 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="min-w-0">
                    <div className="font-mono text-sm">{k.key}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {k.durationDays} дней{note.trim() ? ` • ${note.trim()}` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => copy(k.key)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                    Копировать
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Список ключей</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Всего: {stats.total} • Активные: {stats.active} • Использованные: {stats.used} • Отозванные: {stats.revoked}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={keys.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            Экспорт CSV
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>Загрузка…</div>
        ) : keys.length === 0 ? (
          <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>Ключей нет</div>
        ) : (
          <div className="mt-4 space-y-3">
            {sortedKeys.map((k) => {
              const status = k.revokedAt ? 'revoked' : k.usedAt ? 'used' : 'active';
              const noteIsTelegramId = k.note != null && /^\d+$/.test(String(k.note).trim());
              const createdBy = k.note != null && k.note.trim() !== ''
                ? (noteIsTelegramId ? `Бот (Telegram ID: ${k.note})` : `Админ (заметка: ${k.note})`)
                : 'Админ';
              return (
                <div
                  key={k.id}
                  className="rounded-xl px-4 py-3 flex flex-wrap items-start justify-between gap-3"
                  style={{ background: 'var(--bg-hover)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{k.key}</span>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: status === 'active' ? 'var(--success-dim)' : status === 'used' ? 'var(--bg-card-solid)' : 'var(--danger-dim)',
                          color: status === 'active' ? 'var(--success)' : status === 'used' ? 'var(--text-muted)' : 'var(--danger)'
                        }}
                      >
                        {status === 'active' ? 'ACTIVE' : status === 'used' ? 'USED' : 'REVOKED'}
                      </span>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                      <div className="flex gap-1.5">
                        <dt style={{ color: 'var(--text-muted)' }}>Срок:</dt>
                        <dd style={{ color: 'var(--text-primary)' }}>{k.durationDays} дн.</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt style={{ color: 'var(--text-muted)' }}>Создан:</dt>
                        <dd style={{ color: 'var(--text-primary)' }}>{fmt(k.createdAt)}</dd>
                      </div>
                      <div className="flex gap-1.5 sm:col-span-2">
                        <dt style={{ color: 'var(--text-muted)' }}>Кто создал:</dt>
                        <dd style={{ color: 'var(--text-primary)' }}>{createdBy}</dd>
                      </div>
                      {k.usedAt && (
                        <>
                          <div className="flex gap-1.5">
                            <dt style={{ color: 'var(--text-muted)' }}>Активировал (User ID):</dt>
                            <dd className="font-mono truncate" style={{ color: 'var(--accent)' }} title={k.usedByUserId ?? ''}>{k.usedByUserId ?? '—'}</dd>
                          </div>
                          <div className="flex gap-1.5">
                            <dt style={{ color: 'var(--text-muted)' }}>Дата активации:</dt>
                            <dd style={{ color: 'var(--text-primary)' }}>{fmt(k.usedAt)}</dd>
                          </div>
                        </>
                      )}
                      {k.revokedAt && (
                        <div className="flex gap-1.5 sm:col-span-2">
                          <dt style={{ color: 'var(--text-muted)' }}>Отозван:</dt>
                          <dd style={{ color: 'var(--danger)' }}>{fmt(k.revokedAt)}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => copy(k.key)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--bg-card-solid)', color: 'var(--text-secondary)' }}>
                      Copy
                    </button>
                    {!k.revokedAt && !k.usedAt && (
                      <button type="button" onClick={() => revoke(k.id)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>
                        Отозвать
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

