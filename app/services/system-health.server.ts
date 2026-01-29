/**
 * System Health Service - Monitors system components and provides health status
 */

import { db } from "~/lib/prisma";
import os from "os";

// ============================================
// Types
// ============================================

export interface HealthCheck {
  service: string;
  status: "healthy" | "degraded" | "down";
  latency?: number;
  details?: Record<string, unknown>;
  checkedAt: Date;
}

export interface SystemMetrics {
  uptime: number;
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  cpu: {
    cores: number;
    model: string;
    loadAverage: number[];
  };
  platform: string;
  nodeVersion: string;
}

export interface SystemHealthSummary {
  overall: "healthy" | "degraded" | "down";
  services: HealthCheck[];
  metrics: SystemMetrics;
  timestamp: Date;
}

// ============================================
// Individual Health Checks
// ============================================

async function checkDatabase(): Promise<HealthCheck> {
  const startTime = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    const latency = Date.now() - startTime;

    // Get some stats
    const userCount = await db.user.count();
    const sessionCount = await db.session.count({
      where: { expiresAt: { gt: new Date() } },
    });

    return {
      service: "database",
      status: latency < 100 ? "healthy" : latency < 500 ? "degraded" : "down",
      latency,
      details: {
        type: "postgresql",
        users: userCount,
        activeSessions: sessionCount,
      },
      checkedAt: new Date(),
    };
  } catch (error) {
    return {
      service: "database",
      status: "down",
      latency: Date.now() - startTime,
      details: { error: error instanceof Error ? error.message : "Unknown error" },
      checkedAt: new Date(),
    };
  }
}

async function checkEmailService(): Promise<HealthCheck> {
  const provider = process.env.EMAIL_PROVIDER || "sendgrid";
  const configured = Boolean(
    (provider === "sendgrid" && process.env.SENDGRID_API_KEY) ||
    (provider === "gmail" && process.env.GMAIL_CLIENT_ID) ||
    (provider === "smtp" && process.env.SMTP_HOST)
  );

  // Check email queue health
  const pendingEmails = await db.emailQueue.count({
    where: { status: "PENDING" },
  });
  const failedEmails = await db.emailQueue.count({
    where: { status: "FAILED" },
  });

  return {
    service: "email",
    status: configured ? (failedEmails > 10 ? "degraded" : "healthy") : "down",
    details: {
      provider,
      configured,
      pendingEmails,
      failedEmails,
    },
    checkedAt: new Date(),
  };
}

async function checkStorageService(): Promise<HealthCheck> {
  const storageType = process.env.STORAGE_TYPE || "local";
  const uploadDir = process.env.UPLOAD_DIR || "./uploads";

  try {
    // Check if uploads directory is accessible
    const { access, constants } = await import("fs/promises");
    await access(uploadDir, constants.R_OK | constants.W_OK);

    // Get file stats
    const totalFiles = await db.file.count({ where: { status: "READY" } });
    const totalSize = await db.file.aggregate({
      where: { status: "READY" },
      _sum: { size: true },
    });

    return {
      service: "storage",
      status: "healthy",
      details: {
        type: storageType,
        path: uploadDir,
        totalFiles,
        totalSizeBytes: totalSize._sum.size || 0,
        totalSizeMB: Math.round((totalSize._sum.size || 0) / 1024 / 1024),
      },
      checkedAt: new Date(),
    };
  } catch (error) {
    return {
      service: "storage",
      status: "down",
      details: {
        type: storageType,
        error: error instanceof Error ? error.message : "Storage not accessible",
      },
      checkedAt: new Date(),
    };
  }
}

