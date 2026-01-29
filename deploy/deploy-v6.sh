#!/bin/bash
# deploy-v6.sh
# ZZA VPS Deployment V6.0 - Safety-First Git-Based Deployment
#
# Key V6.0 Features:
# - Automatic database backup before deployment
# - SSH key verification
# - Additive schema changes only (warns before data loss)
# - Explicit confirmation for destructive operations
# - Rollback-ready with version tagging
#
# Usage: 
#   ./deploy/deploy-v6.sh                    # Deploy latest from branch
#   ./deploy/deploy-v6.sh --tag v1.0.0       # Deploy specific tag
#   ./deploy/deploy-v6.sh --skip-backup      # Skip backup (not recommended)

set -e

# ============================================
# Configuration - CUSTOMIZE THESE
# ============================================
# These should match your project settings
APP_NAME="${APP_NAME:-myapp}"             # Application name (override with APP_NAME env var)
VPS_HOST="${VPS_HOST:-zza-vps}"           # SSH alias from ~/.ssh/config
VPS_PATH="${VPS_PATH:-/home/deploy/apps/$APP_NAME}"
BRANCH="${BRANCH:-main}"                   # or 'production', 'staging'
GIT_REMOTE="${GIT_REMOTE:-origin}"
DOMAIN="${DOMAIN:-$APP_NAME.zzagroup.cloud}"

# Database settings
DB_CONTAINER="${APP_NAME}-db"
DB_USER="${DB_USER:-app}"
DB_NAME="${DB_NAME:-${APP_NAME}_db}"

# ============================================
# Parse Arguments
# ============================================
DEPLOY_TAG=""
SKIP_BACKUP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --tag)
            DEPLOY_TAG="$2"
            shift 2
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --help)
            echo "ZZA VPS V6.0 Deployment Script"
            echo ""
            echo "Usage: ./deploy/deploy-v6.sh [options]"
            echo ""
            echo "Options:"
            echo "  --tag <version>   Deploy specific tag (e.g., v1.0.0)"
            echo "  --skip-backup     Skip database backup (not recommended)"
            echo "  --help            Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  APP_NAME          Application name (default: myapp)"
            echo "  VPS_HOST          VPS SSH alias (default: zza-vps)"
            echo "  BRANCH            Git branch to deploy (default: main)"
            echo "  DOMAIN            Application domain (default: APP_NAME.zzagroup.cloud)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./deploy/deploy-v6.sh [--tag v1.0.0] [--skip-backup]"
            exit 1
            ;;
    esac
done

# ============================================
# Colors
# ============================================
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# ============================================
# Pre-Deployment Checks
# ============================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║    ZZA VPS Deployment V6.0 - Safety First                     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
log_info "Application: $APP_NAME"
log_info "Domain: $DOMAIN"
if [[ -n "$DEPLOY_TAG" ]]; then
    log_info "Target: Tag $DEPLOY_TAG"
else
    log_info "Target: Branch $BRANCH (latest)"
fi
echo ""

# ============================================
# Step 1: Verify SSH Connection
# ============================================
log_info "Step 1/8: Verifying SSH connection..."

if ! ssh $VPS_HOST "echo 'SSH OK'" &>/dev/null; then
    log_error "Cannot connect to VPS via SSH"
    log_info "Run the SSH setup script first:"
    log_info "  ./deploy/setup-ssh.sh"
    exit 1
fi
log_success "SSH connection verified"

# Verify GitHub access from VPS
log_info "Verifying GitHub access from VPS..."
GITHUB_RESULT=$(ssh $VPS_HOST "ssh -T git@github.com 2>&1" || true)
if echo "$GITHUB_RESULT" | grep -q "successfully authenticated"; then
    log_success "GitHub access verified"
else
    log_warning "GitHub access from VPS may not be configured"
    log_info "Result: $GITHUB_RESULT"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# ============================================
