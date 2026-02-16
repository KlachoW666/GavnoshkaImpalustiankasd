/**
 * Пользователи, группы, сессии — для регистрации и Super-Admin.
 * При in-memory режиме БД использует память (данные теряются при перезапуске).
 */

import crypto from 'crypto';
import { getDb, initDb, isMemoryStore, runUserMigrations } from './index';
import { logger } from '../lib/logger';

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  group_id: number;
  proxy_url: string | null;
  activation_expires_at?: string | null;
  banned?: number;
  ban_reason?: string | null;
  created_at: string;
  telegram_id?: string | null;
}

export interface GroupRow {
  id: number;
  name: string;
  allowed_tabs: string;
}

export interface UserOkxConnectionRow {
  user_id: string;
  api_key: string;
  secret: string;
  passphrase: string;
  updated_at: string;
}

const memoryUsers: UserRow[] = [];
const memoryOkxConnections: Map<string, UserOkxConnectionRow> = new Map();
const memoryGroups: GroupRow[] = [
  { id: 1, name: 'user', allowed_tabs: '["dashboard","settings","activate"]' },
  { id: 2, name: 'viewer', allowed_tabs: '["dashboard","signals","chart"]' },
  { id: 3, name: 'admin', allowed_tabs: '["dashboard","signals","chart","demo","autotrade","scanner","pnl","settings","admin"]' },
  { id: 4, name: 'PREMIUM', allowed_tabs: '["dashboard","signals","chart","demo","autotrade","scanner","pnl","settings","activate"]' }
];
const memorySessions: Map<string, string> = new Map(); // token -> userId
const memoryActivationKeys: ActivationKeyRow[] = [];
const memoryRegisterTokens: Map<string, { telegram_user_id: string; username_suggestion: string | null; expires_at: string }> = new Map();
const memoryResetTokens: Map<string, { user_id: string; expires_at: string }> = new Map();

function ensureAuthTables(): void {
  initDb();
  const db = getDb();
  if (!db) return;
  runUserMigrations(db);
}

export interface ActivationKeyRow {
  id: number;
  key: string;
  duration_days: number;
  note: string | null;
  created_at: string;
  used_by_user_id: string | null;
  used_at: string | null;
  revoked_at: string | null;
}

export function findUserByUsername(username: string): UserRow | null {
  ensureAuthTables();
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
    return u ?? null;
  }
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  return (row as UserRow) ?? null;
}

export function createUser(username: string, passwordHash: string, groupId = 1): UserRow {
  ensureAuthTables();
  const id = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  const created_at = new Date().toISOString();
  if (isMemoryStore()) {
    const row: UserRow = { id, username: username.trim(), password_hash: passwordHash, group_id: groupId, proxy_url: null, activation_expires_at: null, banned: 0, ban_reason: null, created_at, telegram_id: null };
    memoryUsers.push(row);
    return row;
  }
  const db = getDb();
  if (!db) throw new Error('DB unavailable');
  db.prepare(
    'INSERT INTO users (id, username, password_hash, group_id, activation_expires_at, banned, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
  ).run(id, username.trim(), passwordHash, groupId, null, created_at);
  return { id, username: username.trim(), password_hash: passwordHash, group_id: groupId, proxy_url: null, activation_expires_at: null, banned: 0, ban_reason: null, created_at, telegram_id: null };
}

export function findUserByTelegramId(telegramId: string): UserRow | null {
  ensureAuthTables();
  const tid = (telegramId || '').trim();
  if (!tid) return null;
  if (isMemoryStore()) {
    return memoryUsers.find((x) => (x as UserRow).telegram_id === tid) ?? null;
  }
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tid);
    return (row as UserRow) ?? null;
  } catch {
    return null;
  }
}

export function setUserTelegramId(userId: string, telegramId: string): void {
  ensureAuthTables();
  const tid = (telegramId || '').trim();
  if (!tid) return;
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId);
    if (u) (u as UserRow).telegram_id = tid;
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run(tid, userId);
}

