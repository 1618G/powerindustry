# Kubernetes Deployment Guide

## Overview

This directory contains Kubernetes manifests for deploying ZZA Platform in production with:

- ✅ **Horizontal Pod Autoscaling** (3-20 replicas based on CPU/Memory)
- ✅ **High Availability** (Multi-replica deployment with rolling updates)
- ✅ **Persistent Storage** (PostgreSQL and Redis with PVCs)
- ✅ **Health Checks** (Liveness and readiness probes)
- ✅ **SSL/TLS** (Automatic HTTPS with cert-manager)
- ✅ **Resource Limits** (Defined CPU/Memory limits for stability)

## Prerequisites

1. **Kubernetes Cluster** (GKE, EKS, AKS, or self-hosted)
2. **kubectl** configured to access your cluster
3. **NGINX Ingress Controller** installed
4. **cert-manager** installed for automatic SSL certificates

### Install NGINX Ingress Controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml
```

### Install cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml
```

## Quick Start

### 1. Create Namespace

```bash
kubectl create namespace production
kubectl config set-context --current --namespace=production
```

### 2. Configure Secrets

```bash
# Copy the example secrets file
cp k8s/secrets.example.yaml k8s/secrets.yaml

# Edit with your real values (DO NOT COMMIT)
nano k8s/secrets.yaml

# Apply secrets
kubectl apply -f k8s/secrets.yaml
```

### 3. Configure ConfigMap

```bash
# Edit configmap with your domain and settings
nano k8s/configmap.yaml

# Apply configmap
kubectl apply -f k8s/configmap.yaml
```

### 4. Deploy Infrastructure

```bash
# Deploy PostgreSQL
kubectl apply -f k8s/postgres.yaml

# Deploy Redis
kubectl apply -f k8s/redis.yaml

# Wait for infrastructure to be ready
kubectl wait --for=condition=ready pod -l app=postgres --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis --timeout=300s
```

### 5. Deploy Application

```bash
# Build and push your Docker image
docker build -t YOUR_REGISTRY/zza-app:latest .
docker push YOUR_REGISTRY/zza-app:latest

# Update deployment.yaml with your image URL
nano k8s/deployment.yaml

# Deploy application
kubectl apply -f k8s/deployment.yaml

# Deploy autoscaler
kubectl apply -f k8s/hpa.yaml
```

### 6. Verify Deployment

```bash
# Check pods
kubectl get pods

# Check services
kubectl get services

# Check ingress
kubectl get ingress

# View logs
kubectl logs -l app=zza-app --tail=100 -f

# Check autoscaler
kubectl get hpa
```

## Accessing the Application

Once deployed, your application will be available at:

- **Production**: https://yourdomain.com
- **WWW**: https://www.yourdomain.com

SSL certificates are automatically provisioned by cert-manager and Let's Encrypt.

## Scaling

### Manual Scaling

```bash
# Scale to specific number of replicas
kubectl scale deployment zza-app --replicas=5

# Scale down
kubectl scale deployment zza-app --replicas=3
```

### Automatic Scaling

The HPA (Horizontal Pod Autoscaler) automatically scales between 3-20 replicas based on:
- **CPU utilization**: 70% threshold
- **Memory utilization**: 80% threshold

## Database Migrations

```bash
# Run migrations in a one-off pod
kubectl run migration --rm -it --image=YOUR_REGISTRY/zza-app:latest --restart=Never -- pnpm db:migrate

# Or exec into a running pod
kubectl exec -it deployment/zza-app -- pnpm db:migrate
```

## Monitoring

### View Application Logs

```bash
# All pods
kubectl logs -l app=zza-app --tail=100 -f

# Specific pod
kubectl logs zza-app-xxxxx-yyyyy -f

# Previous pod (if crashed)
kubectl logs zza-app-xxxxx-yyyyy --previous
```

### Check Resource Usage

```bash
# Pod resources
kubectl top pods

# Node resources
kubectl top nodes

# HPA status
kubectl get hpa zza-app-hpa
```

### Health Checks

```bash
# Check pod health
kubectl get pods -l app=zza-app

# Describe pod for events
kubectl describe pod zza-app-xxxxx-yyyyy

# Check readiness/liveness probe status
kubectl get pods -o wide
```

