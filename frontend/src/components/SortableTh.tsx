/**
 * Заголовок колонки таблицы с сортировкой (клик переключает asc/desc).
 */

interface SortableThProps {
  label: string;
  sortKey: string;
  currentKey: string | null;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
  style?: React.CSSProperties;
}

export function SortableTh({ label, sortKey, currentKey, sortDir, onSort, align = 'left', className = '', style = {} }: SortableThProps) {
  const isActive = currentKey === sortKey;
  const dir = isActive ? sortDir : null;

  return (
    <th
      role="columnheader"
      className={`py-3 px-2 md:px-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:opacity-90 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}
      style={{ ...style, color: 'var(--text-muted)', background: 'var(--bg-hover)', borderColor: 'var(--border)' }}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {dir === 'asc' && <span aria-hidden>↑</span>}
        {dir === 'desc' && <span aria-hidden>↓</span>}
        {!isActive && <span aria-hidden className="opacity-40">↕</span>}
      </span>
    </th>
  );
}