export function getUserById(id: string): UserRow | null {
  ensureAuthTables();
  if (isMemoryStore()) {
    return memoryUsers.find((x) => x.id === id) ?? null;
  }
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return (row as UserRow) ?? null;
}

export function updateUserGroup(userId: string, groupId: number): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId);
    if (u) u.group_id = groupId;
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE users SET group_id = ? WHERE id = ?').run(groupId, userId);
}

export function updateUserProxy(userId: string, proxyUrl: string | null): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId);
    if (u) u.proxy_url = proxyUrl;
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE users SET proxy_url = ? WHERE id = ?').run(proxyUrl ?? null, userId);
}

export function updateUserActivationExpiresAt(userId: string, activationExpiresAt: string | null): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId);
    if (u) u.activation_expires_at = activationExpiresAt;
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE users SET activation_expires_at = ? WHERE id = ?').run(activationExpiresAt ?? null, userId);
}

export function updateUserPassword(userId: string, passwordHash: string): void {
  ensureAuthTables();
  if (!passwordHash || passwordHash.length < 10) throw new Error('Хеш пароля обязателен');
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId);
    if (u) u.password_hash = passwordHash;
    return;
  }
  const db = getDb();
  if (!db) return;
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}

export function updateUsername(userId: string, newUsername: string): void {
  ensureAuthTables();
  const name = (newUsername || '').trim();
  if (name.length < 2) throw new Error('Логин от 2 символов');
  if (isMemoryStore()) {
    const other = memoryUsers.find((u) => u.id !== userId && u.username.toLowerCase() === name.toLowerCase());
    if (other) throw new Error('Пользователь с таким логином уже есть');
    const u = memoryUsers.find((x) => x.id === userId);
    if (u) u.username = name;
    return;
  }
  const db = getDb();
  if (!db) return;
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?').get(name, userId);
  if (existing) throw new Error('Пользователь с таким логином уже есть');
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(name, userId);
}

export function getGroupById(id: number): GroupRow | null {
  ensureAuthTables();
  if (isMemoryStore()) {
    return memoryGroups.find((g) => g.id === id) ?? null;
  }
  const db = getDb();
  if (!db) return memoryGroups.find((g) => g.id === id) ?? null;
  const row = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  return (row as GroupRow) ?? null;
}

export function listGroups(): GroupRow[] {
  ensureAuthTables();
  if (isMemoryStore()) return [...memoryGroups];
  const db = getDb();
  if (!db) return [...memoryGroups];
  return db.prepare('SELECT * FROM groups ORDER BY id').all() as GroupRow[];
}

export function updateGroupTabs(groupId: number, allowedTabs: string): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    const g = memoryGroups.find((x) => x.id === groupId);
    if (g) g.allowed_tabs = allowedTabs;
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE groups SET allowed_tabs = ? WHERE id = ?').run(allowedTabs, groupId);
}

export function createGroup(name: string, allowedTabs: string): GroupRow {
  ensureAuthTables();
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Имя группы обязательно');
  if (isMemoryStore()) {
    if (memoryGroups.some((g) => g.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('Группа с таким именем уже существует');
    }
    const nextId = memoryGroups.reduce((m, g) => Math.max(m, g.id), 0) + 1;
    const row: GroupRow = { id: nextId, name: cleanName, allowed_tabs: allowedTabs };
    memoryGroups.push(row);
    return row;
  }
  const db = getDb();
  if (!db) {
    const nextId = memoryGroups.reduce((m, g) => Math.max(m, g.id), 0) + 1;
    const row: GroupRow = { id: nextId, name: cleanName, allowed_tabs: allowedTabs };
    memoryGroups.push(row);
    return row;
  }
  const stmt = db.prepare('INSERT INTO groups (name, allowed_tabs) VALUES (?, ?)');
  stmt.run(cleanName, allowedTabs);
  const rowId = db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number };
  return { id: rowId.id, name: cleanName, allowed_tabs: allowedTabs };
}

