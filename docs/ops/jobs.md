# Background Jobs Runbook

## Architecture

- **Queue Backend**: PostgreSQL (pg-boss)
- **Worker Process**: Separate container (`worker` service)
- **Monitoring**: Admin UI at `/admin/jobs`
- **Dead Letter**: Permanently failed jobs stored for review

## Job Types

| Type | Description | Retry Policy |
|------|-------------|--------------|
| `email.send` | Send transactional email | 3 retries, 1m/5m/15m backoff |
| `webhook.deliver` | Deliver webhook payload | 3 retries, exponential backoff |
| `data.export` | Export user data (GDPR) | 2 retries |
| `cleanup.*` | Scheduled cleanup tasks | 1 retry |

## Worker Management

### Start Worker

```bash
# Development
pnpm run worker

# Production (via docker compose)
docker compose -f deploy/docker-compose.yml up -d worker
```

### Scale Workers

```bash
# Scale to 3 workers
docker compose -f deploy/docker-compose.yml up -d --scale worker=3
```

### Worker Health

Workers write heartbeat to:
- Database: `WorkerHeartbeat` table
- File: `/tmp/worker-heartbeat` (for Docker health check)

Check status at `/admin/jobs` or:

```bash
curl "https://${DOMAIN}/api/healthz?detailed=true" | jq '.checks[] | select(.name == "workers")'
```

## Idempotency

Use idempotency for jobs with side effects:

```typescript
import { withIdempotency } from "~/services/idempotency.server";

await withIdempotency(
  `email:welcome:${userId}`,  // Unique key
  86400,                       // TTL: 24 hours
  async () => {
    await sendWelcomeEmail(userId);
  }
);
```

This ensures the email is sent only once even if the job is retried.

### Idempotency Key Patterns

| Operation | Key Pattern |
|-----------|-------------|
| Email | `email:{type}:{recipientId}:{uniqueId}` |
| Webhook | `webhook:{webhookId}:{deliveryId}` |
| Payment | `payment:{orderId}:{action}` |

## Dead Letter Queue

Jobs that fail all retries are moved to the dead letter queue.

### View Dead Letters

- Admin UI: `/admin/jobs`
- API: Query `DeadLetterJob` table

### Retry a Dead Letter

1. Go to `/admin/jobs`
2. Find the failed job
3. Click "Retry" to re-queue
4. Monitor for success

### Resolve Without Retry

If the job should not be retried:
1. Click "Resolve"
2. Add notes explaining why
3. Job is marked resolved

### Cleanup

Old resolved dead letters are cleaned up automatically after 90 days.

Manual cleanup:
```typescript
import { cleanupDeadLetterJobs } from "~/services/dead-letter.server";
await cleanupDeadLetterJobs(90); // Delete resolved older than 90 days
```

## Monitoring

### Key Metrics

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| Queue depth | > 1000 for 15 min | Add workers |
| Failed jobs | Any | Investigate |
| Dead letters | Any new | Review within 24h |
| Worker heartbeat | > 2 min stale | Restart worker |

### Prometheus Metrics

```
job_queue_pending{} 45
job_queue_processing{} 3
job_queue_failed{} 0
job_processed_total{type="email.send", status="success"} 1234
job_duration_seconds_bucket{type="email.send", le="1"} 1200
```

## Troubleshooting

### Jobs Not Processing

1. Check worker is running:
   ```bash
   docker compose ps worker
   ```

2. Check worker logs:
   ```bash
   docker compose logs worker --tail=100
   ```

3. Check database connection
4. Verify job handlers are registered

### Job Stuck in Processing

Jobs stuck in "processing" usually indicate a crashed worker.

1. Check for stale processing jobs:
   ```sql
   SELECT * FROM "Job"
   WHERE status = 'processing'
   AND started_at < NOW() - INTERVAL '1 hour';
   ```

2. Reset stuck jobs:
   ```sql
   UPDATE "Job"
   SET status = 'pending', attempts = attempts - 1
   WHERE status = 'processing'
   AND started_at < NOW() - INTERVAL '1 hour';
   ```

### High Failure Rate

1. Check dead letter queue for patterns
2. Review error messages
3. Check external service availability (email, webhooks)
4. Review recent code changes

## Creating New Job Types

1. Define job type constant:
   ```typescript
   // jobs.server.ts
   export const JobTypes = {
     // ...existing
     MY_NEW_JOB: "my.new_job",
   } as const;
   ```

2. Register handler:
   ```typescript
   registerJobHandler(JobTypes.MY_NEW_JOB, async (payload) => {
     // Handle job
   });
   ```

3. Use idempotency if needed:
   ```typescript
   registerJobHandler(JobTypes.MY_NEW_JOB, async (payload) => {
     await withIdempotency(`my-job:${payload.id}`, 3600, async () => {
       // Idempotent work
     });
   });
   ```

4. Enqueue jobs:
   ```typescript
   await createJob({
     type: JobTypes.MY_NEW_JOB,
     payload: { id: "123" },
     priority: "normal",
   });
   ```

## Safe Job Execution

Use `runJobSafely` for automatic tracing, logging, and dead-letter handling:

```typescript
import { runJobSafely } from "~/services/dead-letter.server";

await runJobSafely(
  "email.send",
  jobId,
  payload,
  async () => {
    await sendEmail(payload);
  },
  { maxRetries: 3 }
);
```

This automatically:
- Creates tracing spans
- Logs with correlation IDs
- Handles retries with backoff
- Moves to dead letter on permanent failure
- Records metrics
