/**
 * Redis Service - Enhanced Caching with Pub/Sub
 *
 * PURPOSE: Provide caching layer with Redis or fallback to in-memory cache
 * Enhanced with pub/sub for real-time features
 *
 * USAGE:
 * import { cache, pubsub } from "~/lib/redis.server";
 * await cache.set("key", value, 3600);
 * const value = await cache.get("key");
 * 
 * // Pub/Sub
 * await pubsub.publish("channel", { event: "update", data: {} });
 * pubsub.subscribe("channel", (message) => console.log(message));
 *
 * LAYER: Infrastructure
 */

import { logger } from "./logger.server";
import type { EventEmitter } from "events";

// ============================================
// Interfaces
// ============================================

interface CacheInterface {
  get: <T>(key: string) => Promise<T | null>;
  set: <T>(key: string, value: T, ttlSeconds?: number) => Promise<void>;
  del: (key: string) => Promise<void>;
  exists: (key: string) => Promise<boolean>;
  incr: (key: string) => Promise<number>;
  decr: (key: string) => Promise<number>;
  expire: (key: string, ttlSeconds: number) => Promise<void>;
  ttl: (key: string) => Promise<number>;
  keys: (pattern: string) => Promise<string[]>;
  flushAll: () => Promise<void>;
  isConnected: () => boolean;
  
  // Hash operations
  hget: <T>(key: string, field: string) => Promise<T | null>;
  hset: <T>(key: string, field: string, value: T) => Promise<void>;
  hdel: (key: string, field: string) => Promise<void>;
  hgetall: <T>(key: string) => Promise<Record<string, T> | null>;
  
  // List operations
  lpush: <T>(key: string, value: T) => Promise<number>;
  rpush: <T>(key: string, value: T) => Promise<number>;
  lpop: <T>(key: string) => Promise<T | null>;
  rpop: <T>(key: string) => Promise<T | null>;
  lrange: <T>(key: string, start: number, stop: number) => Promise<T[]>;
  llen: (key: string) => Promise<number>;
  
  // Set operations
  sadd: (key: string, ...members: string[]) => Promise<number>;
  srem: (key: string, ...members: string[]) => Promise<number>;
  smembers: (key: string) => Promise<string[]>;
  sismember: (key: string, member: string) => Promise<boolean>;
  
  // Sorted set operations
  zadd: (key: string, score: number, member: string) => Promise<number>;
  zrem: (key: string, member: string) => Promise<number>;
  zrange: (key: string, start: number, stop: number) => Promise<string[]>;
  zrangebyscore: (key: string, min: number, max: number) => Promise<string[]>;
}

interface PubSubInterface {
  publish: (channel: string, message: unknown) => Promise<number>;
  subscribe: (channel: string, callback: (message: unknown) => void) => Promise<void>;
  unsubscribe: (channel: string) => Promise<void>;
  psubscribe: (pattern: string, callback: (channel: string, message: unknown) => void) => Promise<void>;
  punsubscribe: (pattern: string) => Promise<void>;
}

type MessageHandler = (message: unknown) => void;
type PatternHandler = (channel: string, message: unknown) => void;

// In-memory cache implementation
class InMemoryCache implements CacheInterface {
  private cache: Map<string, { value: string; expiresAt: number | null }> = new Map();
  private hashes: Map<string, Map<string, string>> = new Map();
  private lists: Map<string, string[]> = new Map();
  private sets: Map<string, Set<string>> = new Map();
  private sortedSets: Map<string, Map<string, number>> = new Map();