export function deleteGroup(groupId: number): void {
  ensureAuthTables();
  if (groupId <= 4) {
    throw new Error('Нельзя удалить системную группу');
  }
  if (isMemoryStore()) {
    const hasUsers = memoryUsers.some((u) => u.group_id === groupId);
    if (hasUsers) throw new Error('Нельзя удалить группу, к которой привязаны пользователи');
    const idx = memoryGroups.findIndex((g) => g.id === groupId);
    if (idx >= 0) memoryGroups.splice(idx, 1);
    return;
  }
  const db = getDb();
  if (!db) return;
  const cntRow = db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE group_id = ?').get(groupId) as { cnt: number };
  if ((cntRow?.cnt ?? 0) > 0) {
    throw new Error('Нельзя удалить группу, к которой привязаны пользователи');
  }
  db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
}

export function createSession(token: string, userId: string): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    memorySessions.set(token, userId);
    return;
  }
  const db = getDb();
  if (db) db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
}

export function findSessionUserId(token: string): string | null {
  ensureAuthTables();
  if (isMemoryStore()) return memorySessions.get(token) ?? null;
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  return (row as { user_id: string } | undefined)?.user_id ?? null;
}

export function deleteSession(token: string): void {
  if (isMemoryStore()) {
    memorySessions.delete(token);
    return;
  }
  const db = getDb();
  if (db) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function listUsers(): (UserRow & { group_name?: string })[] {
  ensureAuthTables();
  if (isMemoryStore()) {
    return memoryUsers.map((u) => {
      const g = memoryGroups.find((g) => g.id === u.group_id);
      return { ...u, group_name: g?.name };
    });
  }
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare(
    'SELECT u.*, g.name AS group_name FROM users u LEFT JOIN groups g ON u.group_id = g.id ORDER BY u.created_at DESC'
  ).all() as (UserRow & { group_name?: string })[];
  return rows;
}

function randomKey(): string {
  // 24 chars, upper + digits, easy to read/copy
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 24; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function createActivationKeys(opts: { durationDays: number; count?: number; note?: string | null }): ActivationKeyRow[] {
  ensureAuthTables();
  const durationDays = Math.max(1, Math.floor(opts.durationDays));
  const count = Math.max(1, Math.min(100, Math.floor(opts.count ?? 1)));
  const note = opts.note ?? null;

  const created: ActivationKeyRow[] = [];
  const now = new Date().toISOString();

  if (isMemoryStore()) {
    for (let i = 0; i < count; i++) {
      const key = randomKey();
      const id = (memoryActivationKeys[memoryActivationKeys.length - 1]?.id ?? 0) + 1;
      const row: ActivationKeyRow = {
        id,
        key,
        duration_days: durationDays,
        note,
        created_at: now,
        used_by_user_id: null,
        used_at: null,
        revoked_at: null
      };
      memoryActivationKeys.push(row);
      created.push(row);
    }
    return created;
  }

  const db = getDb();
  if (!db) throw new Error('DB unavailable');
  const insert = db.prepare(
    'INSERT INTO activation_keys (key, duration_days, note, created_at) VALUES (?, ?, ?, ?)'
  );

  for (let i = 0; i < count; i++) {
    // retry on extremely rare collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const key = randomKey();
      try {
        const info = insert.run(key, durationDays, note, now);
        const id = Number(info.lastInsertRowid);
        const row: ActivationKeyRow = {
          id,
          key,
          duration_days: durationDays,
          note,
          created_at: now,
          used_by_user_id: null,
          used_at: null,
          revoked_at: null
        };
        created.push(row);
        break;
      } catch (e) {
        if (String(e).toLowerCase().includes('unique') && attempt < 4) continue;
        throw e;
      }
    }
  }
  return created;
}

export function listActivationKeys(limit = 500): ActivationKeyRow[] {
  ensureAuthTables();
  const l = Math.max(1, Math.min(2000, Math.floor(limit)));
  if (isMemoryStore()) {
    const list = [...memoryActivationKeys];
    list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return list.slice(0, l);
  }
  const db = getDb();
  if (!db) return [];
  return db.prepare('SELECT * FROM activation_keys ORDER BY created_at DESC LIMIT ?').all(l) as ActivationKeyRow[];
}

export function revokeActivationKey(id: number): void {
  ensureAuthTables();
  const now = new Date().toISOString();
  if (isMemoryStore()) {
    const k = memoryActivationKeys.find((x) => x.id === id);
    if (k) k.revoked_at = now;
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE activation_keys SET revoked_at = ? WHERE id = ?').run(now, id);
}

/** Регистрация ключа от бота (бот сгенерировал ключ, отправляет на сайт). Ключ 32 символа. */
export function registerActivationKeyFromBot(key: string, durationDays: number, note?: string | null): ActivationKeyRow {
  ensureAuthTables();
  const k = (key || '').trim().toUpperCase();
  if (k.length !== 32) throw new Error('Ключ должен быть 32 символа');
  const days = Math.max(1, Math.floor(durationDays));
  const now = new Date().toISOString();
  const noteVal = note ?? null;
  if (isMemoryStore()) {
    if (memoryActivationKeys.some((x) => x.key === k)) throw new Error('Ключ уже существует');
    const id = (memoryActivationKeys[memoryActivationKeys.length - 1]?.id ?? 0) + 1;
    const row: ActivationKeyRow = { id, key: k, duration_days: days, note: noteVal, created_at: now, used_by_user_id: null, used_at: null, revoked_at: null };
    memoryActivationKeys.push(row);
    return row;
  }
  const db = getDb();
  if (!db) throw new Error('DB unavailable');
  try {
    db.prepare('INSERT INTO activation_keys (key, duration_days, note, created_at) VALUES (?, ?, ?, ?)').run(k, days, noteVal, now);
    const inserted = db.prepare('SELECT * FROM activation_keys WHERE key = ?').get(k) as ActivationKeyRow;
    return inserted;
  } catch (e) {
    if (String(e).toLowerCase().includes('unique')) throw new Error('Ключ уже существует');
    throw e;
  }
}

/** Отзыв ключа по строке (chargeback). Если ключ уже использован — баним пользователя. */
export function revokeActivationKeyByKey(key: string): { revoked: boolean; bannedUserId: string | null } {
  ensureAuthTables();
  const k = (key || '').trim().toUpperCase();
  if (!k) return { revoked: false, bannedUserId: null };
  const now = new Date().toISOString();
  let bannedUserId: string | null = null;
  if (isMemoryStore()) {
    const row = memoryActivationKeys.find((x) => x.key === k);
    if (!row) return { revoked: false, bannedUserId: null };
    row.revoked_at = now;
    if (row.used_by_user_id) {
      bannedUserId = row.used_by_user_id;
      const u = memoryUsers.find((x) => x.id === row.used_by_user_id);
      if (u) { u.banned = 1; u.ban_reason = 'Отзыв оплаты (chargeback)'; }
    }
    return { revoked: true, bannedUserId };
  }
  const db = getDb();
  if (!db) return { revoked: false, bannedUserId: null };
  const row = db.prepare('SELECT * FROM activation_keys WHERE key = ?').get(k) as (ActivationKeyRow & { used_by_user_id: string | null }) | undefined;
  if (!row) return { revoked: false, bannedUserId: null };
  db.prepare('UPDATE activation_keys SET revoked_at = ? WHERE key = ?').run(now, k);
  if (row.used_by_user_id) {
    bannedUserId = row.used_by_user_id;
    db.prepare('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?').run('Отзыв оплаты (chargeback)', row.used_by_user_id);
  }
  return { revoked: true, bannedUserId };
}

/** Telegram ID пользователя: сначала из users.telegram_id, иначе из note ключа активации. */
export function getTelegramIdForUser(userId: string): string | null {
  ensureAuthTables();
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId) as UserRow | undefined;
    if (u?.telegram_id) return u.telegram_id;
    const key = memoryActivationKeys.filter((k) => k.used_by_user_id === userId && k.note).sort((a, b) => (b.used_at || '').localeCompare(a.used_at || ''))[0];
    return key?.note ?? null;
  }
  const db = getDb();
  if (!db) return null;
  try {
    const u = db.prepare('SELECT telegram_id FROM users WHERE id = ?').get(userId) as { telegram_id: string | null } | undefined;
    if (u?.telegram_id) return u.telegram_id;
  } catch (err) { logger.warn('AuthDB', (err as Error).message); }
  const row = db.prepare("SELECT note FROM activation_keys WHERE used_by_user_id = ? AND note IS NOT NULL AND TRIM(note) != '' ORDER BY used_at DESC LIMIT 1").get(userId) as { note: string } | undefined;
  return row?.note ?? null;
}

