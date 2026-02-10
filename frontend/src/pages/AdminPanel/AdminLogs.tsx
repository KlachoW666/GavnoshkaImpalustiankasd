import { useState, useEffect } from 'react';
import { adminApi } from '../../utils/adminApi';

interface LogEntry {
  ts: string;
  level: string;
  tag: string;
  message: string;
  meta?: string;
}

export default function AdminLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLogs = () => {
    setError('');
    adminApi
      .get<{ logs: LogEntry[] }>('/admin/logs?limit=500')
      .then((data) => setLogs(data.logs ?? []))
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
        setLogs([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, []);

  const levelColor = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'var(--danger)';
      case 'WARN':
        return 'var(--warning)';
      case 'DEBUG':
        return 'var(--text-muted)';
      default:
        return 'var(--accent)';
    }
  };

  if (loading && logs.length === 0) {
    return <p className="p-8" style={{ color: 'var(--text-muted)' }}>Загрузка…</p>;
  }

  const cardStyle = {
    background: 'linear-gradient(145deg, var(--bg-card-solid) 0%, var(--bg-hover) 100%)',
    border: '1px solid var(--border)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📋</span>
          <div>
            <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Логи и история</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Системные события и отладка</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchLogs(); }}
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          Обновить
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}
      <section className="rounded-2xl overflow-hidden shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-2xl">🖥️</span>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Системные логи</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Обновление каждые 5 сек</p>
          </div>
        </div>
        <div
          className="overflow-auto p-4 font-mono text-xs leading-relaxed"
          style={{ maxHeight: '60vh', background: 'var(--bg-base)', color: 'var(--text-secondary)' }}
        >
          {logs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Пока нет записей. Логи появляются при работе сервера.</p>
          ) : (
            logs.map((entry, i) => (
              <div key={i} className="py-1 border-b border-[var(--border)] last:border-0">
                <span className="text-[var(--text-muted)] shrink-0">{entry.ts}</span>
                {' '}
                <span style={{ color: levelColor(entry.level), fontWeight: 600 }}>[{entry.level}]</span>
                {' '}
                <span style={{ color: 'var(--accent)' }}>[{entry.tag}]</span>
                {' '}
                {entry.message}
                {entry.meta && (
                  <span className="block mt-0.5 ml-4" style={{ color: 'var(--text-muted)' }}>{entry.meta}</span>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
