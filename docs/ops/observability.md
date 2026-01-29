# Observability Runbook

## Overview

The application supports three levels of observability:

1. **Structured Logging** - Always on (Pino)
2. **Prometheus Metrics** - Built-in, protected endpoint
3. **OpenTelemetry Tracing** - Optional, enable with `OTEL_ENABLED=true`
4. **Error Tracking** - Optional Sentry integration

## Logging

### Log Levels

Set via `LOG_LEVEL` environment variable:

| Level | When to Use |
|-------|-------------|
| `trace` | Detailed debugging |
| `debug` | Development debugging |
| `info` | Normal operations (default) |
| `warn` | Potential issues |
| `error` | Errors that need attention |
| `fatal` | Critical failures |

### Log Format

Production logs are JSON formatted:

```json
{
  "level": "info",
  "time": "2026-01-23T08:00:00.000Z",
  "msg": "Request completed",
  "requestId": "abc123",
  "correlationId": "xyz789",
  "method": "GET",
  "path": "/api/users",
  "statusCode": 200,
  "duration": 45
}
```

### Viewing Logs

```bash
# Live logs
docker compose logs -f app

# Filter by level
docker compose logs app 2>&1 | jq 'select(.level == "error")'

# Search by correlationId
docker compose logs app 2>&1 | jq 'select(.correlationId == "xyz789")'
```

## Metrics

### Endpoint

- **URL**: `/api/metrics`
- **Format**: Prometheus text format
- **Auth**: Requires `METRICS_TOKEN` header or query param

### Access Metrics

```bash
# With header
curl -H "X-Metrics-Token: ${METRICS_TOKEN}" https://${DOMAIN}/api/metrics

# With Bearer token
curl -H "Authorization: Bearer ${METRICS_TOKEN}" https://${DOMAIN}/api/metrics
```

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests by method/path/status |
| `http_request_duration_seconds` | Histogram | Request duration buckets |
| `job_processed_total` | Counter | Jobs processed by type/status |
| `job_duration_seconds` | Histogram | Job execution duration |
| `job_queue_pending` | Gauge | Pending jobs in queue |
| `job_queue_failed` | Gauge | Failed jobs |
| `process_memory_heap_bytes` | Gauge | Node.js heap memory |
| `process_uptime_seconds` | Gauge | Process uptime |
| `app_info` | Gauge | App version info |

### Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: 'zza-app'
    static_configs:
      - targets: ['app:3000']
    metrics_path: /api/metrics
    bearer_token: ${METRICS_TOKEN}
```

## OpenTelemetry Tracing

### Enable Tracing

```env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

### Enable OTEL Collector in Compose

```bash
docker compose -f deploy/docker-compose.yml --profile observability up -d
```

### Collector Configuration

Located at `deploy/traefik/otel-collector.yaml`:

- Receives OTLP over HTTP (4318) and gRPC (4317)
- Exports to stdout by default
- Configurable to send to Jaeger, Zipkin, Datadog, etc.

### Custom Spans

```typescript
import { withSpan } from "~/observability/otel.server";

await withSpan("process-payment", { orderId, amount }, async () => {
  // Your code here
});
```

## Error Tracking (Sentry)

### Enable Sentry

```env
SENTRY_DSN=https://xxxxx@sentry.io/project
```

### Captured Automatically

- Unhandled exceptions
- Unhandled promise rejections
- Errors passed to `captureException()`

### Manual Error Capture

```typescript
import { captureException, captureMessage } from "~/observability/errors.server";

try {
  // ...
} catch (error) {
  await captureException(error, {
    userId: user.id,
    action: "process-payment",
    extra: { orderId },
  });
}
```

## Health Checks

### Quick Check (Load Balancer)

```bash
curl https://${DOMAIN}/api/healthz
# {"status":"healthy","version":"1.0.0","timestamp":"..."}
```

### Detailed Check

```bash
curl "https://${DOMAIN}/api/healthz?detailed=true" | jq
```

Returns:
- Database connectivity
- Redis connectivity
- Worker status
- Job queue depth
- All service configurations

## Alerting Recommendations

### Critical Alerts

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Health check fails | 3 consecutive | Page on-call |
| Error rate | > 5% for 5 min | Page on-call |
| Response time P99 | > 5s for 5 min | Notify team |
| Queue depth | > 1000 pending | Investigate |
| Dead letter jobs | Any new | Review within 24h |

### Monitoring Dashboard

Key panels to include:

1. Request rate and error rate
2. Response time percentiles
3. Job queue depth over time
4. Memory and CPU usage
5. Active workers
6. Dead letter queue size

## Troubleshooting

### High Error Rate

1. Check logs for error patterns: `docker compose logs app | grep error`
2. Check health endpoint: `/api/healthz?detailed=true`
3. Check database connections
4. Review recent deployments

### Slow Responses

1. Check database query performance
2. Check Redis connectivity
3. Review job queue depth (blocking on full queue?)
4. Check memory usage

### Missing Traces

1. Verify `OTEL_ENABLED=true`
2. Check collector is running: `docker compose ps otel-collector`
3. Check collector logs: `docker compose logs otel-collector`
4. Verify endpoint URL is correct