const REGISTER_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 min
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 min

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Создать одноразовый токен регистрации через Telegram. Возвращает токен и время истечения. */
export function createTelegramRegisterToken(telegramUserId: string, usernameSuggestion?: string | null): { token: string; expiresAt: string } {
  ensureAuthTables();
  const token = randomHex(24);
  const expiresAt = new Date(Date.now() + REGISTER_TOKEN_TTL_MS).toISOString();
  const tid = String(telegramUserId || '').trim();
  const uname = usernameSuggestion != null ? String(usernameSuggestion).trim() || null : null;
  if (isMemoryStore()) {
    memoryRegisterTokens.set(token, { telegram_user_id: tid, username_suggestion: uname, expires_at: expiresAt });
    return { token, expiresAt };
  }
  const db = getDb();
  if (!db) throw new Error('DB unavailable');
  db.prepare('INSERT INTO telegram_register_tokens (token, telegram_user_id, username_suggestion, expires_at) VALUES (?, ?, ?, ?)').run(token, tid, uname, expiresAt);
  return { token, expiresAt };
}

/** Потребить токен регистрации (одноразовый). Возвращает данные или null если невалидный/истёкший. */
export function consumeTelegramRegisterToken(token: string): { telegramUserId: string; usernameSuggestion: string | null } | null {
  ensureAuthTables();
  const t = (token || '').trim();
  if (!t) return null;
  const now = new Date().toISOString();
  if (isMemoryStore()) {
    const row = memoryRegisterTokens.get(t);
    if (!row || row.expires_at < now) return null;
    memoryRegisterTokens.delete(t);
    return { telegramUserId: row.telegram_user_id, usernameSuggestion: row.username_suggestion };
  }
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT telegram_user_id, username_suggestion, expires_at FROM telegram_register_tokens WHERE token = ?').get(t) as
    | { telegram_user_id: string; username_suggestion: string | null; expires_at: string }
    | undefined;
  if (!row || row.expires_at < now) return null;
  db.prepare('DELETE FROM telegram_register_tokens WHERE token = ?').run(t);
  return { telegramUserId: row.telegram_user_id, usernameSuggestion: row.username_suggestion };
}