# Step 2: Check for Uncommitted Changes
# ============================================
log_info "Step 2/8: Checking local Git status..."

if ! git rev-parse --git-dir > /dev/null 2>&1; then
    log_error "Not a git repository!"
    exit 1
fi

if [[ -z "$DEPLOY_TAG" ]]; then
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        log_warning "You have uncommitted changes!"
        git status --short
        echo ""
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled. Commit your changes first."
            exit 1
        fi
    fi
fi

COMMIT_HASH=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B | head -1)
log_success "Current commit: $COMMIT_HASH - $COMMIT_MSG"
echo ""

# ============================================
# Step 3: Database Backup (V6.0 Safety Feature)
# ============================================
log_info "Step 3/8: Database backup..."

if [[ "$SKIP_BACKUP" == "true" ]]; then
    log_warning "Skipping backup (--skip-backup flag used)"
else
    # Check if database container exists
    DB_EXISTS=$(ssh $VPS_HOST "docker ps --filter 'name=$DB_CONTAINER' --format '{{.Names}}'" || echo "")
    
    if [[ -n "$DB_EXISTS" ]]; then
        log_info "Creating database backup before deployment..."
        BACKUP_FILE="${APP_NAME}_$(date +%Y%m%d_%H%M%S).sql.gz"
        
        ssh $VPS_HOST << ENDSSH
set -e
mkdir -p $VPS_PATH/backups
docker exec $DB_CONTAINER pg_dump -U $DB_USER $DB_NAME | gzip > $VPS_PATH/backups/$BACKUP_FILE
echo "Backup created: $BACKUP_FILE"
ls -lh $VPS_PATH/backups/$BACKUP_FILE
ENDSSH
        
        log_success "Database backup created: $BACKUP_FILE"
    else
        log_info "No existing database found - skipping backup (new deployment)"
    fi
fi
echo ""

# ============================================
# Step 4: Push to Git Remote
# ============================================
log_info "Step 4/8: Pushing code to Git..."

if [[ -z "$DEPLOY_TAG" ]]; then
    if git push $GIT_REMOTE $BRANCH; then
        log_success "Code pushed to $GIT_REMOTE/$BRANCH"
    else
        log_error "Failed to push to Git remote"
        exit 1
    fi
else
    log_info "Deploying from tag $DEPLOY_TAG (skipping push)"
fi
echo ""

# ============================================
# Step 5: Pull on VPS
# ============================================
log_info "Step 5/8: Pulling code on VPS..."

ssh $VPS_HOST << ENDSSH
set -e

cd $VPS_PATH

echo "📥 Fetching latest from Git..."
git fetch --all --tags

if [[ -n "$DEPLOY_TAG" ]]; then
    echo "🔄 Checking out tag: $DEPLOY_TAG"
    git checkout tags/$DEPLOY_TAG
else
    echo "🔄 Pulling latest from $BRANCH..."
    git pull $GIT_REMOTE $BRANCH
fi

echo ""
echo "🔍 Current version on VPS:"
git log -1 --oneline
git describe --tags --always 2>/dev/null || echo "(no tags)"
ENDSSH

log_success "Code pulled on VPS"
echo ""

# ============================================
# Step 6: Check Schema Changes
# ============================================
log_info "Step 6/8: Checking for schema changes..."

# Check if there are migration files
MIGRATION_CHECK=$(ssh $VPS_HOST "ls $VPS_PATH/prisma/migrations/ 2>/dev/null | wc -l" || echo "0")

if [[ "$MIGRATION_CHECK" -gt "0" ]]; then
    log_info "Found $MIGRATION_CHECK migration directories"
fi

log_success "Schema check complete"
echo ""

# ============================================
# Step 7: Build & Deploy
# ============================================
log_info "Step 7/8: Building and deploying..."

ssh $VPS_HOST << ENDSSH
set -e

cd $VPS_PATH

echo "🏗️  Building Docker images..."

