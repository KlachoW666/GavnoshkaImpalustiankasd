/**
 * Новости для главной страницы. CRUD из админки, публичный список — только опубликованные.
 */

import { getDb, initDb } from './index';

export interface NewsRow {
  id: number;
  title: string;
  content: string;
  author_id: string | null;
  published: number;
  created_at: string;
  updated_at: string;
  image_url?: string | null;
  media_urls?: string | null; // JSON array of URLs
}

const NEWS_COLS = 'id, title, content, author_id, published, created_at, updated_at, image_url, media_urls';

/** Опубликованные новости для главной (по дате обновления, новые сверху). */
export function listPublishedNews(limit = 20): NewsRow[] {
  if (!initDb()) return [];
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db.prepare(
      `SELECT ${NEWS_COLS} FROM news WHERE published = 1 ORDER BY updated_at DESC LIMIT ?`
    ).all(limit) as NewsRow[];
    return rows;
  } catch (e) {
    return [];
  }
}

/** Все новости для админки (включая черновики). */
export function listAllNews(): NewsRow[] {
  if (!initDb()) return [];
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db.prepare(
      `SELECT ${NEWS_COLS} FROM news ORDER BY updated_at DESC`
    ).all() as NewsRow[];
    return rows;
  } catch (e) {
    return [];
  }
}

export function getNewsById(id: number): NewsRow | null {
  if (!initDb()) return null;
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare(
      `SELECT ${NEWS_COLS} FROM news WHERE id = ?`
    ).get(id) as NewsRow | undefined;
    return row ?? null;
  } catch (e) {
    return null;
  }
}

export function createNews(params: {
  title: string;
  content: string;
  author_id?: string | null;
  published?: number;
  image_url?: string | null;
  media_urls?: string[] | null;
}): NewsRow {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  const now = new Date().toISOString();
  const published = params.published != null ? (params.published ? 1 : 0) : 0;
  const mediaUrlsJson = params.media_urls != null && params.media_urls.length > 0
    ? JSON.stringify(params.media_urls)
    : null;
  const stmt = db.prepare(
    'INSERT INTO news (title, content, author_id, published, created_at, updated_at, image_url, media_urls) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const info = stmt.run(
    params.title,
    params.content,
    params.author_id ?? null,
    published,
    now,
    now,
    params.image_url ?? null,
    mediaUrlsJson
  ) as { lastInsertRowid: number };
  const id = Number(info.lastInsertRowid);
  const row = getNewsById(id);
  if (!row) throw new Error('Failed to read created news');
  return row;
}

export function updateNews(id: number, params: {
  title?: string;
  content?: string;
  published?: number;
  image_url?: string | null;
  media_urls?: string[] | null;
}): NewsRow | null {
  const db = getDb();
  if (!db) return null;
  const existing = getNewsById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const title = params.title !== undefined ? params.title : existing.title;
  const content = params.content !== undefined ? params.content : existing.content;
  const published = params.published !== undefined ? (params.published ? 1 : 0) : existing.published;
  const imageUrl = params.image_url !== undefined ? params.image_url : (existing.image_url ?? null);
  const mediaUrls = params.media_urls !== undefined
    ? (params.media_urls != null && params.media_urls.length > 0 ? JSON.stringify(params.media_urls) : null)
    : (existing.media_urls ?? null);
  db.prepare(
    'UPDATE news SET title = ?, content = ?, published = ?, updated_at = ?, image_url = ?, media_urls = ? WHERE id = ?'
  ).run(title, content, published, now, imageUrl, mediaUrls, id);
  return getNewsById(id);
}

export function deleteNews(id: number): boolean {
  if (!initDb()) return false;
  const db = getDb();
  if (!db) return false;
  try {
    const info = db.prepare('DELETE FROM news WHERE id = ?').run(id) as { changes: number };
    return info.changes > 0;
  } catch (e) {
    return false;
  }
}
