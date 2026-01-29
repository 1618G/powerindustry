# Traefik Configuration

## Overview

Traefik acts as the reverse proxy and handles:
- SSL/TLS termination (Let's Encrypt)
- Request routing
- Security headers
- Rate limiting
- Load balancing with health checks

## Architecture

```
Internet → Traefik (443) → App Container (3000)
                        → Worker Container (no external)
                        → Postgres (internal only)
                        → Redis (internal only)
```

## Middlewares

Defined in `deploy/traefik/middlewares.yml`:

### security-headers
OWASP-recommended security headers:
- HSTS with preload
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- CSP (adjust per app needs)

### rate-limit
- 100 requests/minute burst 50
- Source: client IP

### rate-limit-strict
- 10 requests/minute burst 5
- For sensitive endpoints (login, register)

### rate-limit-upload
- 10 requests/hour burst 3
- For file upload endpoints

### body-limit-default
- 1MB max request body

### body-limit-upload
- 50MB for file uploads

### compress
- Gzip compression (excludes SSE)

## Docker Labels

Applied to app service in `deploy/docker-compose.yml`:

```yaml
labels:
  # Enable Traefik
  - "traefik.enable=true"
  - "traefik.docker.network=proxy"
  
  # Main routing
  - "traefik.http.routers.${APP_NAME}-app.rule=Host(`${DOMAIN}`)"
  - "traefik.http.routers.${APP_NAME}-app.entrypoints=websecure"
  - "traefik.http.routers.${APP_NAME}-app.tls.certresolver=letsencrypt"
  - "traefik.http.routers.${APP_NAME}-app.middlewares=security-headers@file,rate-limit@file,compress@file"
  
  # Health-based routing
  - "traefik.http.services.${APP_NAME}-app.loadbalancer.healthcheck.path=/api/healthz"
  - "traefik.http.services.${APP_NAME}-app.loadbalancer.healthcheck.interval=10s"
  
  # Block /api/metrics publicly
  - "traefik.http.routers.${APP_NAME}-metrics-block.rule=Host(`${DOMAIN}`) && PathPrefix(`/api/metrics`)"
  - "traefik.http.routers.${APP_NAME}-metrics-block.middlewares=metrics-auth@file"
  - "traefik.http.routers.${APP_NAME}-metrics-block.priority=100"
```

## Health-Gated Rollout

Traefik only routes to healthy containers:

1. Health check runs every 10s
2. Container must pass 3 consecutive checks
3. Failed containers are removed from rotation
4. New containers get 30s start period

This enables zero-downtime deploys:
- New container starts
- Waits for health checks to pass
- Traefik adds to rotation
- Old container removed after drain

## SSL/TLS

### Let's Encrypt Setup

Automatic via `certresolver=letsencrypt`:

```yaml
command:
  - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
  - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
  - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
```

### Certificate Storage

Persisted in `traefik_letsencrypt` volume.

### Force HTTPS

Automatic redirect via:
```yaml
- "--entrypoints.web.http.redirections.entryPoint.to=websecure"
```

## Rate Limit Configuration

### Per-Path Limits

Add additional routers with higher priority:

```yaml
# Stricter rate limit for auth endpoints
- "traefik.http.routers.${APP_NAME}-auth.rule=Host(`${DOMAIN}`) && PathPrefix(`/login`, `/register`)"
- "traefik.http.routers.${APP_NAME}-auth.middlewares=security-headers@file,rate-limit-strict@file"
- "traefik.http.routers.${APP_NAME}-auth.priority=50"

# Larger body for uploads
- "traefik.http.routers.${APP_NAME}-upload.rule=Host(`${DOMAIN}`) && PathPrefix(`/api/upload`)"
- "traefik.http.routers.${APP_NAME}-upload.middlewares=body-limit-upload@file,rate-limit-upload@file"
- "traefik.http.routers.${APP_NAME}-upload.priority=50"
```

## Protecting Internal Endpoints

### /api/metrics

Protected by `metrics-auth@file` middleware.

Access requires valid `METRICS_TOKEN`:
```bash
curl -H "X-Metrics-Token: ${METRICS_TOKEN}" https://${DOMAIN}/api/metrics
```

### Admin Routes

Consider adding IP allowlist:

```yaml
# In middlewares.yml
admin-only:
  ipAllowList:
    sourceRange:
      - "YOUR_OFFICE_IP/32"
```

```yaml
# In docker labels
- "traefik.http.routers.${APP_NAME}-admin.rule=Host(`${DOMAIN}`) && PathPrefix(`/admin`)"
- "traefik.http.routers.${APP_NAME}-admin.middlewares=admin-only@file,security-headers@file"
```

## Dashboard

Optional dashboard at `traefik.${DOMAIN}`:

Protected by basic auth (change password!):
```yaml
auth-basic:
  basicAuth:
    users:
      - "admin:$apr1$..."  # Generate with: htpasswd -n admin
```

## Troubleshooting

### Check Traefik Logs

```bash
docker compose logs traefik
```

### View Active Routers

```bash
curl http://localhost:8080/api/http/routers
```

### Certificate Issues

1. Check ACME email is valid
2. Check DNS points to server
3. Check port 80 is accessible (for HTTP challenge)
4. View certificate storage:
   ```bash
   docker compose exec traefik cat /letsencrypt/acme.json
   ```

### 502 Bad Gateway

1. Check app container is running and healthy
2. Check app is listening on port 3000
3. Check network connectivity between Traefik and app
4. Review app logs

### Rate Limit Testing

```bash
# Test rate limiting
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://${DOMAIN}/api/test
done
# Should see 429 after limit exceeded
```
