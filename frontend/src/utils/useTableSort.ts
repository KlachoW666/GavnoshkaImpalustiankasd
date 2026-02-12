/**
 * Хук для сортировки таблицы по колонке (клик по заголовку).
 * 1-й клик = asc (↑), 2-й клик = desc (↓), 3-й клик = asc, ...
 */

import { useMemo, useState, useCallback } from 'react';

export type SortDir = 'asc' | 'desc';

export function useTableSort<T>(
  items: T[],
  compareFns: Record<string, (a: T, b: T) => number>,
  defaultKey: string | null = null,
  defaultDir: SortDir = 'asc'
) {
  const [sort, setSort] = useState<{ key: string | null; dir: SortDir }>({ key: defaultKey, dir: defaultDir });
  const sortKey = sort.key;
  const sortDir = sort.dir;

  const toggleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  }, []);

  const sortedItems = useMemo(() => {
    if (!sortKey || !compareFns[sortKey]) return items;
    const compare = compareFns[sortKey];
    const arr = [...items].sort((a, b) => {
      const v = compare(a, b);
      return sortDir === 'asc' ? v : -v;
    });
    return arr;
  }, [items, sortKey, sortDir, compareFns]);

  return { sortedItems, sortKey, sortDir, toggleSort };
}
