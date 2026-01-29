/**
 * Background Jobs Service - Simple job queue system
 * Handles async tasks with retry logic and monitoring
 */

import { db } from "~/lib/prisma";
import { logAuditTrail } from "./soc2-compliance.server";

// ============================================
// Types
// ============================================

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export type JobPriority = "low" | "normal" | "high" | "critical";

export interface JobDefinition {
  type: string;
  payload: Record<string, unknown>;
  priority?: JobPriority;
  scheduledAt?: Date;
  maxAttempts?: number;
  timeout?: number; // seconds
}

export interface JobHandler {
  (payload: Record<string, unknown>): Promise<void>;
}

// ============================================
// Job Registry
// ============================================

const jobHandlers: Map<string, JobHandler> = new Map();

export function registerJobHandler(type: string, handler: JobHandler): void {
  jobHandlers.set(type, handler);
}

// ============================================
// Create Job
// ============================================

export async function createJob(definition: JobDefinition): Promise<string> {
  const {
    type,
    payload,
    priority = "normal",
    scheduledAt = new Date(),
    maxAttempts = 3,
    timeout = 300,
  } = definition;

  const job = await db.job.create({
    data: {
      type,
      payload: payload as object,
      priority,
      scheduledAt,
      maxAttempts,
      timeout,
      status: "pending",
    },
  });

  return job.id;
}

// ============================================
// Process Jobs
// ============================================

export async function processJobs(batchSize: number = 10): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // Get pending jobs
  const jobs = await db.job.findMany({
    where: {
      status: "pending",
      scheduledAt: { lte: new Date() },
      attempts: { lt: db.job.fields.maxAttempts },
    },
    orderBy: [
      { priority: "desc" },
      { scheduledAt: "asc" },
    ],
    take: batchSize,
  });

  for (const job of jobs) {
    processed++;

    // Mark as processing
    await db.job.update({
      where: { id: job.id },
      data: {
        status: "processing",
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    const handler = jobHandlers.get(job.type);

    if (!handler) {
      await db.job.update({
        where: { id: job.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          error: `No handler registered for job type: ${job.type}`,
        },
      });
      failed++;
      continue;
    }

    try {
      // Execute with timeout
      await Promise.race([
        handler(job.payload as Record<string, unknown>),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Job timeout")), job.timeout * 1000)
        ),
      ]);

      // Mark as completed
      await db.job.update({
        where: { id: job.id },
        data: {
          status: "completed",
          completedAt: new Date(),
        },
      });
      succeeded++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const shouldRetry = job.attempts < job.maxAttempts;

      await db.job.update({
        where: { id: job.id },
        data: {
          status: shouldRetry ? "pending" : "failed",
          completedAt: shouldRetry ? null : new Date(),
          error: errorMessage,
          scheduledAt: shouldRetry
            ? new Date(Date.now() + getRetryDelay(job.attempts) * 1000)
            : undefined,
        },
      });

      if (!shouldRetry) {
        failed++;
      }
    }
  }

  return { processed, succeeded, failed };
}

function getRetryDelay(attempt: number): number {
  // Exponential backoff: 60s, 300s, 900s, 3600s
  const delays = [60, 300, 900, 3600];
  return delays[Math.min(attempt, delays.length - 1)];
}

// ============================================
// Job Management
// ============================================

export async function getJob(jobId: string) {
  return db.job.findUnique({ where: { id: jobId } });
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const job = await db.job.findUnique({ where: { id: jobId } });

  if (!job || job.status === "completed" || job.status === "cancelled") {
    return false;
  }

  await db.job.update({
    where: { id: jobId },
    data: { status: "cancelled" },
  });

  return true;
}

export async function retryJob(jobId: string): Promise<boolean> {
  const job = await db.job.findUnique({ where: { id: jobId } });

  if (!job || job.status !== "failed") {
    return false;
  }

  await db.job.update({
    where: { id: jobId },
    data: {
      status: "pending",
      attempts: 0,
      scheduledAt: new Date(),
      error: null,
    },
  });

  return true;
}

// ============================================
// Job Statistics
// ============================================

export async function getJobStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  byType: Record<string, number>;
}> {
  const [pending, processing, completed, failed] = await Promise.all([
    db.job.count({ where: { status: "pending" } }),
    db.job.count({ where: { status: "processing" } }),
    db.job.count({ where: { status: "completed" } }),
    db.job.count({ where: { status: "failed" } }),
  ]);

  // Get counts by type
  const byTypeRaw = await db.job.groupBy({
    by: ["type"],
    _count: { type: true },
    where: { status: "pending" },
  });

  const byType: Record<string, number> = {};
  for (const item of byTypeRaw) {
    byType[item.type] = item._count.type;
  }

  return { pending, processing, completed, failed, byType };
}

// ============================================
// Cleanup
// ============================================

export async function cleanupOldJobs(daysOld: number = 30): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const result = await db.job.deleteMany({
    where: {
      status: { in: ["completed", "cancelled", "failed"] },
      completedAt: { lt: cutoff },
    },
  });

  return result.count;
}

// ============================================
// Scheduled Jobs
// ============================================

export async function scheduleJob(
  type: string,
  payload: Record<string, unknown>,
  runAt: Date
): Promise<string> {
  return createJob({
    type,
    payload,
    scheduledAt: runAt,
  });
}

export async function scheduleRecurringJob(
  type: string,
  payload: Record<string, unknown>,
  intervalMinutes: number
): Promise<string> {
  // Schedule next run
  const jobId = await createJob({
    type,
    payload: {
      ...payload,
      _recurring: true,
      _interval: intervalMinutes,
    },
    scheduledAt: new Date(Date.now() + intervalMinutes * 60 * 1000),
  });

  return jobId;
}

// ============================================
// Common Job Types
// ============================================

export const JobTypes = {
  // Email jobs
  SEND_EMAIL: "email.send",
  PROCESS_EMAIL_QUEUE: "email.process_queue",

  // Cleanup jobs
  CLEANUP_EXPIRED_SESSIONS: "cleanup.sessions",
  CLEANUP_EXPIRED_TOKENS: "cleanup.tokens",
  CLEANUP_OLD_JOBS: "cleanup.jobs",
  CLEANUP_AUDIT_LOGS: "cleanup.audit_logs",

  // Notifications
  SEND_NOTIFICATION: "notification.send",
  PROCESS_DIGEST: "notification.digest",

  // Webhooks
  DELIVER_WEBHOOK: "webhook.deliver",

  // Data
  EXPORT_USER_DATA: "data.export",
  GENERATE_REPORT: "data.report",

  // AI
  PROCESS_AI_REQUEST: "ai.process",
} as const;

// ============================================
// Register Default Handlers
// ============================================

export function registerDefaultHandlers(): void {
  // Email processing
  registerJobHandler(JobTypes.PROCESS_EMAIL_QUEUE, async () => {
    const { processEmailQueue } = await import("./email.server");
    await processEmailQueue();
  });

  // Session cleanup
  registerJobHandler(JobTypes.CLEANUP_EXPIRED_SESSIONS, async () => {
    await db.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  });

  // Token cleanup
  registerJobHandler(JobTypes.CLEANUP_EXPIRED_TOKENS, async () => {
    await Promise.all([
      db.passwordReset.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      db.magicLink.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);
  });

  // Job cleanup
  registerJobHandler(JobTypes.CLEANUP_OLD_JOBS, async () => {
    await cleanupOldJobs(30);
  });
}

