import { useState, useEffect, useCallback } from 'react';
import { adminApi, clearAdminToken } from '../../utils/adminApi';

interface ProxyItem {
  id?: number;
  url: string;
  source: 'env' | 'db';
  createdAt?: string;
}

interface CheckResult {
  url: string;
  ok: boolean;
  error?: string;
}

const cardStyle = {
  background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
};
const miniCardStyle = { background: 'var(--bg-hover)' };

export default function AdminProxies() {
  const [proxies, setProxies] = useState<ProxyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<Record<string, CheckResult>>({});

  const fetchProxies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminApi.get<{ proxies: ProxyItem[] }>('/admin/proxies');
      setProxies(data.proxies || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      if (String(e).includes('401')) clearAdminToken();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProxies();
  }, [fetchProxies]);

  const handleAdd = async () => {
    const url = newUrl.trim();
    if (!url) {
      setError('Введите URL прокси');
      return;
    }
    setAdding(true);
    setError('');
    try {
      await adminApi.post('/admin/proxies', { url });
      setNewUrl('');
      await fetchProxies();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка добавления');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Удалить этот прокси из списка?')) return;
    setError('');
    try {
      await adminApi.del(`/admin/proxies/${id}`);
      await fetchProxies();
      setCheckResults((prev) => {
        const next = { ...prev };
        const item = proxies.find((p) => p.id === id);
        if (item) delete next[item.url];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  };

  const handleCheckAll = async () => {
    setChecking(true);
    setError('');
    try {
      const data = await adminApi.post<{ results: CheckResult[] }>('/admin/proxies/check', {});
      const byUrl: Record<string, CheckResult> = {};
      for (const r of data.results || []) {
        byUrl[r.url] = r;
      }
      setCheckResults(byUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка проверки');
    } finally {
      setChecking(false);
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
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🌐</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Прокси</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Прокси для OKX (обход Cloudflare). Добавление и проверка.</p>
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
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Добавить прокси</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>URL в формате http://user:pass@host:port</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="http://user:pass@host:port"
            className="input-field flex-1 min-w-[280px] rounded-xl"
            style={{ background: 'var(--bg-hover)' }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !newUrl.trim()}
            className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {adding ? '…' : 'Добавить'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl p-6 shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--success)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Все прокси</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Из .env (PROXY_LIST) и добавленные вручную</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCheckAll}
            disabled={checking || proxies.length === 0}
            className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--success)', color: 'white' }}
          >
            {checking ? 'Проверка…' : 'Проверить все'}
          </button>
        </div>

        {proxies.length === 0 ? (
          <div className="py-10 text-center rounded-xl text-sm" style={miniCardStyle}>
            <span className="text-4xl opacity-50">🌐</span>
            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Нет прокси. Добавьте выше или настройте PROXY_LIST в .env</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {proxies.map((p) => {
              const result = checkResults[p.url];
              return (
                <li
                  key={p.source === 'db' && p.id != null ? `db-${p.id}` : `env-${p.url}`}
                  className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                  style={miniCardStyle}
                >
                  <div className="min-w-0 flex-1 flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-sm truncate" style={{ color: 'var(--text-primary)' }} title={p.url}>
                      {p.url}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full shrink-0"
                      style={{
                        background: p.source === 'env' ? 'var(--bg-card-solid)' : 'var(--accent-dim)',
                        color: p.source === 'env' ? 'var(--text-muted)' : 'var(--accent)'
                      }}
                    >
                      {p.source === 'env' ? 'env' : 'добавлен'}
                    </span>
                    {result != null && (
                      <span
                        className="text-xs font-medium shrink-0"
                        style={{ color: result.ok ? 'var(--success)' : 'var(--danger)' }}
                        title={result.error}
                      >
                        {result.ok ? '✓ Работает' : '✗ Ошибка'}
                      </span>
                    )}
                  </div>
                  {p.source === 'db' && p.id != null && (
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id!)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium shrink-0"
                      style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}
                    >
                      Удалить
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
