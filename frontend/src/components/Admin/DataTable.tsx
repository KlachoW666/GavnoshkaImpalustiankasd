/**
 * DataTable - универсальная таблица с пагинацией, сортировкой, фильтрами
 */

import { ReactNode, useState } from 'react';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: any) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  loading?: boolean;
  onRowClick?: (row: any) => void;
  emptyMessage?: string;
  selectable?: boolean;
  onSelectionChange?: (selected: Set<string | number>) => void;
}

export function DataTable({
  columns,
  data,
  loading = false,
  onRowClick,
  emptyMessage = 'Нет данных',
  selectable = false,
  onSelectionChange
}: DataTableProps) {
  const [selectedRows, setSelectedRows] = useState<Set<string | number>>(new Set());

  const toggleRow = (id: string | number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
    onSelectionChange?.(newSelected);
  };

  const toggleAll = () => {
    if (selectedRows.size === data.length) {
      setSelectedRows(new Set());
      onSelectionChange?.(new Set());
    } else {
      setSelectedRows(new Set(data.map((_: any, i: number) => i)));
      onSelectionChange?.(new Set(data.map((_: any, i: number) => i)));
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 rounded-lg" style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}>
        <p style={{ color: 'var(--text-muted)' }}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--bg-card-solid)' }}>
            {selectable && (
              <th className="py-3 px-3">
                <input
                  type="checkbox"
                  checked={selectedRows.size === data.length}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded"
                />
              </th>
            )}
            {columns.map(col => (
              <th
                key={col.key}
                className={`py-3 px-3 text-xs font-semibold uppercase ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                style={{ color: 'var(--text-muted)', width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
              onClick={() => onRowClick?.(row)}
            >
              {selectable && (
                <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedRows.has(rowIndex)}
                    onChange={() => toggleRow(rowIndex)}
                    className="w-4 h-4 rounded"
                  />
                </td>
              )}
              {columns.map(col => (
                <td
                  key={col.key}
                  className={`py-3 px-3 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                  style={{ color: 'var(--text-primary)' }}
                >
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