  private checkExpiry(key: string): boolean {
    const item = this.cache.get(key);
    if (item?.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.checkExpiry(key)) return null;
    const item = this.cache.get(key);
    if (!item) return null;

    try {
      return JSON.parse(item.value) as T;
    } catch {
      return item.value as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.cache.set(key, { value: serialized, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
    this.hashes.delete(key);
    this.lists.delete(key);
    this.sets.delete(key);
    this.sortedSets.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    if (this.checkExpiry(key)) return false;
    return this.cache.has(key) || this.hashes.has(key) || 
           this.lists.has(key) || this.sets.has(key) || this.sortedSets.has(key);
  }

  async incr(key: string): Promise<number> {
    const current = await this.get<number>(key);
    const newValue = (current || 0) + 1;
    await this.set(key, newValue);
    return newValue;
  }

  async decr(key: string): Promise<number> {
    const current = await this.get<number>(key);
    const newValue = (current || 0) - 1;
    await this.set(key, newValue);
    return newValue;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const item = this.cache.get(key);
    if (item) {
      item.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  }

  async ttl(key: string): Promise<number> {
    const item = this.cache.get(key);
    if (!item || !item.expiresAt) return -1;
    const remaining = Math.floor((item.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
    return Array.from(this.cache.keys()).filter((key) => regex.test(key));
  }

  async flushAll(): Promise<void> {
    this.cache.clear();
    this.hashes.clear();
    this.lists.clear();
    this.sets.clear();
    this.sortedSets.clear();
  }

  isConnected(): boolean {
    return true;
  }

  // Hash operations
  async hget<T>(key: string, field: string): Promise<T | null> {
    const hash = this.hashes.get(key);
    if (!hash) return null;
    const value = hash.get(field);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async hset<T>(key: string, field: string, value: T): Promise<void> {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    this.hashes.get(key)!.set(field, serialized);
  }

  async hdel(key: string, field: string): Promise<void> {
    this.hashes.get(key)?.delete(field);
  }

  async hgetall<T>(key: string): Promise<Record<string, T> | null> {
    const hash = this.hashes.get(key);
    if (!hash) return null;
    const result: Record<string, T> = {};
    for (const [field, value] of hash) {
      try {
        result[field] = JSON.parse(value) as T;
      } catch {
        result[field] = value as unknown as T;
      }
    }
    return result;
  }

  // List operations
  async lpush<T>(key: string, value: T): Promise<number> {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    this.lists.get(key)!.unshift(serialized);
    return this.lists.get(key)!.length;
  }

  async rpush<T>(key: string, value: T): Promise<number> {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    this.lists.get(key)!.push(serialized);
    return this.lists.get(key)!.length;
  }

  async lpop<T>(key: string): Promise<T | null> {
    const list = this.lists.get(key);
    if (!list || list.length === 0) return null;
    const value = list.shift()!;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async rpop<T>(key: string): Promise<T | null> {
    const list = this.lists.get(key);
    if (!list || list.length === 0) return null;
    const value = list.pop()!;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const list = this.lists.get(key);
    if (!list) return [];
    const end = stop < 0 ? list.length + stop + 1 : stop + 1;
    return list.slice(start, end).map((v) => {
      try {
        return JSON.parse(v) as T;
      } catch {
        return v as unknown as T;
      }
    });
  }

  async llen(key: string): Promise<number> {
    return this.lists.get(key)?.length || 0;
  }

  // Set operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) removed++;
    }
    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) || []);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    return this.sets.get(key)?.has(member) || false;
  }

  // Sorted set operations
  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, new Map());
    }
    const existed = this.sortedSets.get(key)!.has(member);
    this.sortedSets.get(key)!.set(member, score);
    return existed ? 0 : 1;
  }

  async zrem(key: string, member: string): Promise<number> {
    return this.sortedSets.get(key)?.delete(member) ? 1 : 0;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const zset = this.sortedSets.get(key);
    if (!zset) return [];
    const sorted = Array.from(zset.entries()).sort((a, b) => a[1] - b[1]).map((e) => e[0]);
    const end = stop < 0 ? sorted.length + stop + 1 : stop + 1;
    return sorted.slice(start, end);
  }

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    const zset = this.sortedSets.get(key);
    if (!zset) return [];
    return Array.from(zset.entries())
      .filter(([, score]) => score >= min && score <= max)
      .sort((a, b) => a[1] - b[1])
      .map((e) => e[0]);
  }
}

// In-memory pub/sub implementation
class InMemoryPubSub implements PubSubInterface {
  private channels: Map<string, Set<MessageHandler>> = new Map();
  private patterns: Map<string, Set<PatternHandler>> = new Map();

  async publish(channel: string, message: unknown): Promise<number> {
    let count = 0;
    
    // Direct channel subscribers
    const handlers = this.channels.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message);
          count++;
        } catch (error) {
          logger.error("PubSub handler error", { error, channel });
        }
      }
    }
    
    // Pattern subscribers
    for (const [pattern, patternHandlers] of this.patterns) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      if (regex.test(channel)) {
        for (const handler of patternHandlers) {
          try {
            handler(channel, message);
            count++;
          } catch (error) {
            logger.error("PubSub pattern handler error", { error, pattern, channel });
          }
        }
      }
    }
    
    return count;
  }

  async subscribe(channel: string, callback: MessageHandler): Promise<void> {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(callback);
    logger.info("Subscribed to channel", { channel });
  }

  async unsubscribe(channel: string): Promise<void> {
    this.channels.delete(channel);
    logger.info("Unsubscribed from channel", { channel });
  }

  async psubscribe(pattern: string, callback: PatternHandler): Promise<void> {
    if (!this.patterns.has(pattern)) {
      this.patterns.set(pattern, new Set());
    }
    this.patterns.get(pattern)!.add(callback);
    logger.info("Pattern subscribed", { pattern });
  }

  async punsubscribe(pattern: string): Promise<void> {
    this.patterns.delete(pattern);
    logger.info("Pattern unsubscribed", { pattern });
  }
}

