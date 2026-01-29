#!/bin/bash
# rollback-v6.sh
# ZZA VPS V6.0 - Safe Rollback Script
#
# Usage:
#   ./deploy/rollback-v6.sh v1.0.0          # Rollback to tag
#   ./deploy/rollback-v6.sh HEAD~1          # Rollback to previous commit
#   ./deploy/rollback-v6.sh abc123          # Rollback to specific commit
#
# This script:
# 1. Creates a database backup before rollback
# 2. Checks out the specified version
# 3. Rebuilds and redeploys
# 4. Verifies the rollback

set -e

# ============================================
# Configuration - CUSTOMIZE THESE
# ============================================
APP_NAME="${APP_NAME:-myapp}"
VPS_HOST="${VPS_HOST:-zza-vps}"
VPS_PATH="${VPS_PATH:-/home/deploy/apps/$APP_NAME}"
DOMAIN="${DOMAIN:-$APP_NAME.zzagroup.cloud}"

# Database settings
DB_CONTAINER="${APP_NAME}-db"
DB_USER="${DB_USER:-app}"
DB_NAME="${DB_NAME:-${APP_NAME}_db}"

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
# Check Arguments
# ============================================
if [[ -z "$1" ]]; then
    echo "ZZA VPS V6.0 Rollback Script"
    echo ""
    echo "Usage: ./deploy/rollback-v6.sh <version>"
    echo ""
    echo "Examples:"
    echo "  ./deploy/rollback-v6.sh v1.0.0      # Rollback to tag"
    echo "  ./deploy/rollback-v6.sh HEAD~1      # Previous commit"
    echo "  ./deploy/rollback-v6.sh abc123      # Specific commit"
    echo ""
    echo "Available versions on VPS:"
    ssh $VPS_HOST "cd $VPS_PATH && git tag -l | tail -10" 2>/dev/null || echo "(connect to VPS to see)"
    exit 1
fi

TARGET_VERSION="$1"

# ============================================
# Pre-Rollback
# ============================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║    ZZA VPS V6.0 - Safe Rollback                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

log_info "Application: $APP_NAME"
log_info "Target version: $TARGET_VERSION"
echo ""

# Show current version
log_info "Current deployed version:"
ssh $VPS_HOST "cd $VPS_PATH && git log -1 --oneline" || true
echo ""

# ============================================
# Confirmation
# ============================================
log_warning "⚠️  ROLLBACK OPERATION"
echo ""
echo "This will:"
echo "  1. Create a database backup"
echo "  2. Checkout version: $TARGET_VERSION"
echo "  3. Rebuild and redeploy the application"
echo ""
read -p "Proceed with rollback? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Rollback cancelled"
    exit 0
fi

# ============================================
# Step 1: Create Backup
# ============================================
log_info "Step 1/4: Creating pre-rollback backup..."

DB_EXISTS=$(ssh $VPS_HOST "docker ps --filter 'name=$DB_CONTAINER' --format '{{.Names}}'" || echo "")

if [[ -n "$DB_EXISTS" ]]; then
    BACKUP_FILE="${APP_NAME}_pre_rollback_$(date +%Y%m%d_%H%M%S).sql.gz"
    
    ssh $VPS_HOST << ENDSSH
mkdir -p $VPS_PATH/backups
docker exec $DB_CONTAINER pg_dump -U $DB_USER $DB_NAME | gzip > $VPS_PATH/backups/$BACKUP_FILE
echo "Backup: $BACKUP_FILE"
ENDSSH
    
    log_success "Pre-rollback backup created"
else
    log_info "No database container found - skipping backup"
fi

# ============================================
# Step 2: Checkout Target Version
# ============================================
log_info "Step 2/4: Checking out $TARGET_VERSION..."

ssh $VPS_HOST << ENDSSH
set -e
cd $VPS_PATH

echo "Fetching all tags..."
git fetch --all --tags

echo "Checking out: $TARGET_VERSION"
if git tag -l | grep -q "^${TARGET_VERSION}$"; then
    git checkout tags/$TARGET_VERSION
else
    git checkout $TARGET_VERSION
fi

echo ""
echo "Now at:"
git log -1 --oneline
ENDSSH

log_success "Checked out $TARGET_VERSION"

# ============================================
# Step 3: Rebuild & Deploy
# ============================================
log_info "Step 3/4: Rebuilding and deploying..."

ssh $VPS_HOST << ENDSSH
set -e
cd $VPS_PATH

echo "Building Docker images..."
if [[ -f "Dockerfile" ]]; then
    docker build --platform linux/amd64 -f Dockerfile -t ${APP_NAME}:latest .
elif [[ -f "Dockerfile.api" ]]; then
    docker build --platform linux/amd64 -f Dockerfile.api -t ${APP_NAME}-api:latest .
fi

echo ""
echo "Restarting containers..."
cd deploy
if [[ -f "docker-compose.yml" ]]; then
    docker compose up -d --force-recreate
elif [[ -f "docker-compose.prod.yml" ]]; then
    docker compose -f docker-compose.prod.yml up -d --force-recreate
fi

echo ""
echo "Waiting for services (30s)..."
sleep 30

echo ""
docker compose ps 2>/dev/null || docker-compose ps
ENDSSH

log_success "Rebuild and deploy complete"

# ============================================
# Step 4: Verify
# ============================================
log_info "Step 4/4: Verifying rollback..."

sleep 30

# Test endpoint
if curl -sf -o /dev/null https://${DOMAIN} 2>/dev/null; then
    log_success "Application accessible"
else
    log_warning "Application may need more time to start"
fi

# Show final version
echo ""
log_info "Deployed version:"
ssh $VPS_HOST "cd $VPS_PATH && git log -1 --oneline"

# ============================================
# Summary
# ============================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║    ✅ Rollback Complete!                                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Application: $APP_NAME"
echo "🏷️  Version: $TARGET_VERSION"
echo "🌐 URL: https://${DOMAIN}"
echo ""
echo "📋 Commands:"
echo "  View logs:    ssh $VPS_HOST 'docker logs -f ${APP_NAME}-app'"
echo "  Check status: ssh $VPS_HOST 'docker ps | grep ${APP_NAME}'"
echo ""
log_success "Rollback complete!"
