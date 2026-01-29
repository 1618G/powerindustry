/**
 * Feature Flags Service
 * 
 * Database-backed feature flags with Redis caching.
 * Supports global, org-scoped, and user-scoped flags.
 */

import { db } from "~/lib/prisma";
import { cache } from "~/lib/redis.server";
import { logger } from "~/lib/logger.server";
import type { FlagScope } from "@prisma/client";

// ============================================
// Types
// ============================================

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  scope: FlagScope;
  orgId: string | null;
  metadata: Record<string, unknown> | null;
}

interface FlagContext {
  userId?: string;
  orgId?: string;
}

// ============================================
// Constants
// ============================================

const CACHE_PREFIX = "feature_flag:";
const CACHE_TTL = 60; // 1 minute cache

// ============================================
// Core Functions
// ============================================

/**
 * Check if a feature flag is enabled
 * @param key - The feature flag key
 * @param context - Optional context for org/user-scoped flags
 * @returns boolean - Whether the flag is enabled (defaults to false)
 */
export async function isFlagEnabled(
  key: string,
  context: FlagContext = {}
): Promise<boolean> {
  try {
    // Try cache first
    const cacheKey = buildCacheKey(key, context);
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      return cached === "1";
    }

    // Query database
    const flag = await getFlag(key, context);
    const enabled = flag?.enabled ?? false;

    // Cache result
    await cache.set(cacheKey, enabled ? "1" : "0", { ttl: CACHE_TTL });

    return enabled;
  } catch (error) {
    logger.warn("Error checking feature flag", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false; // Safe default
  }
}

/**
 * Get a feature flag by key with scope resolution
 */
async function getFlag(
  key: string,
  context: FlagContext
): Promise<FeatureFlag | null> {
  // Check org-scoped flag first if orgId provided
  if (context.orgId) {
    const orgFlag = await db.featureFlag.findFirst({
      where: {
        key,
        scope: "ORG",
        orgId: context.orgId,
      },
    });
    if (orgFlag) {
      return {
        ...orgFlag,
        metadata: orgFlag.metadata as Record<string, unknown> | null,
      };
    }
  }

  // Fall back to global flag
  const globalFlag = await db.featureFlag.findFirst({
    where: {
      key,
      scope: "GLOBAL",
    },
  });

  if (globalFlag) {
    return {
      ...globalFlag,
      metadata: globalFlag.metadata as Record<string, unknown> | null,
    };
  }

  return null;
}

function buildCacheKey(key: string, context: FlagContext): string {
  if (context.orgId) {
    return `${CACHE_PREFIX}${key}:org:${context.orgId}`;
  }
  return `${CACHE_PREFIX}${key}:global`;
}

// ============================================
// Admin Functions
// ============================================

/**
 * Create a new feature flag
 */
export async function createFlag(data: {
  key: string;
  name: string;
  description?: string;
  enabled?: boolean;
  scope?: FlagScope;
  orgId?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}): Promise<FeatureFlag> {
  const flag = await db.featureFlag.create({
    data: {
      key: data.key,
      name: data.name,
      description: data.description,
      enabled: data.enabled ?? false,
      scope: data.scope ?? "GLOBAL",
      orgId: data.orgId,
      metadata: data.metadata ?? null,
      createdBy: data.createdBy,
    },
  });

  // Invalidate cache
  await invalidateFlagCache(data.key);

  logger.info("Feature flag created", { key: data.key, enabled: flag.enabled });

  return {
    ...flag,
    metadata: flag.metadata as Record<string, unknown> | null,
  };
}

/**
 * Update a feature flag
 */
export async function updateFlag(
  id: string,
  data: {
    name?: string;
    description?: string;
    enabled?: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<FeatureFlag> {
  const flag = await db.featureFlag.update({
    where: { id },
    data: {
      ...data,
      metadata: data.metadata ?? undefined,
    },
  });

  // Invalidate cache
  await invalidateFlagCache(flag.key);

  logger.info("Feature flag updated", { key: flag.key, enabled: flag.enabled });

  return {
    ...flag,
    metadata: flag.metadata as Record<string, unknown> | null,
  };
}

/**
 * Toggle a feature flag
 */
export async function toggleFlag(id: string): Promise<FeatureFlag> {
  const existing = await db.featureFlag.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Feature flag not found");
  }

  return updateFlag(id, { enabled: !existing.enabled });
}

/**
 * Delete a feature flag
 */
export async function deleteFlag(id: string): Promise<void> {
  const flag = await db.featureFlag.findUnique({ where: { id } });
  if (!flag) return;

  await db.featureFlag.delete({ where: { id } });
  await invalidateFlagCache(flag.key);

  logger.info("Feature flag deleted", { key: flag.key });
}

/**
 * List all feature flags
 */
export async function listFlags(filters?: {
  scope?: FlagScope;
  orgId?: string;
  enabled?: boolean;
}): Promise<FeatureFlag[]> {
  const flags = await db.featureFlag.findMany({
    where: {
      scope: filters?.scope,
      orgId: filters?.orgId,
      enabled: filters?.enabled,
    },
    orderBy: [{ scope: "asc" }, { key: "asc" }],
  });

  return flags.map((flag) => ({
    ...flag,
    metadata: flag.metadata as Record<string, unknown> | null,
  }));
}

/**
 * Invalidate cache for a flag
 */
async function invalidateFlagCache(key: string): Promise<void> {
  // Use pattern delete for all scopes
  const patterns = [
    `${CACHE_PREFIX}${key}:global`,
    `${CACHE_PREFIX}${key}:org:*`,
  ];

  for (const pattern of patterns) {
    try {
      await cache.del(pattern);
    } catch {
      // Ignore cache errors
    }
  }
}

// ============================================
// Built-in Flags
// ============================================

export const Flags = {
  // Feature toggles
  ENABLE_AI_FEATURES: "enable_ai_features",
  ENABLE_MARKETPLACE: "enable_marketplace",
  ENABLE_BETA_UI: "enable_beta_ui",
  
  // Ops toggles
  ENABLE_DEBUG_MODE: "enable_debug_mode",
  ENABLE_DETAILED_ERRORS: "enable_detailed_errors",
  MAINTENANCE_MODE: "maintenance_mode",
  
  // Rate limit overrides
  DISABLE_RATE_LIMITING: "disable_rate_limiting",
} as const;

/**
 * Seed default flags if they don't exist
 */
export async function seedDefaultFlags(): Promise<void> {
  const defaults = [
    { key: Flags.ENABLE_AI_FEATURES, name: "AI Features", enabled: false },
    { key: Flags.ENABLE_MARKETPLACE, name: "Marketplace", enabled: false },
    { key: Flags.ENABLE_BETA_UI, name: "Beta UI", enabled: false },
    { key: Flags.ENABLE_DEBUG_MODE, name: "Debug Mode", enabled: false },
    { key: Flags.ENABLE_DETAILED_ERRORS, name: "Detailed Errors", enabled: false },
    { key: Flags.MAINTENANCE_MODE, name: "Maintenance Mode", enabled: false },
    { key: Flags.DISABLE_RATE_LIMITING, name: "Disable Rate Limiting", enabled: false },
  ];

  for (const flag of defaults) {
    const exists = await db.featureFlag.findUnique({ where: { key: flag.key } });
    if (!exists) {
      await db.featureFlag.create({
        data: {
          ...flag,
          scope: "GLOBAL",
        },
      });
    }
  }
}
