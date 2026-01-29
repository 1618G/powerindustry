/**
 * Health Check API - Comprehensive dependency status
 * GET /api/healthz - Quick health check (for load balancers/Traefik)
 * GET /api/healthz?detailed=true - Full dependency check
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/lib/prisma";
import { cache } from "~/lib/redis.server";
import { config, getConfigStatus } from "~/lib/config.server";
import { getJobStats } from "~/services/jobs.server";

type HealthStatus = "healthy" | "degraded" | "unhealthy";

type DependencyCheck = {
  name: string;
  status: HealthStatus;
  latency?: number;
  message?: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const detailed = url.searchParams.get("detailed") === "true";
  const startTime = Date.now();

  // Quick health check (for load balancers/Traefik health-gated rollout)
  if (!detailed) {
    try {
      await db.$queryRaw`SELECT 1`;
      return json({
        status: "healthy",
        version: config.app.version,
        timestamp: new Date().toISOString(),
      });
    } catch {
      return json(
        { status: "unhealthy", version: config.app.version, timestamp: new Date().toISOString() },
        { status: 503 }
      );
    }
  }

  // Detailed health check
  const checks: DependencyCheck[] = [];

  // Database check
  const dbCheck = await checkDatabase();
  checks.push(dbCheck);

  // Redis check
  const redisCheck = await checkRedis();
  checks.push(redisCheck);

  // Worker health check
  const workerCheck = await checkWorkers();
  checks.push(workerCheck);

  // Job queue check
  const queueCheck = await checkJobQueue();
  checks.push(queueCheck);

  // External services config check
  const configStatus = getConfigStatus();
  
  // Stripe connectivity
  if (config.stripe.isConfigured) {
    checks.push({
      name: "stripe",
      status: "healthy",
      message: "API key configured",
    });
  }

  // Email service
  checks.push({
    name: "email",
    status: config.email.isConfigured ? "healthy" : "degraded",
    message: config.email.isConfigured ? "Email service configured" : "Email not configured",
  });

  // AI services
  checks.push({
    name: "ai",
    status: config.ai.isConfigured ? "healthy" : "degraded",
    message: config.ai.isConfigured ? "AI provider configured" : "No AI provider configured",
  });

  // Storage
  const storageConfigured = config.storage.gcs.isConfigured || config.storage.s3.isConfigured;
  checks.push({
    name: "storage",
    status: storageConfigured ? "healthy" : "degraded",
    message: storageConfigured ? "Cloud storage configured" : "Using local storage only",
  });

  // Calculate overall status
  const overallStatus = calculateOverallStatus(checks);
  const responseTime = Date.now() - startTime;

  const response = {
    status: overallStatus,
    version: config.app.version,
    name: config.app.name,
    timestamp: new Date().toISOString(),
    environment: config.env.NODE_ENV,
    uptime: process.uptime(),
    responseTime: `${responseTime}ms`,
    checks,
    queue: await getQueueSummary(),
    config: {
      valid: configStatus.valid,
      services: Object.entries(configStatus.services).map(([name, status]) => ({
        name,
        ...status,
      })),
    },
  };

  const statusCode = overallStatus === "unhealthy" ? 503 : 200;
  return json(response, { status: statusCode });
}

// ============================================
// Dependency Checks
// ============================================

async function checkDatabase(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return {
      name: "database",
      status: "healthy",
      latency: Date.now() - start,
      message: "PostgreSQL connected",
    };
  } catch (error) {
    return {
      name: "database",
      status: "unhealthy",
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

async function checkRedis(): Promise<DependencyCheck> {
  if (!config.redis.isConfigured) {
    return {
      name: "redis",
      status: "degraded",
      message: "Redis not configured (using in-memory cache)",
    };
  }

  const start = Date.now();
  try {
    await cache.set("health_check", "ok", { ttl: 10 });
    const result = await cache.get("health_check");
    
    if (result !== "ok") {
      throw new Error("Cache read/write mismatch");
    }

    return {
      name: "redis",
      status: "healthy",
      latency: Date.now() - start,
      message: "Redis connected",
    };
  } catch (error) {
    return {
      name: "redis",
      status: "unhealthy",
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : "Redis connection failed",
    };
  }
}

async function checkWorkers(): Promise<DependencyCheck> {
  try {
    // Check for workers that have reported in the last 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const activeWorkers = await db.workerHeartbeat.count({
      where: {
        lastSeenAt: { gte: twoMinutesAgo },
        status: "active",
      },
    });

    if (activeWorkers === 0) {
      return {
        name: "workers",
        status: "degraded",
        message: "No active workers detected",
      };
    }

    return {
      name: "workers",
      status: "healthy",
      message: `${activeWorkers} active worker(s)`,
    };
  } catch {
    return {
      name: "workers",
      status: "degraded",
      message: "Worker status unavailable",
    };
  }
}

async function checkJobQueue(): Promise<DependencyCheck> {
  try {
    const stats = await getJobStats();
    const pendingThreshold = 1000; // Alert if queue is very backed up

    if (stats.pending > pendingThreshold) {
      return {
        name: "job_queue",
        status: "degraded",
        message: `Queue backed up: ${stats.pending} pending jobs`,
      };
    }

    if (stats.failed > 0) {
      return {
        name: "job_queue",
        status: "degraded",
        message: `${stats.failed} failed jobs, ${stats.pending} pending`,
      };
    }

    return {
      name: "job_queue",
      status: "healthy",
      message: `${stats.pending} pending, ${stats.processing} processing`,
    };
  } catch {
    return {
      name: "job_queue",
      status: "degraded",
      message: "Job queue status unavailable",
    };
  }
}

async function getQueueSummary(): Promise<{
  pending: number;
  processing: number;
  failed: number;
}> {
  try {
    const stats = await getJobStats();
    return {
      pending: stats.pending,
      processing: stats.processing,
      failed: stats.failed,
    };
  } catch {
    return { pending: 0, processing: 0, failed: 0 };
  }
}

function calculateOverallStatus(checks: DependencyCheck[]): HealthStatus {
  const hasUnhealthy = checks.some((c) => c.status === "unhealthy");
  if (hasUnhealthy) return "unhealthy";

  const hasDegraded = checks.some((c) => c.status === "degraded");
  if (hasDegraded) return "degraded";

  return "healthy";
}
