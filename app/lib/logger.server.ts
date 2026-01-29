/**
 * Logger Service - Structured logging with Pino
 *
 * PURPOSE: Centralized logging with consistent format and levels
 *
 * USAGE:
 * import { logger } from "~/lib/logger.server";
 * logger.info("User logged in", { userId: "123" });
 * logger.error("Payment failed", { error, orderId });
 *
 * LAYER: Infrastructure
 */

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

interface LogContext {
  [key: string]: unknown;
}

interface Logger {
  trace: (message: string, context?: LogContext) => void;
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  fatal: (message: string, context?: LogContext) => void;
  child: (context: LogContext) => Logger;
}

// Try to use Pino if available, otherwise use console fallback
let _logger: Logger | null = null;

function createConsoleLogger(): Logger {
  const logLevels: Record<LogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
  };

  const currentLevel =
    (process.env.LOG_LEVEL as LogLevel) ||
    (process.env.NODE_ENV === "production" ? "info" : "debug");
  const currentLevelNum = logLevels[currentLevel] || 30;

  const formatMessage = (
    level: LogLevel,
    message: string,
    context?: LogContext
  ): string => {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  };

  const shouldLog = (level: LogLevel): boolean => {
    return logLevels[level] >= currentLevelNum;
  };

  const createLogFn =
    (level: LogLevel) =>
    (message: string, context?: LogContext): void => {
      if (!shouldLog(level)) return;

      const formatted = formatMessage(level, message, context);

      switch (level) {
        case "trace":
        case "debug":
          console.debug(formatted);
          break;
        case "info":
          console.info(formatted);
          break;
        case "warn":
          console.warn(formatted);
          break;
        case "error":
        case "fatal":
          console.error(formatted);
          break;
      }
    };

  const createChildLogger = (parentContext: LogContext): Logger => {
    const childCreateLogFn =
      (level: LogLevel) =>
      (message: string, context?: LogContext): void => {
        createLogFn(level)(message, { ...parentContext, ...context });
      };

    return {
      trace: childCreateLogFn("trace"),
      debug: childCreateLogFn("debug"),
      info: childCreateLogFn("info"),
      warn: childCreateLogFn("warn"),
      error: childCreateLogFn("error"),
      fatal: childCreateLogFn("fatal"),
      child: (context: LogContext) =>
        createChildLogger({ ...parentContext, ...context }),
    };
  };

  return {
    trace: createLogFn("trace"),
    debug: createLogFn("debug"),
    info: createLogFn("info"),
    warn: createLogFn("warn"),
    error: createLogFn("error"),
    fatal: createLogFn("fatal"),
    child: createChildLogger,
  };
}

async function createPinoLogger(): Promise<Logger | null> {
  try {
    const pino = await import("pino");

    const pinoLogger = pino.default({
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
      transport:
        process.env.NODE_ENV !== "production"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "SYS:standard",
              },
            }
          : undefined,
    });

    // Wrap pino logger to match our interface
    return {
      trace: (message: string, context?: LogContext) =>
        pinoLogger.trace(context || {}, message),
      debug: (message: string, context?: LogContext) =>
        pinoLogger.debug(context || {}, message),
      info: (message: string, context?: LogContext) =>
        pinoLogger.info(context || {}, message),
      warn: (message: string, context?: LogContext) =>
        pinoLogger.warn(context || {}, message),
      error: (message: string, context?: LogContext) =>
        pinoLogger.error(context || {}, message),
      fatal: (message: string, context?: LogContext) =>
        pinoLogger.fatal(context || {}, message),
      child: (context: LogContext) => {
        const childPino = pinoLogger.child(context);
        return {
          trace: (message: string, ctx?: LogContext) =>
            childPino.trace(ctx || {}, message),
          debug: (message: string, ctx?: LogContext) =>
            childPino.debug(ctx || {}, message),
          info: (message: string, ctx?: LogContext) =>
            childPino.info(ctx || {}, message),
          warn: (message: string, ctx?: LogContext) =>
            childPino.warn(ctx || {}, message),
          error: (message: string, ctx?: LogContext) =>
            childPino.error(ctx || {}, message),
          fatal: (message: string, ctx?: LogContext) =>
            childPino.fatal(ctx || {}, message),
          child: () => {
            throw new Error("Nested child loggers not supported");
          },
        };
      },
    };
  } catch {
    return null;
  }
}

// Initialize logger
function getLogger(): Logger {
  if (_logger) return _logger;

  // Try async pino initialization, but use console fallback synchronously
  _logger = createConsoleLogger();

  // Async upgrade to pino if available
  createPinoLogger().then((pinoLogger) => {
    if (pinoLogger) {
      _logger = pinoLogger;
    }
  });

  return _logger;
}

export const logger = getLogger();

// Request logger helper
export function createRequestLogger(request: Request): Logger {
  const url = new URL(request.url);
  return logger.child({
    method: request.method,
    path: url.pathname,
    requestId: crypto.randomUUID(),
  });
}
