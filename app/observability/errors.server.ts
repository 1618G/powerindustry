/**
 * Error Tracking Service
 * 
 * Provides unified error capture with optional Sentry integration.
 * Always logs errors with correlation context.
 */

import { config } from "~/lib/config.server";
import { logger } from "~/lib/logger.server";
import { getRequestContext, getLoggingContext } from "~/lib/request-context.server";

// ============================================
// Types
// ============================================

interface ErrorContext {
  userId?: string;
  action?: string;
  extra?: Record<string, unknown>;
}

type SentryClient = {
  captureException: (error: Error, context?: object) => string;
  captureMessage: (message: string, level?: string) => string;
  setUser: (user: { id: string; email?: string }) => void;
  setContext: (name: string, context: Record<string, unknown>) => void;
  addBreadcrumb: (breadcrumb: object) => void;
  flush: (timeout: number) => Promise<boolean>;
};

// ============================================
// Sentry Initialization (Lazy)
// ============================================

let sentryClient: SentryClient | null = null;
let sentryInitialized = false;

async function getSentry(): Promise<SentryClient | null> {
  if (sentryInitialized) return sentryClient;
  sentryInitialized = true;

  const dsn = config.observability.sentryDsn;
  if (!dsn) {
    logger.debug("Sentry disabled (SENTRY_DSN not set)");
    return null;
  }

  try {
    const Sentry = await import("@sentry/node");
    
    Sentry.init({
      dsn,
      environment: config.env.NODE_ENV,
      release: config.app.version,
      tracesSampleRate: config.isProduction ? 0.1 : 1.0,
      beforeSend(event) {
        // Add request context if available
        const reqContext = getRequestContext();
        if (reqContext) {
          event.tags = {
            ...event.tags,
            correlationId: reqContext.correlationId,
            requestId: reqContext.requestId,
          };
        }
        return event;
      },
    });

    sentryClient = Sentry as unknown as SentryClient;
    logger.info("Sentry initialized", { dsn: dsn.substring(0, 20) + "..." });
    return sentryClient;
  } catch (error) {
    logger.warn("Failed to initialize Sentry", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

// ============================================
// Error Capture
// ============================================

/**
 * Capture an exception with full context
 */
export async function captureException(
  error: Error,
  context: ErrorContext = {}
): Promise<string | null> {
  const loggingContext = getLoggingContext();
  
  // Always log locally
  logger.error(error.message, {
    ...loggingContext,
    stack: error.stack,
    action: context.action,
    userId: context.userId,
    ...context.extra,
  });

  // Send to Sentry if configured
  const sentry = await getSentry();
  if (sentry) {
    if (context.userId) {
      sentry.setUser({ id: context.userId });
    }
    if (context.extra) {
      sentry.setContext("extra", context.extra);
    }
    return sentry.captureException(error, {
      tags: { action: context.action },
      extra: { ...loggingContext, ...context.extra },
    });
  }

  return null;
}

/**
 * Capture a message (non-exception event)
 */
export async function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context: ErrorContext = {}
): Promise<string | null> {
  const loggingContext = getLoggingContext();

  // Log locally
  const logFn = level === "error" ? logger.error : level === "warning" ? logger.warn : logger.info;
  logFn(message, { ...loggingContext, ...context.extra });

  // Send to Sentry if configured
  const sentry = await getSentry();
  if (sentry) {
    return sentry.captureMessage(message, level);
  }

  return null;
}

/**
 * Add breadcrumb for debugging
 */
export async function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>
): Promise<void> {
  const sentry = await getSentry();
  if (sentry) {
    sentry.addBreadcrumb({
      message,
      category,
      data,
      timestamp: Date.now() / 1000,
    });
  }
}

// ============================================
// Global Error Handlers
// ============================================

let handlersInstalled = false;

export function installGlobalErrorHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  process.on("unhandledRejection", async (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.fatal("Unhandled promise rejection", {
      error: error.message,
      stack: error.stack,
    });
    await captureException(error, { action: "unhandledRejection" });
    
    // Give time for error to be sent, then exit
    setTimeout(() => process.exit(1), 1000);
  });

  process.on("uncaughtException", async (error) => {
    logger.fatal("Uncaught exception", {
      error: error.message,
      stack: error.stack,
    });
    await captureException(error, { action: "uncaughtException" });
    
    // Give time for error to be sent, then exit
    setTimeout(() => process.exit(1), 1000);
  });

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      const sentry = await getSentry();
      if (sentry) {
        await sentry.flush(2000);
      }
      
      process.exit(0);
    });
  });

  logger.debug("Global error handlers installed");
}

// ============================================
// Middleware Helper
// ============================================

/**
 * Wrap a route handler with error tracking
 */
export function withErrorTracking<T, Args extends { request: Request }>(
  handler: (args: Args) => Promise<T>,
  action: string
): (args: Args) => Promise<T> {
  return async (args: Args) => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof Error) {
        await captureException(error, { action });
      }
      throw error;
    }
  };
}
