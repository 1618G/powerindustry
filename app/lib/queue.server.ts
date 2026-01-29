/**
 * Queue Service - Background job processing with pg-boss
 *
 * PURPOSE: Handle background jobs with PostgreSQL-backed queue
 *
 * USAGE:
 * import { queue } from "~/lib/queue.server";
 * await queue.send("send-email", { to: "user@email.com", template: "welcome" });
 *
 * LAYER: Infrastructure
 */

import { logger } from "./logger.server";

interface JobHandler<T = unknown> {
  (data: T): Promise<void>;
}

interface QueueInterface {
  send: <T>(name: string, data: T, options?: JobOptions) => Promise<string | null>;
  work: <T>(name: string, handler: JobHandler<T>) => Promise<void>;
  schedule: <T>(
    name: string,
    cron: string,
    data: T,
    options?: JobOptions
  ) => Promise<void>;
  cancel: (jobId: string) => Promise<void>;
  isReady: () => boolean;
}

interface JobOptions {
  priority?: number;
  retryLimit?: number;
  retryDelay?: number;
  startAfter?: Date | number;
  singletonKey?: string;
}

// In-memory queue implementation (fallback)
class InMemoryQueue implements QueueInterface {
  private handlers: Map<string, JobHandler<unknown>> = new Map();
  private jobs: Map<string, { name: string; data: unknown }> = new Map();

  async send<T>(name: string, data: T): Promise<string | null> {
    const jobId = crypto.randomUUID();
    this.jobs.set(jobId, { name, data });

    // Process immediately if handler exists
    const handler = this.handlers.get(name);
    if (handler) {
      setTimeout(async () => {
        try {
          await handler(data);
          this.jobs.delete(jobId);
        } catch (error) {
          logger.error("Job failed", {
            jobId,
            name,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }, 0);
    }

    return jobId;
  }

  async work<T>(name: string, handler: JobHandler<T>): Promise<void> {
    this.handlers.set(name, handler as JobHandler<unknown>);
    logger.info("Worker registered", { queue: name });
  }

  async schedule<T>(
    name: string,
    cron: string,
    data: T,
    _options?: JobOptions
  ): Promise<void> {
    logger.warn("Scheduled jobs not supported in memory queue", { name, cron });
    // In-memory queue doesn't support cron, just send once
    await this.send(name, data);
  }

  async cancel(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
  }

  isReady(): boolean {
    return true;
  }
}

// pg-boss queue implementation
class PgBossQueue implements QueueInterface {
  private boss: import("pg-boss") | null = null;
  private ready: boolean = false;
  private connecting: Promise<void> | null = null;

  constructor() {
    this.connect();
  }

  private async connect(): Promise<void> {
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        const PgBoss = (await import("pg-boss")).default;
        this.boss = new PgBoss({
          connectionString: process.env.DATABASE_URL,
          archiveCompletedAfterSeconds: 60 * 60 * 24, // 1 day
          retentionDays: 7,
        });

        this.boss.on("error", (error) => {
          logger.error("pg-boss error", { error: error.message });
        });

        await this.boss.start();
        this.ready = true;
        logger.info("pg-boss queue started");
      } catch (error) {
        logger.warn("pg-boss not available", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    })();

    return this.connecting;
  }

  private async getBoss(): Promise<import("pg-boss")> {
    if (this.boss && this.ready) return this.boss;
    await this.connect();
    if (!this.boss) throw new Error("pg-boss not initialized");
    return this.boss;
  }

  async send<T>(
    name: string,
    data: T,
    options?: JobOptions
  ): Promise<string | null> {
    const boss = await this.getBoss();
    return await boss.send(name, data as object, {
      priority: options?.priority,
      retryLimit: options?.retryLimit ?? 3,
      retryDelay: options?.retryDelay ?? 60,
      startAfter: options?.startAfter,
      singletonKey: options?.singletonKey,
    });
  }

  async work<T>(name: string, handler: JobHandler<T>): Promise<void> {
    const boss = await this.getBoss();
    await boss.work(name, async (job) => {
      try {
        await handler(job.data as T);
      } catch (error) {
        logger.error("Job failed", {
          jobId: job.id,
          name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    });
    logger.info("Worker registered", { queue: name });
  }

  async schedule<T>(
    name: string,
    cron: string,
    data: T,
    options?: JobOptions
  ): Promise<void> {
    const boss = await this.getBoss();
    await boss.schedule(name, cron, data as object, {
      priority: options?.priority,
      retryLimit: options?.retryLimit ?? 3,
    });
    logger.info("Scheduled job registered", { name, cron });
  }

  async cancel(jobId: string): Promise<void> {
    const boss = await this.getBoss();
    await boss.cancel(jobId);
  }

  isReady(): boolean {
    return this.ready;
  }
}

// Factory function to create queue
function createQueue(): QueueInterface {
  // Try pg-boss first, fallback to in-memory
  if (process.env.DATABASE_URL) {
    try {
      return new PgBossQueue();
    } catch {
      logger.warn("pg-boss unavailable, using in-memory queue");
    }
  }

  return new InMemoryQueue();
}

export const queue = createQueue();

// Common job types
export const JobTypes = {
  SEND_EMAIL: "send-email",
  PROCESS_FILE: "process-file",
  SYNC_DATA: "sync-data",
  CLEANUP: "cleanup",
  WEBHOOK_DELIVERY: "webhook-delivery",
  GENERATE_REPORT: "generate-report",
} as const;
