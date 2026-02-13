import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTableSort } from './useTableSort';

describe('useTableSort', () => {
  const items = [
    { id: 'a', value: 3 },
    { id: 'b', value: 1 },
    { id: 'c', value: 2 }
  ];
  const compareFns = {
    value: (a: { value: number }, b: { value: number }) => a.value - b.value
  };

  it('returns default sort key and dir', () => {
    const { result } = renderHook(() =>
      useTableSort(items, compareFns, 'value', 'asc')
    );
    expect(result.current.sortKey).toBe('value');
    expect(result.current.sortDir).toBe('asc');
    expect(result.current.sortedItems.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('toggles dir when clicking same key', () => {
    const { result } = renderHook(() =>
      useTableSort(items, compareFns, 'value', 'asc')
    );
    act(() => {
      result.current.toggleSort('value');
    });
    expect(result.current.sortDir).toBe('desc');
    expect(result.current.sortedItems.map((x) => x.id)).toEqual(['a', 'c', 'b']);
    act(() => {
      result.current.toggleSort('value');
    });
    expect(result.current.sortDir).toBe('asc');
  });

  it('sets new key with asc when clicking different key', () => {
    const compareFns2 = {
      value: (a: { value: number }, b: { value: number }) => a.value - b.value,
      id: (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)
    };
    const { result } = renderHook(() =>
      useTableSort(items, compareFns2, 'value', 'desc')
    );
    act(() => {
      result.current.toggleSort('id');
    });
    expect(result.current.sortKey).toBe('id');
    expect(result.current.sortDir).toBe('asc');
  });
});
