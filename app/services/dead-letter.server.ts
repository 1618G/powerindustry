/**
 * Dead Letter Queue Service
 * 
 * Captures permanently failed jobs for manual review and retry.
 */

import { db } from "~/lib/prisma";
import { logger } from "~/lib/logger.server";
import { getRequestContext, getLoggingContext } from "~/lib/request-context.server";
import { captureException } from "~/observability/errors.server";
import { recordJobProcessed, recordJobDuration, startTimer } from "~/observability/metrics.server";
import { withSpan } from "~/observability/otel.server";

// ============================================
// Types
// ============================================

export interface JobConfig {
  maxRetries?: number;
  retryDelays?: number[];  // Delays in seconds for each retry
  timeout?: number;        // Timeout in seconds
}

const DEFAULT_CONFIG: Required<JobConfig> = {
  maxRetries: 3,
  retryDelays: [60, 300, 900], // 1m, 5m, 15m
  timeout: 300,
};

// ============================================
// Dead Letter Operations
// ============================================

/**
 * Record a job in the dead letter queue
 */
export async function recordDeadLetter(
  jobName: string,
  payload: Record<string, unknown>,
  error: Error | string,
  options: {
    jobId?: string;
    attempts?: number;
  } = {}
): Promise<string> {
  const errorMessage = error instanceof Error ? error.message : error;
  const context = getLoggingContext();

  const deadLetter = await db.deadLetterJob.create({
    data: {
      jobId: options.jobId,
      jobName,
      payload: payload as object,
      error: errorMessage,
      attempts: options.attempts || 1,
    },
  });

  logger.error("Job moved to dead letter queue", {
    deadLetterId: deadLetter.id,
    jobName,
    jobId: options.jobId,
    error: errorMessage,
    ...context,
  });

  // Track metrics
  recordJobProcessed(jobName, "failure");

  return deadLetter.id;
}

/**
 * List dead letter jobs with filters
 */
export async function listDeadLetterJobs(filters?: {
  jobName?: string;
  resolved?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{
  jobs: Array<{
    id: string;
    jobId: string | null;
    jobName: string;
    payload: Record<string, unknown>;
    error: string;
    attempts: number;
    resolved: boolean;
    createdAt: Date;
  }>;
  total: number;
}> {
  const where = {
    jobName: filters?.jobName,
    resolved: filters?.resolved,
  };

  const [jobs, total] = await Promise.all([
    db.deadLetterJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    }),
    db.deadLetterJob.count({ where }),
  ]);

  return {
    jobs: jobs.map((j) => ({
      ...j,
      payload: j.payload as Record<string, unknown>,
    })),
    total,
  };
}

/**
 * Get dead letter job by ID
 */
export async function getDeadLetterJob(id: string) {
  const job = await db.deadLetterJob.findUnique({ where: { id } });
  if (!job) return null;
  
  return {
    ...job,
    payload: job.payload as Record<string, unknown>,
  };
}

/**
 * Mark a dead letter job as resolved
 */
export async function resolveDeadLetter(
  id: string,
  resolvedBy: string,
  notes?: string
): Promise<void> {
  await db.deadLetterJob.update({
    where: { id },
    data: {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy,
      notes,
    },
  });

  logger.info("Dead letter job resolved", { id, resolvedBy });
}

/**
 * Delete old resolved dead letter jobs
 */
export async function cleanupDeadLetterJobs(daysOld: number = 90): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const result = await db.deadLetterJob.deleteMany({
    where: {
      resolved: true,
      resolvedAt: { lt: cutoff },
    },
  });

  logger.info("Cleaned up dead letter jobs", { deleted: result.count });
  return result.count;
}

// ============================================
// Safe Job Execution Wrapper
// ============================================

/**
 * Run a job with tracing, logging, retries, and dead-letter on permanent failure.
 */
export async function runJobSafely<T>(
  jobName: string,
  jobId: string,
  payload: Record<string, unknown>,
  handler: () => Promise<T>,
  config: JobConfig = {}
): Promise<T> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const requestContext = getRequestContext();
  const timer = startTimer();

  const jobLogger = logger.child({
    jobName,
    jobId,
    correlationId: requestContext?.correlationId,
  });

  return withSpan(
    `job.${jobName}`,
    { jobName, jobId },
    async () => {
      let lastError: Error | null = null;
      let attempt = 0;

      while (attempt <= cfg.maxRetries) {
        attempt++;
        jobLogger.info(`Executing job attempt ${attempt}/${cfg.maxRetries + 1}`);

        try {
          // Execute with timeout
          const result = await Promise.race([
            handler(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Job timeout")), cfg.timeout * 1000)
            ),
          ]);

          // Success
          const duration = timer();
          recordJobProcessed(jobName, "success");
          recordJobDuration(jobName, duration);

          jobLogger.info("Job completed successfully", {
            attempt,
            durationSeconds: duration.toFixed(3),
          });

          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          jobLogger.warn(`Job attempt ${attempt} failed`, {
            error: lastError.message,
          });

          // Check if we should retry
          if (attempt <= cfg.maxRetries) {
            const delay = cfg.retryDelays[attempt - 1] || cfg.retryDelays[cfg.retryDelays.length - 1];
            jobLogger.info(`Retrying in ${delay} seconds`);
            await sleep(delay * 1000);
          }
        }
      }

      // All retries exhausted - move to dead letter
      jobLogger.error("Job permanently failed after all retries", {
        error: lastError?.message,
        attempts: attempt,
      });

      await recordDeadLetter(jobName, payload, lastError!, {
        jobId,
        attempts: attempt,
      });

      await captureException(lastError!, {
        action: `job.${jobName}`,
        extra: { jobId, attempts: attempt },
      });

      throw lastError;
    }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Statistics
// ============================================

export async function getDeadLetterStats(): Promise<{
  total: number;
  unresolved: number;
  byJobName: Record<string, number>;
}> {
  const [total, unresolved, byJobNameRaw] = await Promise.all([
    db.deadLetterJob.count(),
    db.deadLetterJob.count({ where: { resolved: false } }),
    db.deadLetterJob.groupBy({
      by: ["jobName"],
      _count: { jobName: true },
      where: { resolved: false },
    }),
  ]);

  const byJobName: Record<string, number> = {};
  for (const item of byJobNameRaw) {
    byJobName[item.jobName] = item._count.jobName;
  }

  return { total, unresolved, byJobName };
}
