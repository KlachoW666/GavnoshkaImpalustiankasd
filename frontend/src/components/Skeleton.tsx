/**
 * Простой скелетон для состояний загрузки (карточки, строки таблицы).
 */

export function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--bg-hover)] ${className}`}
      style={{ minHeight: '1rem' }}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-2xl p-4 border space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card-solid)' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} className={i === 0 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
      <div className="flex gap-2 p-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} className="flex-1 h-4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2 p-3 border-b" style={{ borderColor: 'var(--border)' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} className="flex-1 h-4" />
          ))}
        </div>
      ))}
    </div>
  );
}
