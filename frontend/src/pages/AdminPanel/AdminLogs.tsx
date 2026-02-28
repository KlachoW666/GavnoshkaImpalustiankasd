import { useState, useEffect, useMemo } from 'react';
import { adminApi } from '../../utils/adminApi';
import { useTableSort } from '../../utils/useTableSort';

interface LogEntry {
  ts: string;
  level: string;
  tag: string;
  message: string;
  meta?: string;
}

const LOG_LEVELS = ['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as const;

export default function AdminLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [searchText, setSearchText] = useState('');

  const filteredLogs = useMemo(() => {
    let list = logs.filter((entry) => {
      if (levelFilter !== 'ALL' && entry.level !== levelFilter) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const line = `${entry.message} ${entry.meta || ''}`.toLowerCase();
        return line.includes(q);
      }
      return true;
    });
    return list;
  }, [logs, levelFilter, searchText]);

  const logsCompare = useMemo(() => ({
    ts: (a: LogEntry, b: LogEntry) => (a.ts || '').localeCompare(b.ts || ''),
    level: (a: LogEntry, b: LogEntry) => (a.level || '').localeCompare(b.level || ''),
    tag: (a: LogEntry, b: LogEntry) => (a.tag || '').localeCompare(b.tag || '')
  }), []);
  const { sortedItems: sortedLogs } = useTableSort(filteredLogs, logsCompare, 'ts', 'desc');

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
    background: 'var(--bg-card)',
    backdropFilter: 'blur(24px)',
    border: '1px solid var(--border-strong)',
    boxShadow: 'var(--shadow-lg)'
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
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          Обновить
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}
      <section className="rounded-lg overflow-hidden shadow-lg" style={{ ...cardStyle, borderLeft: '4px solid var(--accent)' }}>
        <div className="flex flex-wrap items-center gap-4 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-2xl">🖥️</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Системные логи</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Обновление каждые 5 сек • показано {filteredLogs.length} из {logs.length}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm border"
              style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              {LOG_LEVELS.map((l) => (
                <option key={l} value={l}>{l === 'ALL' ? 'Все уровни' : l}</option>
              ))}
            </select>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Поиск по тексту…"
              className="px-3 py-2 rounded-lg text-sm w-48 border"
              style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
        <div
          className="overflow-auto p-4 font-mono text-xs leading-relaxed"
          style={{ maxHeight: '60vh', background: 'var(--bg-base)', color: 'var(--text-secondary)' }}
        >
          {logs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Пока нет записей. Логи появляются при работе сервера.</p>
          ) : filteredLogs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Нет записей по выбранным фильтрам.</p>
          ) : (
            sortedLogs.map((entry, i) => (
              <div key={`${entry.ts}-${i}`} className="py-1 border-b border-[var(--border)] last:border-0">
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
