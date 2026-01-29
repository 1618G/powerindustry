/**
 * Idempotency Service
 * 
 * Ensures operations are executed only once even under retries.
 * Uses Redis or Postgres for tracking execution state.
 */

import { cache } from "~/lib/redis.server";
import { db } from "~/lib/prisma";
import { logger } from "~/lib/logger.server";
import { getRequestContext } from "~/lib/request-context.server";

// ============================================
// Types
// ============================================

export interface IdempotencyResult<T> {
  executed: boolean;  // Whether the function was actually executed
  result: T;          // The result (from execution or cache)
  cached: boolean;    // Whether result came from cache
}

// ============================================
// Redis-backed Idempotency
// ============================================

/**
 * Execute a function with idempotency guarantee using Redis.
 * If the key exists, returns the cached result.
 * If not, executes the function and caches the result.
 * 
 * @param key - Unique idempotency key
 * @param ttlSeconds - How long to remember the execution (default: 24 hours)
 * @param fn - The function to execute
 */
export async function withIdempotency<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<IdempotencyResult<T>> {
  const fullKey = `idempotency:${key}`;
  const requestContext = getRequestContext();

  try {
    // Check if already executed
    const existing = await cache.get(fullKey);
    if (existing) {
      logger.debug("Idempotency hit - returning cached result", {
        key,
        correlationId: requestContext?.correlationId,
      });
      return {
        executed: false,
        result: JSON.parse(existing) as T,
        cached: true,
      };
    }

    // Try to acquire lock (set NX = only if not exists)
    const lockKey = `${fullKey}:lock`;
    const acquired = await acquireLock(lockKey, 60); // 60 second lock timeout
    
    if (!acquired) {
      // Another process is executing, wait and check for result
      await sleep(100);
      return waitForResult<T>(fullKey, ttlSeconds);
    }

    try {
      // Execute the function
      const result = await fn();

      // Cache the result
      await cache.set(fullKey, JSON.stringify(result), { ttl: ttlSeconds });

      logger.debug("Idempotency miss - executed and cached", {
        key,
        correlationId: requestContext?.correlationId,
      });

      return {
        executed: true,
        result,
        cached: false,
      };
    } finally {
      // Release lock
      await releaseLock(lockKey);
    }
  } catch (error) {
    logger.error("Idempotency check failed", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    // On error, execute anyway (fail open for availability)
    const result = await fn();
    return { executed: true, result, cached: false };
  }
}

// ============================================
// Database-backed Idempotency (for critical ops)
// ============================================

/**
 * Execute with database-backed idempotency.
 * More durable than Redis, suitable for financial operations.
 */
export async function withDatabaseIdempotency<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<IdempotencyResult<T>> {
  const requestContext = getRequestContext();

  try {
    // Check existing record
    const existing = await db.$queryRaw<{ result: string }[]>`
      SELECT result FROM "IdempotencyRecord"
      WHERE key = ${key}
      AND expires_at > NOW()
      LIMIT 1
    `;

    if (existing.length > 0) {
      logger.debug("DB Idempotency hit", { key });
      return {
        executed: false,
        result: JSON.parse(existing[0].result) as T,
        cached: true,
      };
    }

    // Execute with advisory lock
    const lockId = hashStringToInt(key);
    
    await db.$executeRaw`SELECT pg_advisory_lock(${lockId})`;

    try {
      // Double-check after acquiring lock
      const recheck = await db.$queryRaw<{ result: string }[]>`
        SELECT result FROM "IdempotencyRecord"
        WHERE key = ${key}
        AND expires_at > NOW()
        LIMIT 1
      `;

      if (recheck.length > 0) {
        return {
          executed: false,
          result: JSON.parse(recheck[0].result) as T,
          cached: true,
        };
      }

      // Execute
      const result = await fn();

      // Store result
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await db.$executeRaw`
        INSERT INTO "IdempotencyRecord" (key, result, expires_at, created_at)
        VALUES (${key}, ${JSON.stringify(result)}, ${expiresAt}, NOW())
        ON CONFLICT (key) DO UPDATE SET
          result = ${JSON.stringify(result)},
          expires_at = ${expiresAt}
      `;

      logger.debug("DB Idempotency miss - executed", {
        key,
        correlationId: requestContext?.correlationId,
      });

      return { executed: true, result, cached: false };
    } finally {
      await db.$executeRaw`SELECT pg_advisory_unlock(${lockId})`;
    }
  } catch (error) {
    logger.error("DB Idempotency failed", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    // Fail open
    const result = await fn();
    return { executed: true, result, cached: false };
  }
}

// ============================================
// Helper Functions
// ============================================

async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  // Use Redis SETNX pattern
  const result = await cache.set(key, "1", { ttl: ttlSeconds });
  return result !== null;
}

async function releaseLock(key: string): Promise<void> {
  await cache.del(key);
}

async function waitForResult<T>(
  key: string,
  maxWaitSeconds: number
): Promise<IdempotencyResult<T>> {
  const maxAttempts = Math.min(maxWaitSeconds * 10, 100); // Poll every 100ms
  
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(100);
    const result = await cache.get(key);
    if (result) {
      return {
        executed: false,
        result: JSON.parse(result) as T,
        cached: true,
      };
    }
  }
  
  throw new Error("Timeout waiting for idempotent operation result");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// ============================================
// Common Idempotency Keys
// ============================================

export function emailIdempotencyKey(
  type: string,
  recipientId: string,
  uniqueId: string
): string {
  return `email:${type}:${recipientId}:${uniqueId}`;
}

export function webhookIdempotencyKey(
  webhookId: string,
  deliveryId: string
): string {
  return `webhook:${webhookId}:${deliveryId}`;
}

export function paymentIdempotencyKey(
  orderId: string,
  action: string
): string {
  return `payment:${orderId}:${action}`;
}

export function jobIdempotencyKey(
  jobType: string,
  uniqueId: string
): string {
  return `job:${jobType}:${uniqueId}`;
}