/** Создать одноразовый токен сброса пароля. */
export function createTelegramResetToken(userId: string): { token: string; expiresAt: string } {
  ensureAuthTables();
  const token = randomHex(24);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  if (isMemoryStore()) {
    memoryResetTokens.set(token, { user_id: userId, expires_at: expiresAt });
    return { token, expiresAt };
  }
  const db = getDb();
  if (!db) throw new Error('DB unavailable');
  db.prepare('INSERT INTO telegram_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return { token, expiresAt };
}

/** Потребить токен сброса пароля (одноразовый). Возвращает user_id или null. */
export function consumeTelegramResetToken(token: string): string | null {
  ensureAuthTables();
  const t = (token || '').trim();
  if (!t) return null;
  const now = new Date().toISOString();
  if (isMemoryStore()) {
    const row = memoryResetTokens.get(t);
    if (!row || row.expires_at < now) return null;
    memoryResetTokens.delete(t);
    return row.user_id;
  }
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM telegram_reset_tokens WHERE token = ?').get(t) as { user_id: string; expires_at: string } | undefined;
  if (!row || row.expires_at < now) return null;
  db.prepare('DELETE FROM telegram_reset_tokens WHERE token = ?').run(t);
  return row.user_id;
}

/** Продление подписки на время (1h, 99d, 30m и т.д.). Базовое время — текущий срок или сейчас. */
export function extendUserSubscription(userId: string, durationStr: string): { activationExpiresAt: string } {
  ensureAuthTables();
  const match = (durationStr || '').trim().match(/^(\d+)(h|d|m)$/i);
  if (!match) throw new Error('Формат: число + h (часы), d (дни) или m (минуты), например 1h или 99d');
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (num < 1) throw new Error('Число должно быть >= 1');
  const nowMs = Date.now();
  let addMs = 0;
  if (unit === 'm') addMs = num * 60 * 1000;
  else if (unit === 'h') addMs = num * 60 * 60 * 1000;
  else addMs = num * 24 * 60 * 60 * 1000;

  let baseMs = nowMs;
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId);
    if (!u) throw new Error('Пользователь не найден');
    const exp = u.activation_expires_at;
    if (exp) {
      const expMs = new Date(exp).getTime();
      if (expMs > nowMs) baseMs = expMs;
    }
    const newExpiry = new Date(baseMs + addMs).toISOString();
    u.activation_expires_at = newExpiry;
    return { activationExpiresAt: newExpiry };
  }
  const db = getDb();
  if (!db) throw new Error('DB unavailable');
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as (UserRow & { activation_expires_at?: string | null }) | undefined;
  if (!u) throw new Error('Пользователь не найден');
  const exp = u.activation_expires_at;
  if (exp) {
    const expMs = new Date(exp).getTime();
    if (expMs > nowMs) baseMs = expMs;
  }
  const newExpiry = new Date(baseMs + addMs).toISOString();
  db.prepare('UPDATE users SET activation_expires_at = ? WHERE id = ?').run(newExpiry, userId);
  return { activationExpiresAt: newExpiry };
}