async function checkAuthService(): Promise<HealthCheck> {
  const oauthProviders = [];
  if (process.env.GOOGLE_CLIENT_ID) oauthProviders.push("google");
  if (process.env.GITHUB_CLIENT_ID) oauthProviders.push("github");
  if (process.env.MICROSOFT_CLIENT_ID) oauthProviders.push("microsoft");

  const activeSessions = await db.session.count({
    where: { expiresAt: { gt: new Date() } },
  });

  const recentLogins = await db.user.count({
    where: {
      lastLoginAt: {
        gt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
  });

  return {
    service: "authentication",
    status: "healthy",
    details: {
      oauthProviders,
      magicLinkEnabled: true,
      activeSessions,
      loginsLast24h: recentLogins,
    },
    checkedAt: new Date(),
  };
}

async function checkRateLimitService(): Promise<HealthCheck> {
  const activeEntries = await db.rateLimitEntry.count({
    where: { expiresAt: { gt: new Date() } },
  });

  return {
    service: "rateLimit",
    status: "healthy",
    details: {
      activeEntries,
      limits: {
        auth: process.env.RATE_LIMIT_AUTH || "5",
        api: process.env.RATE_LIMIT_API || "100",
        upload: process.env.RATE_LIMIT_UPLOAD || "10",
      },
    },
    checkedAt: new Date(),
  };
}

// ============================================
// System Metrics
// ============================================

function getSystemMetrics(): SystemMetrics {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    uptime: process.uptime(),
    memory: {
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      usagePercent: Math.round((usedMemory / totalMemory) * 100),
    },
    cpu: {
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || "Unknown",
      loadAverage: os.loadavg(),
    },
    platform: os.platform(),
    nodeVersion: process.version,
  };
}

// ============================================
// Aggregate Health Check
// ============================================

export async function getSystemHealth(): Promise<SystemHealthSummary> {
  const checks = await Promise.all([
    checkDatabase(),
    checkEmailService(),
    checkStorageService(),
    checkAuthService(),
    checkRateLimitService(),
  ]);

  // Determine overall status
  const hasDown = checks.some((c) => c.status === "down");
  const hasDegraded = checks.some((c) => c.status === "degraded");
  const overall = hasDown ? "down" : hasDegraded ? "degraded" : "healthy";

  // Store health check results
  for (const check of checks) {
    await db.systemHealth.create({
      data: {
        service: check.service,
        status: check.status,
        latency: check.latency,
        details: check.details as object,
      },
    });
  }

  // Cleanup old health records (keep last 24 hours)
  await db.systemHealth.deleteMany({
    where: {
      checkedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  return {
    overall,
    services: checks,
    metrics: getSystemMetrics(),
    timestamp: new Date(),
  };
}

// ============================================
// Quick Health Check (for /api/healthz)
// ============================================

export async function quickHealthCheck(): Promise<{
  status: "ok" | "error";
  database: boolean;
  timestamp: Date;
}> {
  try {
    await db.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      database: true,
      timestamp: new Date(),
    };
  } catch {
    return {
      status: "error",
      database: false,
      timestamp: new Date(),
    };
  }
}

// ============================================
// Historical Health Data
// ============================================

export async function getHealthHistory(
  service: string,
  hours: number = 24
): Promise<Array<{ status: string; latency: number | null; checkedAt: Date }>> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  return db.systemHealth.findMany({
    where: {
      service,
      checkedAt: { gt: cutoff },
    },
    orderBy: { checkedAt: "desc" },
    take: 100,
    select: {
      status: true,
      latency: true,
      checkedAt: true,
    },
  });
}

// ============================================
// Audit Logging
// ============================================

export async function logAuditEvent(
  action: string,
  options: {
    userId?: string;
    resource?: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  await db.auditLog.create({
    data: {
      action,
      userId: options.userId,
      resource: options.resource,
      resourceId: options.resourceId,
      details: options.details as object,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    },
  });
}

export async function getAuditLogs(options: {
  userId?: string;
  action?: string;
  resource?: string;
  limit?: number;
  offset?: number;
}) {
  const { userId, action, resource, limit = 50, offset = 0 } = options;

  return db.auditLog.findMany({
    where: {
      ...(userId && { userId }),
      ...(action && { action }),
      ...(resource && { resource }),
    },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

