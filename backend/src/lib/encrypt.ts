/**
 * Шифрование строк для хранения в БД (API-ключи и т.п.).
 * Использует AES-256-GCM. Ключ: ENCRYPTION_KEY из .env (хеш SHA-256 → 32 байта).
 * Если ENCRYPTION_KEY не задан — сохраняем в Base64 без шифрования (только обфускация).
 */

import crypto from 'crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const SALT = 'external_ai_v1';

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw + SALT).digest();
}

export function encrypt(plain: string): string {
  const key = getKey();
  if (!key) {
    return 'b64:' + Buffer.from(plain, 'utf8').toString('base64');
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(encoded: string): string | null {
  if (!encoded) return null;
  if (encoded.startsWith('b64:')) {
    try {
      return Buffer.from(encoded.slice(4), 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  const key = getKey();
  if (!key) return null;
  try {
    const buf = Buffer.from(encoded, 'base64');
    if (buf.length < IV_LEN + AUTH_TAG_LEN) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const enc = buf.subarray(IV_LEN + AUTH_TAG_LEN);
    const decipher = crypto.createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final('utf8');
  } catch {
    return null;
  }
}