// Redis cache implementation
class RedisCache implements CacheInterface {
  private client: import("ioredis").Redis | null = null;
  private connecting: Promise<void> | null = null;
  private connected: boolean = false;

  constructor() {
    this.connect();
  }

  private async connect(): Promise<void> {
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        const Redis = (await import("ioredis")).default;
        this.client = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            if (times > 3) return null;
            return Math.min(times * 200, 2000);
          },
        });

        this.client.on("connect", () => {
          this.connected = true;
          logger.info("Redis connected");
        });

        this.client.on("error", (error) => {
          this.connected = false;
          logger.error("Redis error", { error: error.message });
        });

        this.client.on("close", () => {
          this.connected = false;
          logger.warn("Redis connection closed");
        });
      } catch (error) {
        logger.warn("Redis not available, using in-memory cache", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    })();

    return this.connecting;
  }

  private async getClient(): Promise<import("ioredis").Redis> {
    if (this.client && this.connected) return this.client;
    await this.connect();
    if (!this.client) throw new Error("Redis client not initialized");
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    const client = await this.getClient();
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const client = await this.getClient();
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, serialized);
    } else {
      await client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    const client = await this.getClient();
    await client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const client = await this.getClient();
    const result = await client.exists(key);
    return result === 1;
  }

  async incr(key: string): Promise<number> {
    const client = await this.getClient();
    return await client.incr(key);
  }

  async decr(key: string): Promise<number> {
    const client = await this.getClient();
    return await client.decr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const client = await this.getClient();
    await client.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    const client = await this.getClient();
    return await client.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const client = await this.getClient();
    return await client.keys(pattern);
  }

  async flushAll(): Promise<void> {
    const client = await this.getClient();
    await client.flushall();
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Hash operations
  async hget<T>(key: string, field: string): Promise<T | null> {
    const client = await this.getClient();
    const value = await client.hget(key, field);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async hset<T>(key: string, field: string, value: T): Promise<void> {
    const client = await this.getClient();
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    await client.hset(key, field, serialized);
  }

  async hdel(key: string, field: string): Promise<void> {
    const client = await this.getClient();
    await client.hdel(key, field);
  }

  async hgetall<T>(key: string): Promise<Record<string, T> | null> {
    const client = await this.getClient();
    const hash = await client.hgetall(key);
    if (!hash || Object.keys(hash).length === 0) return null;
    const result: Record<string, T> = {};
    for (const [field, value] of Object.entries(hash)) {
      try {
        result[field] = JSON.parse(value) as T;
      } catch {
        result[field] = value as unknown as T;
      }
    }
    return result;
  }

  // List operations
  async lpush<T>(key: string, value: T): Promise<number> {
    const client = await this.getClient();
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return await client.lpush(key, serialized);
  }

  async rpush<T>(key: string, value: T): Promise<number> {
    const client = await this.getClient();
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return await client.rpush(key, serialized);
  }

  async lpop<T>(key: string): Promise<T | null> {
    const client = await this.getClient();
    const value = await client.lpop(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async rpop<T>(key: string): Promise<T | null> {
    const client = await this.getClient();
    const value = await client.rpop(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const client = await this.getClient();
    const values = await client.lrange(key, start, stop);
    return values.map((v) => {
      try {
        return JSON.parse(v) as T;
      } catch {
        return v as unknown as T;
      }
    });
  }

  async llen(key: string): Promise<number> {
    const client = await this.getClient();
    return await client.llen(key);
  }

  // Set operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    const client = await this.getClient();
    return await client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const client = await this.getClient();
    return await client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    const client = await this.getClient();
    return await client.smembers(key);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    const client = await this.getClient();
    return (await client.sismember(key, member)) === 1;
  }

  // Sorted set operations
  async zadd(key: string, score: number, member: string): Promise<number> {
    const client = await this.getClient();
    return await client.zadd(key, score, member);
  }

  async zrem(key: string, member: string): Promise<number> {
    const client = await this.getClient();
    return await client.zrem(key, member);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const client = await this.getClient();
    return await client.zrange(key, start, stop);
  }

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    const client = await this.getClient();
    return await client.zrangebyscore(key, min, max);
  }
}

// Redis pub/sub implementation
class RedisPubSub implements PubSubInterface {
  private subscriber: import("ioredis").Redis | null = null;
  private publisher: import("ioredis").Redis | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private patternHandlers: Map<string, Set<PatternHandler>> = new Map();
  private connected: boolean = false;

  constructor() {
    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const Redis = (await import("ioredis")).default;
      const url = process.env.REDIS_URL || "redis://localhost:6379";
      
      this.publisher = new Redis(url);
      this.subscriber = new Redis(url);

      this.subscriber.on("message", (channel: string, message: string) => {
        const handlers = this.handlers.get(channel);
        if (handlers) {
          try {
            const parsed = JSON.parse(message);
            handlers.forEach((handler) => handler(parsed));
          } catch {
            handlers.forEach((handler) => handler(message));
          }
        }
      });

      this.subscriber.on("pmessage", (pattern: string, channel: string, message: string) => {
        const handlers = this.patternHandlers.get(pattern);
        if (handlers) {
          try {
            const parsed = JSON.parse(message);
            handlers.forEach((handler) => handler(channel, parsed));
          } catch {
            handlers.forEach((handler) => handler(channel, message));
          }
        }
      });

      this.connected = true;
      logger.info("Redis PubSub connected");
    } catch (error) {
      logger.warn("Redis PubSub not available", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async publish(channel: string, message: unknown): Promise<number> {
    if (!this.publisher) return 0;
    const serialized = typeof message === "string" ? message : JSON.stringify(message);
    return await this.publisher.publish(channel, serialized);
  }

  async subscribe(channel: string, callback: MessageHandler): Promise<void> {
    if (!this.subscriber) return;
    
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
      await this.subscriber.subscribe(channel);
    }
    this.handlers.get(channel)!.add(callback);
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.subscriber) return;
    this.handlers.delete(channel);
    await this.subscriber.unsubscribe(channel);
  }

  async psubscribe(pattern: string, callback: PatternHandler): Promise<void> {
    if (!this.subscriber) return;
    
    if (!this.patternHandlers.has(pattern)) {
      this.patternHandlers.set(pattern, new Set());
      await this.subscriber.psubscribe(pattern);
    }
    this.patternHandlers.get(pattern)!.add(callback);
  }

  async punsubscribe(pattern: string): Promise<void> {
    if (!this.subscriber) return;
    this.patternHandlers.delete(pattern);
    await this.subscriber.punsubscribe(pattern);
  }
}

// Factory function to create cache
function createCache(): CacheInterface {
  // Try Redis first, fallback to in-memory
  if (process.env.REDIS_URL || process.env.NODE_ENV === "production") {
    try {
      return new RedisCache();
    } catch {
      logger.warn("Redis unavailable, using in-memory cache");
    }
  }

  return new InMemoryCache();
}

// Factory function to create pub/sub
function createPubSub(): PubSubInterface {
  if (process.env.REDIS_URL || process.env.NODE_ENV === "production") {
    try {
      return new RedisPubSub();
    } catch {
      logger.warn("Redis PubSub unavailable, using in-memory");
    }
  }

  return new InMemoryPubSub();
}

export const cache = createCache();
export const pubsub = createPubSub();

// ============================================
// Helper Functions
// ============================================

// Helper for rate limiting
export async function checkRateLimit(
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key = `ratelimit:${identifier}`;

  const count = await cache.incr(key);

  if (count === 1) {
    await cache.expire(key, windowSeconds);
  }

  const ttl = await cache.ttl(key);

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetIn: ttl > 0 ? ttl : windowSeconds,
  };
}

// Helper for distributed locks
export async function acquireLock(
  key: string,
  ttlSeconds: number = 30
): Promise<{ acquired: boolean; release: () => Promise<void> }> {
  const lockKey = `lock:${key}`;
  const lockValue = crypto.randomUUID();
  
  // Try to set lock with NX (only if not exists)
  const exists = await cache.exists(lockKey);
  if (exists) {
    return { acquired: false, release: async () => {} };
  }
  
  await cache.set(lockKey, lockValue, ttlSeconds);
  
  return {
    acquired: true,
    release: async () => {
      const currentValue = await cache.get<string>(lockKey);
      if (currentValue === lockValue) {
        await cache.del(lockKey);
      }
    },
  };
}

// Helper for caching with automatic refresh
export async function getOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const value = await fetchFn();
  await cache.set(key, value, ttlSeconds);
  return value;
}

// Helper for cache invalidation patterns
export async function invalidatePattern(pattern: string): Promise<number> {
  const keys = await cache.keys(pattern);
  let count = 0;
  for (const key of keys) {
    await cache.del(key);
    count++;
  }
  return count;
}

// Helper for sliding window rate limiting (more accurate)
export async function checkSlidingWindowRateLimit(
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const key = `ratelimit:sw:${identifier}`;

  // Remove old entries
  const entries = await cache.zrangebyscore(key, 0, windowStart);
  for (const entry of entries) {
    await cache.zrem(key, entry);
  }

  // Count current entries
  const currentEntries = await cache.zrange(key, 0, -1);
  const count = currentEntries.length;

  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: windowSeconds,
    };
  }

  // Add new entry
  await cache.zadd(key, now, `${now}:${crypto.randomUUID()}`);
  await cache.expire(key, windowSeconds);

  return {
    allowed: true,
    remaining: limit - count - 1,
    resetIn: windowSeconds,
  };
}

// Need to import crypto for the helper functions
import crypto from "crypto";
