/**
 * Delta Sync Service - Real-time Data Synchronization
 *
 * PURPOSE: Enable efficient client-server data synchronization with delta updates
 *
 * FEATURES:
 * - Delta sync (only changed records since last sync)
 * - Conflict resolution
 * - Offline-first support
 * - Version tracking
 * - Tombstone support for deletes
 *
 * USAGE:
 * // Server - Get changes
 * const changes = await getSyncChanges("users", userId, lastSyncTimestamp);
 *
 * // Server - Apply changes from client
 * const result = await applySyncChanges("users", userId, clientChanges);
 *
 * LAYER: Service
 */

import { db } from "~/lib/prisma";
import { cache } from "~/lib/redis.server";
import { logAuditTrail } from "./soc2-compliance.server";
import { ConflictError, BadRequestError } from "~/lib/errors";

// ============================================
// Types
// ============================================

export interface SyncableRecord {
  id: string;
  updatedAt: Date;
  version: number;
  deletedAt?: Date | null;
}

export interface SyncChange<T = Record<string, unknown>> {
  id: string;
  operation: "create" | "update" | "delete";
  data: T;
  version: number;
  timestamp: number;
  clientId?: string;
}

export interface SyncRequest {
  entityType: string;
  lastSyncTimestamp: number;
  lastSyncVersion?: number;
  clientChanges?: SyncChange[];
  clientId?: string;
}

export interface SyncResponse<T = Record<string, unknown>> {
  serverChanges: SyncChange<T>[];
  syncTimestamp: number;
  syncVersion: number;
  conflicts?: SyncConflict[];
  deletedIds?: string[];
}

export interface SyncConflict {
  id: string;
  clientVersion: number;
  serverVersion: number;
  clientData: Record<string, unknown>;
  serverData: Record<string, unknown>;
  resolution?: "client_wins" | "server_wins" | "merge";
}

export interface SyncMetadata {
  userId: string;
  entityType: string;
  lastSyncTimestamp: number;
  lastSyncVersion: number;
  clientId?: string;
}

// ============================================
// Configuration
// ============================================

// How long to keep tombstones (deleted records)
const TOMBSTONE_RETENTION_DAYS = 30;

// Cache TTL for sync cursors
const SYNC_CURSOR_TTL = 86400; // 24 hours

// ============================================
// Sync State Management
// ============================================

/**
 * Get the last sync state for a user/entity combination
 */
export async function getSyncState(
  userId: string,
  entityType: string,
  clientId?: string
): Promise<SyncMetadata | null> {
  const cacheKey = `sync:${userId}:${entityType}:${clientId || "default"}`;
  return cache.get<SyncMetadata>(cacheKey);
}

/**
 * Update sync state after successful sync
 */
export async function updateSyncState(
  userId: string,
  entityType: string,
  timestamp: number,
  version: number,
  clientId?: string
): Promise<void> {
  const cacheKey = `sync:${userId}:${entityType}:${clientId || "default"}`;
  await cache.set<SyncMetadata>(
    cacheKey,
    {
      userId,
      entityType,
      lastSyncTimestamp: timestamp,
      lastSyncVersion: version,
      clientId,
    },
    SYNC_CURSOR_TTL
  );
}

// ============================================
// Delta Sync Operations
// ============================================

/**
 * Get all changes since the last sync timestamp
 */
