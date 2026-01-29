/**
 * Request Context Service - Correlation IDs and Request Tracking
 *
 * PURPOSE: Provide request-scoped context for logging, tracing, and debugging
 *
 * USAGE:
 * // In root.tsx or middleware
 * const context = createRequestContext(request);
 *
 * // In services/repositories
 * const { requestId, correlationId } = getRequestContext();
 *
 * // In logging
 * logger.info("Action completed", { ...getRequestContext() });
 *
 * LAYER: Infrastructure
 */

import crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";

// ============================================
// Types
// ============================================

export interface RequestContext {
  /** Unique ID for this request */
  requestId: string;
  /** Correlation ID for tracing across services */
  correlationId: string;
  /** Parent request ID (for nested calls) */
  parentRequestId?: string;
  /** Request start time */
  startTime: number;
  /** Client IP address */
  ipAddress?: string;
  /** User agent string */
  userAgent?: string;
  /** Authenticated user ID */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Request method */
  method?: string;
  /** Request path */
  path?: string;
  /** Custom metadata */
  metadata: Record<string, unknown>;
}

// ============================================
// Storage
// ============================================

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

// ============================================
// Context Creation
// ============================================

/**
 * Create a new request context from a Request object
 */
export function createRequestContext(
  request: Request,
  options: {
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  } = {}
): RequestContext {
  const url = new URL(request.url);
  
  // Extract or generate correlation ID
  const correlationId = 
    request.headers.get("x-correlation-id") ||
    request.headers.get("x-request-id") ||
    generateId();

  // Extract parent request ID for distributed tracing
  const parentRequestId = request.headers.get("x-parent-request-id") || undefined;

  // Extract client IP
  const ipAddress = 
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    undefined;

  return {
    requestId: generateId(),
    correlationId,
    parentRequestId,
    startTime: Date.now(),
    ipAddress,
    userAgent: request.headers.get("user-agent") || undefined,
    userId: options.userId,
    sessionId: options.sessionId,
    method: request.method,
    path: url.pathname,
    metadata: options.metadata || {},
  };
}

/**
 * Generate a short unique ID
 */
function generateId(): string {
  return crypto.randomBytes(8).toString("hex");
}

// ============================================
// Context Management
// ============================================

/**
 * Run a function within a request context
 */
export function runWithContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return requestContextStorage.run(context, fn);
}

/**
 * Run an async function within a request context
 */
export async function runWithContextAsync<T>(
  context: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return requestContextStorage.run(context, fn);
}

/**
 * Get the current request context
 * Returns undefined if called outside of a request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get the current request context or throw
 */
export function requireRequestContext(): RequestContext {
  const context = getRequestContext();
  if (!context) {
    throw new Error("Request context not available");
  }
  return context;
}

/**
 * Update the current request context
 */
export function updateRequestContext(
  updates: Partial<Omit<RequestContext, "requestId" | "correlationId" | "startTime">>
): void {
  const context = getRequestContext();
  if (context) {
    Object.assign(context, updates);
  }
}

/**
 * Add metadata to the current request context
 */
export function addContextMetadata(metadata: Record<string, unknown>): void {
  const context = getRequestContext();
  if (context) {
    Object.assign(context.metadata, metadata);
  }
}

// ============================================
// Response Headers
// ============================================

/**
 * Get headers to add to responses for tracing
 */
export function getTracingHeaders(context?: RequestContext): Record<string, string> {
  const ctx = context || getRequestContext();
  if (!ctx) return {};

  return {
    "x-request-id": ctx.requestId,
    "x-correlation-id": ctx.correlationId,
  };
}

/**
 * Get headers to propagate to downstream services
 */
export function getPropagationHeaders(context?: RequestContext): Record<string, string> {
  const ctx = context || getRequestContext();
  if (!ctx) return {};

  return {
    "x-correlation-id": ctx.correlationId,
    "x-parent-request-id": ctx.requestId,
    "x-forwarded-for": ctx.ipAddress || "",
    "x-user-id": ctx.userId || "",
  };
}

// ============================================
// Duration Tracking
// ============================================

/**
 * Get elapsed time since request start
 */
export function getElapsedTime(context?: RequestContext): number {
  const ctx = context || getRequestContext();
  if (!ctx) return 0;
  return Date.now() - ctx.startTime;
}

/**
 * Create a timer for measuring operations
 */
export function createTimer(name: string): { 
  stop: () => number;
  stopAndLog: (logger: { info: (msg: string, data: object) => void }) => number;
} {
  const start = Date.now();
  const context = getRequestContext();

  return {
    stop: () => Date.now() - start,
    stopAndLog: (logger) => {
      const duration = Date.now() - start;
      logger.info(`${name} completed`, {
        duration,
        operation: name,
        ...(context ? {
          requestId: context.requestId,
          correlationId: context.correlationId,
        } : {}),
      });
      return duration;
    },
  };
}

// ============================================
// Middleware Helper
// ============================================

/**
 * Wrap a loader/action with request context
 */
export function withRequestContext<T, Args extends { request: Request }>(
  handler: (args: Args) => Promise<T>,
  options: {
    getUserId?: (args: Args) => Promise<string | undefined>;
    getSessionId?: (args: Args) => Promise<string | undefined>;
  } = {}
): (args: Args) => Promise<T> {
  return async (args: Args) => {
    const userId = options.getUserId ? await options.getUserId(args) : undefined;
    const sessionId = options.getSessionId ? await options.getSessionId(args) : undefined;

    const context = createRequestContext(args.request, { userId, sessionId });

    return runWithContextAsync(context, () => handler(args));
  };
}

// ============================================
// Logging Integration
// ============================================

/**
 * Get context data for structured logging
 */
export function getLoggingContext(): Record<string, unknown> {
  const context = getRequestContext();
  if (!context) return {};

  return {
    requestId: context.requestId,
    correlationId: context.correlationId,
    userId: context.userId,
    method: context.method,
    path: context.path,
    elapsed: getElapsedTime(context),
  };
}

/**
 * Create a child context for sub-operations
 */
export function createChildContext(
  operationName: string,
  metadata?: Record<string, unknown>
): RequestContext | undefined {
  const parent = getRequestContext();
  if (!parent) return undefined;

  return {
    ...parent,
    requestId: generateId(),
    parentRequestId: parent.requestId,
    startTime: Date.now(),
    metadata: {
      ...parent.metadata,
      operation: operationName,
      ...metadata,
    },
  };
}
