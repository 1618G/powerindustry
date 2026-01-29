/**
 * OpenTelemetry Initialization
 * 
 * MUST be called before any other imports in the application entry point.
 * Enables distributed tracing and metrics collection when OTEL_ENABLED=true.
 */

import { config } from "~/lib/config.server";
import { logger } from "~/lib/logger.server";

let otelInitialized = false;

export async function initOpenTelemetry(): Promise<void> {
  if (otelInitialized) return;
  if (!config.observability.otelEnabled) {
    logger.debug("OpenTelemetry disabled (OTEL_ENABLED=false)");
    return;
  }

  try {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { getNodeAutoInstrumentations } = await import(
      "@opentelemetry/auto-instrumentations-node"
    );
    const { OTLPTraceExporter } = await import(
      "@opentelemetry/exporter-trace-otlp-http"
    );
    const { OTLPMetricExporter } = await import(
      "@opentelemetry/exporter-metrics-otlp-http"
    );
    const { PeriodicExportingMetricReader } = await import(
      "@opentelemetry/sdk-metrics"
    );
    const { Resource } = await import("@opentelemetry/resources");
    const {
      ATTR_SERVICE_NAME,
      ATTR_SERVICE_VERSION,
      ATTR_DEPLOYMENT_ENVIRONMENT,
    } = await import("@opentelemetry/semantic-conventions");

    const resource = new Resource({
      [ATTR_SERVICE_NAME]: config.observability.otelServiceName,
      [ATTR_SERVICE_VERSION]: config.app.version,
      [ATTR_DEPLOYMENT_ENVIRONMENT]: config.env.NODE_ENV,
    });

    const traceExporter = new OTLPTraceExporter({
      url: `${config.observability.otelEndpoint}/v1/traces`,
    });

    const metricExporter = new OTLPMetricExporter({
      url: `${config.observability.otelEndpoint}/v1/metrics`,
    });

    const sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 30000, // 30 seconds
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable noisy instrumentations
          "@opentelemetry/instrumentation-fs": { enabled: false },
          "@opentelemetry/instrumentation-dns": { enabled: false },
          "@opentelemetry/instrumentation-net": { enabled: false },
          // Enable useful ones
          "@opentelemetry/instrumentation-http": {
            enabled: true,
            ignoreIncomingRequestHook: (req) => {
              // Ignore health checks and static assets
              const url = req.url || "";
              return (
                url.includes("/api/healthz") ||
                url.includes("/api/metrics") ||
                url.startsWith("/build/") ||
                url.startsWith("/assets/")
              );
            },
          },
          "@opentelemetry/instrumentation-pg": { enabled: true },
          "@opentelemetry/instrumentation-ioredis": { enabled: true },
        }),
      ],
    });

    sdk.start();
    otelInitialized = true;

    logger.info("OpenTelemetry initialized", {
      serviceName: config.observability.otelServiceName,
      endpoint: config.observability.otelEndpoint,
      version: config.app.version,
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      sdk
        .shutdown()
        .then(() => logger.info("OpenTelemetry shut down"))
        .catch((err) => logger.error("Error shutting down OpenTelemetry", { error: err.message }));
    });
  } catch (error) {
    logger.warn("Failed to initialize OpenTelemetry", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Create a manual span for custom instrumentation
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: () => Promise<T>
): Promise<T> {
  if (!config.observability.otelEnabled) {
    return fn();
  }

  try {
    const { trace, SpanStatusCode } = await import("@opentelemetry/api");
    const tracer = trace.getTracer(config.observability.otelServiceName);

    return await tracer.startActiveSpan(name, async (span) => {
      try {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, value);
        });
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      } finally {
        span.end();
      }
    });
  } catch {
    // OTEL not available, just run the function
    return fn();
  }
}

/**
 * Get current trace context for logging
 */
export async function getTraceContext(): Promise<{
  traceId?: string;
  spanId?: string;
} | null> {
  if (!config.observability.otelEnabled) return null;

  try {
    const { trace } = await import("@opentelemetry/api");
    const span = trace.getActiveSpan();
    if (!span) return null;

    const context = span.spanContext();
    return {
      traceId: context.traceId,
      spanId: context.spanId,
    };
  } catch {
    return null;
  }
}