export async function getSyncChanges<T extends SyncableRecord>(
  entityType: string,
  userId: string,
  lastSyncTimestamp: number,
  options: {
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<SyncResponse<T>> {
  const { includeDeleted = true, limit = 100, offset = 0 } = options;
  const since = new Date(lastSyncTimestamp);

  // Get entity-specific query based on entityType
  const changes = await getEntityChanges<T>(entityType, userId, since, {
    includeDeleted,
    limit,
    offset,
  });

  // Get deleted record IDs (tombstones)
  const deletedIds = includeDeleted
    ? await getDeletedIds(entityType, userId, since)
    : [];

  // Calculate sync metadata
  const now = Date.now();
  let maxVersion = 0;

  const serverChanges: SyncChange<T>[] = changes.map((record) => {
    if (record.version > maxVersion) {
      maxVersion = record.version;
    }

    return {
      id: record.id,
      operation: record.deletedAt ? "delete" : "update",
      data: record,
      version: record.version,
      timestamp: record.updatedAt.getTime(),
    };
  });

  return {
    serverChanges,
    syncTimestamp: now,
    syncVersion: maxVersion,
    deletedIds,
  };
}

/**
 * Apply changes from client to server
 */
export async function applySyncChanges<T extends SyncableRecord>(
  entityType: string,
  userId: string,
  changes: SyncChange<Partial<T>>[],
  options: {
    conflictResolution?: "client_wins" | "server_wins" | "manual";
    clientId?: string;
  } = {}
): Promise<{
  applied: string[];
  conflicts: SyncConflict[];
  errors: Array<{ id: string; error: string }>;
}> {
  const { conflictResolution = "server_wins", clientId } = options;
  
  const applied: string[] = [];
  const conflicts: SyncConflict[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const change of changes) {
    try {
      // Get current server version
      const serverRecord = await getEntityById<T>(entityType, change.id, userId);

      // Check for conflicts
      if (serverRecord && serverRecord.version > change.version) {
        const conflict: SyncConflict = {
          id: change.id,
          clientVersion: change.version,
          serverVersion: serverRecord.version,
          clientData: change.data as Record<string, unknown>,
          serverData: serverRecord as unknown as Record<string, unknown>,
        };

        if (conflictResolution === "manual") {
          conflicts.push(conflict);
          continue;
        }

        if (conflictResolution === "server_wins") {
          // Keep server version, skip client change
          conflict.resolution = "server_wins";
          conflicts.push(conflict);
          continue;
        }

        // client_wins - proceed with applying change
        conflict.resolution = "client_wins";
        conflicts.push(conflict);
      }

      // Apply the change
      switch (change.operation) {
        case "create":
          await createEntity(entityType, userId, change.data, clientId);
          applied.push(change.id);
          break;

        case "update":
          await updateEntity(entityType, userId, change.id, change.data, change.version);
          applied.push(change.id);
          break;

        case "delete":
          await deleteEntity(entityType, userId, change.id);
          applied.push(change.id);
          break;
      }
    } catch (error) {
      errors.push({
        id: change.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Log sync activity
  await logAuditTrail(userId, "sync.applied", {
    resource: entityType,
    details: {
      applied: applied.length,
      conflicts: conflicts.length,
      errors: errors.length,
      clientId,
    },
  });

  return { applied, conflicts, errors };
}

// ============================================
// Entity Operations (Pluggable)
// ============================================

// Define supported entity types and their Prisma models
type EntityConfig = {
  model: string;
  ownerField: string;
  selectFields?: Record<string, boolean>;
  relations?: Record<string, unknown>;
};

const ENTITY_CONFIGS: Record<string, EntityConfig> = {
  // Example entities - customize for your app
  settings: {
    model: "Setting",
    ownerField: "userId",
    selectFields: {
      id: true,
      key: true,
      value: true,
      type: true,
      updatedAt: true,
    },
  },
  notifications: {
    model: "Notification",
    ownerField: "userId",
    selectFields: {
      id: true,
      type: true,
      title: true,
      body: true,
      data: true,
      read: true,
      readAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  // Add more entities as needed
};

async function getEntityChanges<T>(
  entityType: string,
  userId: string,
  since: Date,
  options: { includeDeleted: boolean; limit: number; offset: number }
): Promise<T[]> {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new BadRequestError(`Unsupported entity type: ${entityType}`);
  }

  // Dynamic Prisma query
  const model = (db as Record<string, unknown>)[config.model.toLowerCase()];
  if (!model || typeof (model as { findMany?: unknown }).findMany !== "function") {
    throw new BadRequestError(`Entity model not found: ${config.model}`);
  }

  const where: Record<string, unknown> = {
    [config.ownerField]: userId,
    updatedAt: { gte: since },
  };

  if (!options.includeDeleted) {
    where.deletedAt = null;
  }

  return (model as { findMany: (args: Record<string, unknown>) => Promise<T[]> }).findMany({
    where,
    select: config.selectFields,
    include: config.relations,
    take: options.limit,
    skip: options.offset,
    orderBy: { updatedAt: "asc" },
  });
}

async function getEntityById<T>(
  entityType: string,
  id: string,
  userId: string
): Promise<T | null> {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) return null;

  const model = (db as Record<string, unknown>)[config.model.toLowerCase()];
  if (!model || typeof (model as { findFirst?: unknown }).findFirst !== "function") {
    return null;
  }

  return (model as { findFirst: (args: Record<string, unknown>) => Promise<T | null> }).findFirst({
    where: {
      id,
      [config.ownerField]: userId,
    },
    select: config.selectFields,
  });
}

async function getDeletedIds(
  entityType: string,
  userId: string,
  since: Date
): Promise<string[]> {
  // Check tombstone cache for deleted IDs
  const cacheKey = `tombstones:${entityType}:${userId}`;
  const tombstones = await cache.get<Array<{ id: string; deletedAt: number }>>(cacheKey);
  
  if (!tombstones) return [];
  
  return tombstones
    .filter((t) => t.deletedAt >= since.getTime())
    .map((t) => t.id);
}

async function createEntity<T>(
  entityType: string,
  userId: string,
  data: Partial<T>,
  clientId?: string
): Promise<T> {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new BadRequestError(`Unsupported entity type: ${entityType}`);
  }

  const model = (db as Record<string, unknown>)[config.model.toLowerCase()];
  if (!model || typeof (model as { create?: unknown }).create !== "function") {
    throw new BadRequestError(`Entity model not found: ${config.model}`);
  }

  return (model as { create: (args: Record<string, unknown>) => Promise<T> }).create({
    data: {
      ...data,
      [config.ownerField]: userId,
      version: 1,
      syncClientId: clientId,
    },
  });
}

async function updateEntity<T>(
  entityType: string,
  userId: string,
  id: string,
  data: Partial<T>,
  expectedVersion: number
): Promise<T> {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new BadRequestError(`Unsupported entity type: ${entityType}`);
  }

  const model = (db as Record<string, unknown>)[config.model.toLowerCase()];
  if (!model || typeof (model as { updateMany?: unknown }).updateMany !== "function") {
    throw new BadRequestError(`Entity model not found: ${config.model}`);
  }

  // Optimistic locking - only update if version matches
  const result = await (model as { updateMany: (args: Record<string, unknown>) => Promise<{ count: number }> }).updateMany({
    where: {
      id,
      [config.ownerField]: userId,
      version: expectedVersion,
    },
    data: {
      ...data,
      version: { increment: 1 },
      updatedAt: new Date(),
    },
  });

  if (result.count === 0) {
    throw new ConflictError("Version conflict - record has been modified");
  }

  return getEntityById<T>(entityType, id, userId) as Promise<T>;
}

async function deleteEntity(
  entityType: string,
  userId: string,
  id: string
): Promise<void> {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new BadRequestError(`Unsupported entity type: ${entityType}`);
  }

  const model = (db as Record<string, unknown>)[config.model.toLowerCase()];
  if (!model) {
    throw new BadRequestError(`Entity model not found: ${config.model}`);
  }

  // Soft delete with tombstone
  if (typeof (model as { update?: unknown }).update === "function") {
    await (model as { update: (args: Record<string, unknown>) => Promise<unknown> }).update({
      where: { id },
      data: {
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
  }

  // Store tombstone in cache
  await addTombstone(entityType, userId, id);
}

async function addTombstone(
  entityType: string,
  userId: string,
  id: string
): Promise<void> {
  const cacheKey = `tombstones:${entityType}:${userId}`;
  const existing = await cache.get<Array<{ id: string; deletedAt: number }>>(cacheKey) || [];
  
  // Add new tombstone
  existing.push({ id, deletedAt: Date.now() });
  
  // Clean old tombstones
  const cutoff = Date.now() - TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const filtered = existing.filter((t) => t.deletedAt >= cutoff);
  
  await cache.set(cacheKey, filtered, TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60);
}

// ============================================
// Conflict Resolution Strategies
// ============================================

/**
 * Merge two conflicting records field by field
 * Uses "last write wins" for each field
 */
export function mergeConflicts<T extends Record<string, unknown>>(
  clientData: T,
  serverData: T,
  clientTimestamp: number,
  serverTimestamp: number
): T {
  const merged: Record<string, unknown> = {};
  
  const allKeys = new Set([...Object.keys(clientData), ...Object.keys(serverData)]);
  
  for (const key of allKeys) {
    // Skip metadata fields
    if (["id", "version", "updatedAt", "createdAt", "deletedAt"].includes(key)) {
      merged[key] = serverData[key]; // Always use server metadata
      continue;
    }
    
    // If only one has the field, use that value
    if (!(key in clientData)) {
      merged[key] = serverData[key];
    } else if (!(key in serverData)) {
      merged[key] = clientData[key];
    } else {
      // Both have the field - use timestamp to decide
      merged[key] = clientTimestamp > serverTimestamp 
        ? clientData[key] 
        : serverData[key];
    }
  }
  
  return merged as T;
}

/**
 * Create a three-way merge using a common ancestor
 */
export function threeWayMerge<T extends Record<string, unknown>>(
  ancestor: T | null,
  client: T,
  server: T
): { merged: T; conflicts: string[] } {
  const merged: Record<string, unknown> = {};
  const conflicts: string[] = [];
  
  const allKeys = new Set([
    ...Object.keys(ancestor || {}),
    ...Object.keys(client),
    ...Object.keys(server),
  ]);
  
  for (const key of allKeys) {
    // Skip metadata
    if (["id", "version", "updatedAt", "createdAt"].includes(key)) {
      merged[key] = server[key];
      continue;
    }
    
    const ancestorVal = ancestor?.[key];
    const clientVal = client[key];
    const serverVal = server[key];
    
    // If server hasn't changed from ancestor, use client
    if (JSON.stringify(serverVal) === JSON.stringify(ancestorVal)) {
      merged[key] = clientVal;
    }
    // If client hasn't changed from ancestor, use server
    else if (JSON.stringify(clientVal) === JSON.stringify(ancestorVal)) {
      merged[key] = serverVal;
    }
    // Both changed - conflict
    else if (JSON.stringify(clientVal) !== JSON.stringify(serverVal)) {
      conflicts.push(key);
      // Default to server value for conflicts
      merged[key] = serverVal;
    } else {
      // Both changed to same value
      merged[key] = serverVal;
    }
  }
  
  return { merged: merged as T, conflicts };
}

// ============================================
// Real-time Sync via Pub/Sub
// ============================================

/**
 * Publish a sync event for real-time clients
 */
export async function publishSyncEvent(
  userId: string,
  entityType: string,
  change: SyncChange
): Promise<void> {
  const channel = `sync:${userId}:${entityType}`;
  const message = JSON.stringify(change);
  
  // Use Redis pub/sub if available
  // This will be handled by the enhanced Redis service
  await cache.set(`${channel}:last`, message, 60); // Fallback to cache
}

/**
 * Get sync channel for SSE/WebSocket subscriptions
 */
export function getSyncChannel(userId: string, entityType: string): string {
  return `sync:${userId}:${entityType}`;
}
