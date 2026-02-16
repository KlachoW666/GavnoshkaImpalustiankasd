/**
 * In-memory rate limiter by IP. For production at scale consider Redis store.
 * Bounded map prevents unbounded memory growth. Cleanup interval is periodic.
 */

import { Request, Response, NextFunction } from 'express';

interface Entry {
  count: number;
  resetAt: number;
}

const MAX_STORE_SIZE = 10_000;
const store = new Map<string, Entry>();

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function rateLimit(options: { windowMs: number; max: number }) {
  const { windowMs, max } = options;
  return (req: Request, res: Response, next: NextFunction) => {
    const key = getClientIp(req);
    const now = Date.now();
    let entry = store.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.status(429).json({
        error: 'Слишком много запросов. Попробуйте позже.',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000)
      });
      return;
    }
    // Evict oldest entries if store exceeds max size
    if (store.size > MAX_STORE_SIZE) {
      const toDelete = store.size - MAX_STORE_SIZE;
      let deleted = 0;
      for (const [k] of store) {
        if (deleted >= toDelete) break;
        store.delete(k);
        deleted++;
      }
    }
    next();
  };
}

/** Clean old entries periodically to avoid memory leak */
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (now >= v.resetAt) store.delete(k);
  }
}, 60 * 1000);
cleanupInterval.unref();
