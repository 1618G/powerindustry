# Deployment Runbook

## Prerequisites

1. Docker and Docker Compose installed on VPS
2. Traefik proxy network created: `docker network create proxy`
3. DNS pointing to VPS IP
4. `.env` file configured from `deploy/env.production.example`

## Standard Deployment

### 1. Pull Latest Image

```bash
docker pull ${IMAGE_NAME}:${IMAGE_TAG}
# Or build locally:
docker compose -f deploy/docker-compose.yml build
```

### 2. Run Migrations

```bash
docker compose -f deploy/docker-compose.yml run --rm migrate
```

Wait for migrations to complete successfully.

### 3. Deploy with Health-Gated Rollout

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Traefik will only route traffic to containers that pass health checks:
- Health check endpoint: `/api/healthz`
- Interval: 15s, Timeout: 5s, Retries: 3
- Start period: 30s (grace period for cold start)

### 4. Verify Deployment

```bash
# Check container health
docker compose -f deploy/docker-compose.yml ps

# Check logs
docker compose -f deploy/docker-compose.yml logs -f app

# Test health endpoint
curl -s https://${DOMAIN}/api/healthz | jq
```

## Zero-Downtime Rolling Update

For production with no downtime:

```bash
# 1. Pull new image
docker compose -f deploy/docker-compose.yml pull

# 2. Run migrations first (backward compatible!)
docker compose -f deploy/docker-compose.yml run --rm migrate

# 3. Scale up with new version (old containers keep serving)
docker compose -f deploy/docker-compose.yml up -d --no-deps --scale app=2 app

# 4. Wait for new container to be healthy
sleep 30

# 5. Scale down to 1 (removes old container)
docker compose -f deploy/docker-compose.yml up -d --no-deps --scale app=1 app
```

## Rollback Procedure

### Quick Rollback (to previous image)

```bash
# 1. Stop current containers
docker compose -f deploy/docker-compose.yml stop app worker

# 2. Switch to previous tag
export IMAGE_TAG=previous

# 3. Start with old image
docker compose -f deploy/docker-compose.yml up -d app worker
```

### Full Rollback (including database)

**Warning: This is destructive!**

```bash
# 1. Stop app
docker compose -f deploy/docker-compose.yml stop app worker

# 2. Restore database backup
./scripts/restore/postgres-restore.sh /var/backups/zza/${APP_NAME}/backup_TIMESTAMP.sql.gz -c

# 3. Start with matching image version
export IMAGE_TAG=matching_version
docker compose -f deploy/docker-compose.yml up -d
```

## Monitoring After Deploy

1. Check `/api/healthz?detailed=true`
2. Monitor logs for errors: `docker compose logs -f app`
3. Check Traefik dashboard if enabled
4. Verify feature flags at `/admin/flags`
5. Check job queue at `/admin/jobs`

## Emergency Procedures

### App Won't Start

```bash
# Check env validation
docker compose -f deploy/docker-compose.yml run --rm app env

# Check container logs
docker compose -f deploy/docker-compose.yml logs app --tail=100

# Common issues:
# - DATABASE_URL not reachable
# - SESSION_SECRET too short
# - Port already in use
```

### Database Connection Failed

```bash
# Check if postgres is running
docker compose -f deploy/docker-compose.yml ps postgres

# Check postgres logs
docker compose -f deploy/docker-compose.yml logs postgres

# Test connection
docker compose -f deploy/docker-compose.yml exec postgres pg_isready
```

### Enable Maintenance Mode

Use feature flags:

```bash
curl -X POST https://${DOMAIN}/admin/flags \
  -H "Content-Type: application/json" \
  -d '{"intent": "toggle", "key": "maintenance_mode"}'
```

Or via admin UI at `/admin/flags`.
