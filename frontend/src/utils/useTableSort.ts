/**
 * Хук для сортировки таблицы по колонке (клик по заголовку).
 * Возвращает отсортированный массив и состояние sortKey / sortDir / toggleSort.
 */

import { useMemo, useState, useCallback } from 'react';

export type SortDir = 'asc' | 'desc';

export function useTableSort<T>(
  items: T[],
  compareFns: Record<string, (a: T, b: T) => number>,
  defaultKey: string | null = null,
  defaultDir: SortDir = 'asc'
) {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('asc');
      return key;
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
