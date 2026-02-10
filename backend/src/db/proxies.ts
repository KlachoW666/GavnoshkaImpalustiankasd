/**
 * Прокси для OKX (обход Cloudflare). Админ добавляет в БД, env PROXY_LIST — из конфига.
 */

import { getDb, isMemoryStore } from './index';

export interface ProxyRow {
  id: number;
  url: string;
  created_at: string;
}

const memoryProxies: ProxyRow[] = [];

function ensureTable(): void {
  const db = getDb();
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_proxies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  } catch {}
}

/** Список URL из БД (добавленные админом). */
export function getActiveProxyUrls(): string[] {
  ensureTable();
  if (isMemoryStore()) {
    return memoryProxies.map((p) => p.url);
  }
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare('SELECT url FROM admin_proxies ORDER BY id').all() as { url: string }[];
  return rows.map((r) => r.url);
}

/** Полный список для приложения: env + БД. */
export function getProxyListForApp(envList: string[]): string[] {
  const fromDb = getActiveProxyUrls();
  const env = Array.isArray(envList) ? envList.filter(Boolean) : [];
  const combined = [...env, ...fromDb];
  return [...new Set(combined)];
}

/** Случайный прокси из полного списка или пустая строка. */
export function getProxy(envList: string[]): string {
  const list = getProxyListForApp(envList);
  if (list.length === 0) return '';
  return list[Math.floor(Math.random() * list.length)];
}

/** Для админки: все прокси (из env с source: 'env' + из БД с source: 'db' и id). */
export function listProxiesForAdmin(envList: string[]): Array<{ id?: number; url: string; source: 'env' | 'db'; createdAt?: string }> {
  ensureTable();
  const env = Array.isArray(envList) ? envList.filter(Boolean) : [];
  const fromEnv = env.map((url) => ({ url, source: 'env' as const }));
  if (isMemoryStore()) {
    const fromDb = memoryProxies.map((p) => ({ id: p.id, url: p.url, source: 'db' as const, createdAt: p.created_at }));
    return [...fromEnv.map((x) => ({ ...x })), ...fromDb];
  }
  const db = getDb();
  if (!db) return fromEnv.map((x) => ({ ...x }));
  const rows = db.prepare('SELECT id, url, created_at FROM admin_proxies ORDER BY id').all() as ProxyRow[];
  const fromDb = rows.map((p) => ({ id: p.id, url: p.url, source: 'db' as const, createdAt: p.created_at }));
  return [...fromEnv.map((x) => ({ ...x })), ...fromDb];
}

/** Добавить прокси (в БД). */
export function addProxy(url: string): ProxyRow {
  ensureTable();
  const u = (url || '').trim();
  if (!u) throw new Error('URL прокси обязателен');
  if (isMemoryStore()) {
    const id = memoryProxies.length ? Math.max(...memoryProxies.map((p) => p.id)) + 1 : 1;
    const created_at = new Date().toISOString();
    const row: ProxyRow = { id, url: u, created_at };
    memoryProxies.push(row);
    return row;
  }
  const db = getDb();
  if (!db) throw new Error('DB недоступна');
  const created_at = new Date().toISOString();
  db.prepare('INSERT INTO admin_proxies (url, created_at) VALUES (?, ?)').run(u, created_at);
  const row = db.prepare('SELECT id, url, created_at FROM admin_proxies WHERE url = ?').get(u) as ProxyRow;
  return row;
}

/** Удалить прокси по id (только из БД). */
export function deleteProxy(id: number): void {
  ensureTable();
  if (isMemoryStore()) {
    const i = memoryProxies.findIndex((p) => p.id === id);
    if (i >= 0) memoryProxies.splice(i, 1);
    return;
  }
  const db = getDb();
  if (db) db.prepare('DELETE FROM admin_proxies WHERE id = ?').run(id);
}
