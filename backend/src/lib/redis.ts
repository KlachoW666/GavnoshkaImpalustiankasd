/**
 * Optional Redis client. Connects only when REDIS_URL is set.
 * Use for sessions, rate limiting, cache (Phase 3 plan).
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL?.trim();

export const redis: Redis | null = REDIS_URL ? new Redis(REDIS_URL, { maxRetriesPerRequest: 3 }) : null;

export function isRedisAvailable(): boolean {
  return redis !== null;
}