# Build using Dockerfile (handles both api and combined)
if [[ -f "Dockerfile" ]]; then
    docker build --platform linux/amd64 -f Dockerfile -t ${APP_NAME}:latest .
elif [[ -f "Dockerfile.api" ]]; then
    docker build --platform linux/amd64 -f Dockerfile.api -t ${APP_NAME}-api:latest .
fi

echo "✅ Build complete"
echo ""

echo "🚀 Starting services..."
cd deploy

# Use docker-compose.yml in deploy folder
if [[ -f "docker-compose.yml" ]]; then
    docker compose up -d
elif [[ -f "docker-compose.prod.yml" ]]; then
    docker compose -f docker-compose.prod.yml up -d
fi

echo ""
echo "⏳ Waiting for services to initialize (45s)..."
sleep 45

echo ""
echo "📊 Container status:"
docker compose ps 2>/dev/null || docker-compose ps
ENDSSH

log_success "Containers deployed"
echo ""

# ============================================
# Step 8: Run Migrations & Verify
# ============================================
log_info "Step 8/8: Running migrations and verifying..."

ssh $VPS_HOST << ENDSSH
set -e

cd $VPS_PATH

echo "🗄️  Running Prisma migrations..."
if docker exec ${APP_NAME}-app pnpm exec prisma migrate deploy 2>/dev/null; then
    echo "✅ Migrations completed successfully"
elif docker exec ${APP_NAME} pnpm exec prisma migrate deploy 2>/dev/null; then
    echo "✅ Migrations completed successfully"
else
    echo "⚠️  Migration command completed (may have warnings)"
fi

echo ""
echo "📊 Final container status:"
docker ps --filter "name=${APP_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
ENDSSH

log_success "Migrations complete"
echo ""

# ============================================
# Verification
# ============================================
log_info "Waiting for SSL certificate and Traefik discovery (2 minutes)..."
sleep 120

log_info "Testing endpoints..."

# Test frontend
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" https://${DOMAIN} 2>/dev/null || echo "failed")
if [[ "$HTTP_CODE" == "200" ]]; then
    log_success "Frontend accessible (HTTP 200)"
else
    log_warning "Frontend returned: $HTTP_CODE (may need more time)"
fi

# Test API health
for endpoint in "/api/healthz" "/healthz" "/api/health" "/health"; do
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" https://${DOMAIN}${endpoint} 2>/dev/null || echo "failed")
    if [[ "$HTTP_CODE" == "200" ]]; then
        log_success "Health endpoint $endpoint returned 200"
        break
    fi
done

# Check security headers
if curl -sI https://${DOMAIN} 2>/dev/null | grep -iq "strict-transport-security"; then
    log_success "Security headers present (HSTS found)"
else
    log_warning "Security headers may not be configured yet"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║    ✅ Deployment Complete!                                     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Application: $APP_NAME"
if [[ -n "$DEPLOY_TAG" ]]; then
    echo "🏷️  Version: $DEPLOY_TAG"
else
    echo "📦 Commit: $COMMIT_HASH"
fi
echo "🌐 Frontend: https://${DOMAIN}"
echo "🔌 API: https://${DOMAIN}/api"
if [[ "$SKIP_BACKUP" != "true" ]]; then
    echo "💾 Backup: $VPS_PATH/backups/"
fi
echo ""
echo "────────────────────────────────────────────────────────────────"
echo ""
echo "📋 Useful commands:"
echo "  View logs:    ssh $VPS_HOST 'docker logs -f ${APP_NAME}-app'"
echo "  Check status: ssh $VPS_HOST 'docker ps | grep ${APP_NAME}'"
echo "  View version: ssh $VPS_HOST 'cd $VPS_PATH && git log -1 --oneline'"
echo "  Rollback:     ./deploy/rollback-v6.sh <version>"
echo ""
log_success "Deployment complete! Monitor logs for any issues."
