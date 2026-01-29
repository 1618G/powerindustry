/**
 * Rate Limiting Service - Application-level rate limiting
 * Provides granular control over API endpoint access
 */

import { db } from "~/lib/prisma";
import { json } from "@remix-run/node";

// ============================================
// Configuration
// ============================================

interface RateLimitConfig {
  limit: number;      // Maximum requests
  windowMs: number;   // Time window in milliseconds
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Authentication endpoints
  auth: {
    limit: parseInt(process.env.RATE_LIMIT_AUTH || "5"),
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  // General API endpoints
  api: {
    limit: parseInt(process.env.RATE_LIMIT_API || "100"),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || "900") * 1000,
  },
  // File upload endpoints
  upload: {
    limit: parseInt(process.env.RATE_LIMIT_UPLOAD || "10"),
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  // Strict rate limit for sensitive operations
  strict: {
    limit: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  // Contact form
  contact: {
    limit: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
};

// ============================================
// Types
// ============================================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

interface RateLimitHeaders {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
  "Retry-After"?: string;
}

// ============================================
// Get Client Identifier
// ============================================

export function getClientIdentifier(request: Request, userId?: string): string {
  // Prefer user ID for authenticated requests
  if (userId) {
    return `user:${userId}`;
  }

  // Fall back to IP address
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return `ip:${ip}`;
}

// ============================================
// Check Rate Limit
// ============================================

export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  configKey: keyof typeof RATE_LIMITS = "api"
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[configKey];
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowMs);
  const windowEnd = new Date(now.getTime() + config.windowMs);

  // Find or create rate limit entry
  const entry = await db.rateLimitEntry.upsert({
    where: {
      identifier_endpoint: { identifier, endpoint },
    },
    create: {
      identifier,
      endpoint,
      count: 1,
      windowStart: now,
      expiresAt: windowEnd,
    },
    update: {
      count: {
        increment: 1,
      },
    },
  });

  // Check if window has expired
  if (entry.windowStart < windowStart) {
    // Reset the window
    await db.rateLimitEntry.update({
      where: { id: entry.id },
      data: {
        count: 1,
        windowStart: now,
        expiresAt: windowEnd,
      },
    });

    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAt: windowEnd,
    };
  }

  const remaining = Math.max(0, config.limit - entry.count);
  const resetAt = new Date(entry.windowStart.getTime() + config.windowMs);

  if (entry.count > config.limit) {
    const retryAfter = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter,
    };
  }

  return {
    allowed: true,
    remaining,
    resetAt,
  };
}

// ============================================
// Rate Limit Headers
// ============================================

export function getRateLimitHeaders(result: RateLimitResult, configKey: keyof typeof RATE_LIMITS = "api"): RateLimitHeaders {
  const config = RATE_LIMITS[configKey];
  const headers: RateLimitHeaders = {
    "X-RateLimit-Limit": String(config.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt.getTime() / 1000)),
  };

  if (result.retryAfter) {
    headers["Retry-After"] = String(result.retryAfter);
  }

  return headers;
}

// ============================================
// Rate Limit Response
// ============================================

export function rateLimitExceeded(result: RateLimitResult, configKey: keyof typeof RATE_LIMITS = "api") {
  const headers = getRateLimitHeaders(result, configKey);

  return json(
    {
      error: "Too many requests",
      message: `Rate limit exceeded. Please try again in ${result.retryAfter} seconds.`,
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: headers as Record<string, string>,
    }
  );
}

// ============================================
// Middleware Helper
// ============================================

export async function withRateLimit(
  request: Request,
  endpoint: string,
  configKey: keyof typeof RATE_LIMITS = "api",
  userId?: string
): Promise<{ allowed: true; headers: RateLimitHeaders } | Response> {
  const identifier = getClientIdentifier(request, userId);
  const result = await checkRateLimit(identifier, endpoint, configKey);

  if (!result.allowed) {
    return rateLimitExceeded(result, configKey);
  }

  return {
    allowed: true,
    headers: getRateLimitHeaders(result, configKey),
  };
}

// ============================================
// Cleanup Expired Entries
// ============================================

export async function cleanupRateLimitEntries(): Promise<number> {
  const result = await db.rateLimitEntry.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}

// ============================================
// Reset Rate Limit (for admin use)
// ============================================

export async function resetRateLimit(identifier: string, endpoint?: string): Promise<number> {
  const where = endpoint
    ? { identifier, endpoint }
    : { identifier };

  const result = await db.rateLimitEntry.deleteMany({ where });
  return result.count;
}

// ============================================
// Get Rate Limit Status
// ============================================

export async function getRateLimitStatus(
  identifier: string,
  endpoint: string,
  configKey: keyof typeof RATE_LIMITS = "api"
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[configKey];
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowMs);

  const entry = await db.rateLimitEntry.findUnique({
    where: {
      identifier_endpoint: { identifier, endpoint },
    },
  });

  if (!entry || entry.windowStart < windowStart) {
    return {
      allowed: true,
      remaining: config.limit,
      resetAt: new Date(now.getTime() + config.windowMs),
    };
  }

  const remaining = Math.max(0, config.limit - entry.count);
  const resetAt = new Date(entry.windowStart.getTime() + config.windowMs);

  return {
    allowed: remaining > 0,
    remaining,
    resetAt,
    retryAfter: remaining === 0 ? Math.ceil((resetAt.getTime() - now.getTime()) / 1000) : undefined,
  };
}

