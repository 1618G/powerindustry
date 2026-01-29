/**
 * Background Worker Entry Point
 * 
 * Runs job processing in a separate process.
 * Usage: pnpm run worker
 */

import { db } from "~/lib/prisma";
import { logger } from "~/lib/logger.server";
import { config } from "~/lib/config.server";
import { initOpenTelemetry } from "~/observability/otel.server";
import { installGlobalErrorHandlers } from "~/observability/errors.server";
import { processJobs, registerDefaultHandlers } from "~/services/jobs.server";

const WORKER_ID = `worker-${process.pid}-${Date.now()}`;
const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds
const POLL_INTERVAL = 5 * 1000; // 5 seconds
const BATCH_SIZE = 10;

let isShuttingDown = false;

async function main() {
  logger.info("Starting worker", {
    workerId: WORKER_ID,
    version: config.app.version,
  });

  // Initialize observability
  await initOpenTelemetry();
  installGlobalErrorHandlers();

  // Register job handlers
  registerDefaultHandlers();

  // Register this worker
  await registerWorker();

  // Start heartbeat
  const heartbeatTimer = setInterval(updateHeartbeat, HEARTBEAT_INTERVAL);

  // Handle shutdown
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}, shutting down gracefully`);

    // Stop heartbeat
    clearInterval(heartbeatTimer);

    // Mark worker as stopping
    await db.workerHeartbeat.update({
      where: { workerId: WORKER_ID },
      data: { status: "stopping" },
    });

    // Wait for current jobs to finish (max 30s)
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Mark as stopped
    await db.workerHeartbeat.update({
      where: { workerId: WORKER_ID },
      data: { status: "stopped" },
    });

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Main processing loop
  logger.info("Worker ready, starting job processing loop");

  while (!isShuttingDown) {
    try {
      const result = await processJobs(BATCH_SIZE);

      if (result.processed > 0) {
        logger.info("Processed jobs", {
          processed: result.processed,
          succeeded: result.succeeded,
          failed: result.failed,
        });
      }

      // Write heartbeat file for Docker health check
      await writeHeartbeatFile();
    } catch (error) {
      logger.error("Error in job processing loop", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

async function registerWorker() {
  await db.workerHeartbeat.upsert({
    where: { workerId: WORKER_ID },
    create: {
      workerId: WORKER_ID,
      hostname: process.env.HOSTNAME || "unknown",
      status: "active",
      metadata: {
        pid: process.pid,
        version: config.app.version,
        nodeVersion: process.version,
      },
    },
    update: {
      lastSeenAt: new Date(),
      status: "active",
    },
  });
}

async function updateHeartbeat() {
  try {
    await db.workerHeartbeat.update({
      where: { workerId: WORKER_ID },
      data: {
        lastSeenAt: new Date(),
        status: "active",
      },
    });
  } catch (error) {
    logger.warn("Failed to update heartbeat", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function writeHeartbeatFile() {
  const fs = await import("fs/promises");
  try {
    await fs.writeFile("/tmp/worker-heartbeat", new Date().toISOString());
  } catch {
    // Ignore file write errors
  }
}

main().catch((error) => {
  logger.fatal("Worker failed to start", {
    error: error instanceof Error ? error.message : "Unknown error",
  });
  process.exit(1);
});