export function redeemActivationKeyForUser(opts: { userId: string; key: string; proGroupId?: number }): { activationExpiresAt: string; groupId: number } {
  ensureAuthTables();
  const proGroupId = opts.proGroupId ?? 4;
  const key = (opts.key || '').trim().toUpperCase();
  if (!key) throw new Error('Ключ обязателен');

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const getNextExpiry = (current: string | null | undefined, durationDays: number) => {
    const baseMs = current ? Math.max(nowMs, Date.parse(current) || 0) : nowMs;
    const nextMs = baseMs + durationDays * 24 * 60 * 60 * 1000;
    return new Date(nextMs).toISOString();
  };

  if (isMemoryStore()) {
    const k = memoryActivationKeys.find((x) => x.key === key) ?? null;
    if (!k) throw new Error('Ключ не найден');
    if (k.revoked_at) throw new Error('Ключ отозван');
    if (k.used_at) throw new Error('Ключ уже использован');
    const u = memoryUsers.find((x) => x.id === opts.userId);
    if (!u) throw new Error('Пользователь не найден');
    k.used_at = nowIso;
    k.used_by_user_id = opts.userId;
    const activationExpiresAt = getNextExpiry(u.activation_expires_at ?? null, k.duration_days);
    u.activation_expires_at = activationExpiresAt;
    u.group_id = proGroupId;
    if (k.note && k.note.trim()) setUserTelegramId(opts.userId, k.note.trim());
    return { activationExpiresAt, groupId: proGroupId };
  }

  const db = getDb();
  if (!db) throw new Error('DB unavailable');

  const tx = db.transaction(() => {
    const k = db.prepare('SELECT * FROM activation_keys WHERE key = ?').get(key) as ActivationKeyRow | undefined;
    if (!k) throw new Error('Ключ не найден');
    if (k.revoked_at) throw new Error('Ключ отозван');
    if (k.used_at) throw new Error('Ключ уже использован');

    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(opts.userId) as UserRow | undefined;
    if (!u) throw new Error('Пользователь не найден');

    db.prepare('UPDATE activation_keys SET used_by_user_id = ?, used_at = ? WHERE id = ?').run(opts.userId, nowIso, k.id);

    const activationExpiresAt = getNextExpiry((u as any).activation_expires_at ?? null, k.duration_days);
    db.prepare('UPDATE users SET activation_expires_at = ?, group_id = ? WHERE id = ?').run(activationExpiresAt, proGroupId, opts.userId);
    if (k.note && String(k.note).trim()) {
      try {
        db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run(String(k.note).trim(), opts.userId);
      } catch (err) { logger.warn('AuthDB', (err as Error).message); }
    }
    return { activationExpiresAt, groupId: proGroupId };
  });

  return tx();
}

