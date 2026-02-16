import { describe, it, expect, vi, afterEach } from 'vitest';
import { TtlCache } from './ttlCache';

describe('TtlCache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores and retrieves values', () => {
    const cache = new TtlCache<string>(5000);
    cache.set('a', 'hello');
    expect(cache.get('a')).toBe('hello');
    expect(cache.has('a')).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('returns undefined for missing keys', () => {
    const cache = new TtlCache<number>(5000);
    expect(cache.get('nope')).toBeUndefined();
    expect(cache.has('nope')).toBe(false);
  });

  it('expires entries after TTL', () => {
    const cache = new TtlCache<string>(100);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');

    vi.spyOn(Date, 'now').mockReturnValue(now + 101);
    expect(cache.get('key')).toBeUndefined();
    expect(cache.has('key')).toBe(false);
  });

  it('evicts oldest entry when maxEntries exceeded', () => {
    const cache = new TtlCache<number>(60000, 3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.size).toBe(3);

    cache.set('d', 4);
    expect(cache.size).toBe(3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBe(4);
  });

  it('clear() removes all entries', () => {
    const cache = new TtlCache<string>(5000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});
