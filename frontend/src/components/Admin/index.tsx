export { DataTable } from './DataTable';
export { StatCard } from './StatCard';

export function StatusBadge({ status }: { status: string }) {
  const statusColors: Record<string, string> = {
    pending: 'rgba(245, 158, 11, 0.15)',
    processing: 'rgba(59, 130, 246, 0.15)',
    completed: 'rgba(16, 185, 129, 0.15)',
    rejected: 'rgba(239, 68, 68, 0.15)',
    sent: 'rgba(16, 185, 129, 0.15)'
  };

  const statusTextColors: Record<string, string> = {
    pending: 'var(--warning)',
    processing: 'var(--accent)',
    completed: 'var(--success)',
    rejected: 'var(--danger)',
    sent: 'var(--success)'
  };

  const statusLabels: Record<string, string> = {
    pending: 'Ожидание',
    processing: 'В обработке',
    completed: 'Завершено',
    rejected: 'Отклонено',
    sent: 'Отправлено'
  };

  return (
    <span
      className="px-2 py-1 rounded-full text-xs font-medium"
      style={{
        background: statusColors[status] || 'var(--bg-hover)',
        color: statusTextColors[status] || 'var(--text-secondary)'
      }}
    >
      {statusLabels[status] || status}
    </span>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const typeConfig: Record<string, { icon: string; label: string; color: string; bg: string }> = {
    deposit: { icon: '↓', label: 'Депозит', color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.15)' },
    withdraw: { icon: '↑', label: 'Вывод', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.15)' },
    copy_deposit: { icon: '↓', label: 'Копи-деп', color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.15)' },
    copy_withdraw: { icon: '↑', label: 'Копи-выв', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.15)' },
    copy_pnl: { icon: '~', label: 'PnL', color: 'var(--accent)', bg: 'rgba(59, 130, 246, 0.15)' },
    subscription: { icon: '★', label: 'Подписка', color: 'var(--accent)', bg: 'rgba(59, 130, 246, 0.15)' },
    balance_adjust: { icon: '⚙', label: 'Корректировка', color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.15)' }
  };

  const config = typeConfig[type] || { icon: '?', label: type, color: 'var(--text-muted)', bg: 'var(--bg-hover)' };

  return (
    <span
      className="px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1"
      style={{ background: config.bg, color: config.color }}
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}

export function Pagination({ total, limit, offset, onChange }: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}) {
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  const pages = [];

  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);

  for (let i = start; i <= end; i++) pages.push(i);

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-4 px-2">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Показано {offset + 1}-{Math.min(offset + limit, total)} из {total}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={currentPage === 1}
          className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
        >
          ◀
        </button>
        {pages.map(p => (
          <button
            key={p}
            onClick={() => onChange((p - 1) * limit)}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: p === currentPage ? 'var(--accent)' : 'var(--bg-hover)',
              color: p === currentPage ? '#fff' : 'var(--text-secondary)'
            }}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onChange(offset + limit)}
          disabled={currentPage >= totalPages}
          className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
        >
          ▶
        </button>
      </div>
    </div>
  );
}