## Rolling Updates

### Deploy New Version

```bash
# Build and push new version
docker build -t YOUR_REGISTRY/zza-app:v1.2.0 .
docker push YOUR_REGISTRY/zza-app:v1.2.0

# Update deployment
kubectl set image deployment/zza-app app=YOUR_REGISTRY/zza-app:v1.2.0

# Watch rollout
kubectl rollout status deployment/zza-app
```

### Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment/zza-app

# Rollback to specific revision
kubectl rollout undo deployment/zza-app --to-revision=2

# View rollout history
kubectl rollout history deployment/zza-app
```

## Backup & Recovery

### Database Backup

```bash
# Backup PostgreSQL
kubectl exec -it deployment/postgres -- pg_dump -U postgres app_production > backup-$(date +%Y%m%d).sql

# Restore PostgreSQL
kubectl exec -i deployment/postgres -- psql -U postgres app_production < backup-20260122.sql
```

### Redis Backup

```bash
# Trigger Redis save
kubectl exec -it deployment/redis -- redis-cli BGSAVE

# Copy RDB file
kubectl cp redis-xxxxx:/data/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb
```

## Troubleshooting

### Pod Not Starting

```bash
# Check events
kubectl describe pod zza-app-xxxxx-yyyyy

# Check logs
kubectl logs zza-app-xxxxx-yyyyy

# Check resource constraints
kubectl top pods
```

### Database Connection Issues

```bash
# Test database connectivity
kubectl run -it --rm debug --image=postgres:16-alpine --restart=Never -- \
  psql -h postgres-service -U postgres -d app_production

# Check database logs
kubectl logs deployment/postgres
```

### Redis Connection Issues

```bash
# Test Redis connectivity
kubectl run -it --rm debug --image=redis:7-alpine --restart=Never -- \
  redis-cli -h redis-service ping

# Check Redis logs
kubectl logs deployment/redis
```

### SSL Certificate Issues

```bash
# Check certificate status
kubectl get certificate

# Check certificate details
kubectl describe certificate zza-tls-cert

# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager
```

## Resource Recommendations

### Small/Medium (< 10k users)
- **App**: 3 replicas, 512Mi RAM, 250m CPU
- **PostgreSQL**: 1 replica, 2Gi RAM, 1 CPU
- **Redis**: 1 replica, 1Gi RAM, 500m CPU

### Large (10k-100k users)
- **App**: 5-10 replicas, 1Gi RAM, 500m CPU
- **PostgreSQL**: Managed service (RDS, CloudSQL, Azure Database)
- **Redis**: Managed service (ElastiCache, Memorystore, Azure Cache)

### Enterprise (100k+ users)
- **App**: 10-20+ replicas, 2Gi RAM, 1 CPU
- **PostgreSQL**: Managed service with read replicas
- **Redis**: Managed Redis cluster

## Security Best Practices

1. ✅ **Never commit secrets** - Add `k8s/secrets.yaml` to `.gitignore`
2. ✅ **Use RBAC** - Implement role-based access control
3. ✅ **Network Policies** - Restrict pod-to-pod communication
4. ✅ **Image Scanning** - Scan Docker images for vulnerabilities
5. ✅ **Pod Security** - Use SecurityContext and PodSecurityPolicies
6. ✅ **Secrets Management** - Consider external secrets (Vault, AWS Secrets Manager)
7. ✅ **Regular Updates** - Keep Kubernetes and images updated

## Monitoring & Observability

Consider adding:
- **Prometheus** - Metrics collection
- **Grafana** - Metrics visualization
- **Loki** - Log aggregation
- **Jaeger** - Distributed tracing
- **Sentry** - Error tracking

## Cost Optimization

1. **Use node pools** - Different workload tiers
2. **Enable cluster autoscaler** - Scale nodes automatically
3. **Use spot/preemptible instances** - For non-critical workloads
4. **Resource requests** - Set accurate CPU/memory requests
5. **PVC cleanup** - Delete unused persistent volumes

---

**Note**: This is a production-ready Kubernetes configuration designed for high availability and scalability. Adjust resource limits and replica counts based on your specific needs.
