/**
 * Pagination - компонент пагинации
 */

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}

export function Pagination({ total, limit, offset, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (totalPages <= 1) return null;

  const pages: (number | string)[] = [];
  
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    if (currentPage <= 3) {
      pages.push(1, 2, 3, '...', totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, '...', totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, '...', currentPage, '...', totalPages);
    }
  }

  const goToPage = (page: number | string) => {
    if (typeof page === 'number') {
      onChange((page - 1) * limit);
    }
  };

  const showStart = offset > 0 ? Math.min(offset + 1, total) : 1;
  const showEnd = Math.min(offset + limit, total);

  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Показано {showStart}-{showEnd} из {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="px-2 py-1 rounded text-sm disabled:opacity-50"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
        >
          ←
        </button>
        {pages.map((page, i) => (
          <button
            key={i}
            onClick={() => goToPage(page)}
            disabled={page === '...'}
            className={`px-3 py-1 rounded text-sm ${page === currentPage ? 'font-bold' : ''}`}
            style={{
              background: page === currentPage ? 'var(--accent)' : 'var(--bg-hover)',
              color: page === currentPage ? '#fff' : 'var(--text-secondary)'
            }}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => onChange(Math.min(total - limit, offset + limit))}
          disabled={offset + limit >= total}
          className="px-2 py-1 rounded text-sm disabled:opacity-50"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
        >
          →
        </button>
      </div>
    </div>
  );
}