export function banUser(userId: string, reason?: string): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId);
    if (u) {
      u.banned = 1;
      u.ban_reason = reason ?? null;
    }
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?').run(reason ?? null, userId);
}

export function unbanUser(userId: string): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId);
    if (u) {
      u.banned = 0;
      u.ban_reason = null;
    }
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE users SET banned = 0, ban_reason = NULL WHERE id = ?').run(userId);
}

export function getActiveSessionsCount(): number {
  ensureAuthTables();
  if (isMemoryStore()) return new Set(memorySessions.values()).size;
  const db = getDb();
  if (!db) return 0;
  const row = db.prepare('SELECT COUNT(DISTINCT user_id) AS cnt FROM sessions').get() as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

/** Список user_id с активной сессией (для отображения «Онлайн» в админке). */
export function getOnlineUserIds(): string[] {
  ensureAuthTables();
  if (isMemoryStore()) return Array.from(new Set(memorySessions.values()));
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare('SELECT DISTINCT user_id AS id FROM sessions').all() as { id: string }[];
  return rows.map((r) => r.id);
}

export function deleteUser(userId: string): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    for (const [token, uid] of memorySessions.entries()) {
      if (uid === userId) memorySessions.delete(token);
    }
    memoryOkxConnections.delete(userId);
    const i = memoryUsers.findIndex((u) => u.id === userId);
    if (i >= 0) memoryUsers.splice(i, 1);
    return;
  }
  const db = getDb();
  if (!db) return;
  try {
    db.prepare('DELETE FROM user_okx_connections WHERE user_id = ?').run(userId);
  } catch (err) { logger.warn('AuthDB', (err as Error).message); }
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function getTotalUsersCount(): number {
  ensureAuthTables();
  if (isMemoryStore()) return memoryUsers.length;
  const db = getDb();
  if (!db) return 0;
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

/** Список user_id с сохранёнными OKX ключами (для cron sync). */
export function listUserIdsWithOkxCredentials(): string[] {
  ensureAuthTables();
  if (isMemoryStore()) return Array.from(memoryOkxConnections.keys());
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare('SELECT user_id FROM user_okx_connections').all() as { user_id: string }[];
  return rows.map((r) => r.user_id);
}

/** OKX ключи пользователя (для отображения баланса в админке). */
export function getOkxCredentials(userId: string): { apiKey: string; secret: string; passphrase: string } | null {
  ensureAuthTables();
  if (isMemoryStore()) {
    const row = memoryOkxConnections.get(userId);
    return row ? { apiKey: row.api_key, secret: row.secret, passphrase: row.passphrase ?? '' } : null;
  }
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT api_key, secret, passphrase FROM user_okx_connections WHERE user_id = ?').get(userId) as
    | { api_key: string; secret: string; passphrase: string | null }
    | undefined;
  if (!row) return null;
  return {
    apiKey: row.api_key,
    secret: row.secret,
    passphrase: row.passphrase ?? ''
  };
}

/** Сохранить OKX ключи пользователя. */
export function setOkxCredentials(userId: string, creds: { apiKey: string; secret: string; passphrase?: string }): void {
  ensureAuthTables();
  const now = new Date().toISOString();
  const apiKey = (creds.apiKey ?? '').trim();
  const secret = (creds.secret ?? '').trim();
  const passphrase = (creds.passphrase ?? '').trim();
  if (isMemoryStore()) {
    memoryOkxConnections.set(userId, {
      user_id: userId,
      api_key: apiKey,
      secret: secret,
      passphrase: passphrase,
      updated_at: now
    });
    return;
  }
  const db = getDb();
  if (!db) return;
  db.prepare(
    'INSERT INTO user_okx_connections (user_id, api_key, secret, passphrase, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET api_key = ?, secret = ?, passphrase = ?, updated_at = ?'
  ).run(userId, apiKey, secret, passphrase, now, apiKey, secret, passphrase, now);
}
