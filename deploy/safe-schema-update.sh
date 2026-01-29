#!/bin/bash
# safe-schema-update.sh
# ZZA VPS V6.0 - Safe Database Schema Update Script
#
# This script follows the V6.0 policy:
# - ALWAYS backup before schema changes
# - ADD new schema, don't delete unless explicitly asked
# - Warn and confirm before any data loss operations
#
# Usage:
#   ./deploy/safe-schema-update.sh                  # Push schema (additive only)
#   ./deploy/safe-schema-update.sh --allow-loss     # Allow data loss (REQUIRES CONFIRMATION)

set -e

# ============================================
# Configuration - CUSTOMIZE THESE
# ============================================
APP_NAME="${APP_NAME:-myapp}"
VPS_HOST="${VPS_HOST:-zza-vps}"
VPS_PATH="${VPS_PATH:-/home/deploy/apps/$APP_NAME}"

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
# Parse Arguments
# ============================================
ALLOW_LOSS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --allow-loss)
            ALLOW_LOSS=true
            shift
            ;;
        --help)
            echo "ZZA VPS V6.0 Safe Schema Update Script"
            echo ""
            echo "Usage: ./deploy/safe-schema-update.sh [options]"
            echo ""
            echo "Options:"
            echo "  --allow-loss   Allow schema changes that cause data loss"
            echo "                 (REQUIRES explicit confirmation)"
            echo "  --help         Show this help message"
            echo ""
            echo "V6.0 Policy: ADD don't DELETE"
            echo "  - Adding new tables/columns is always safe"
            echo "  - Removing or changing columns requires --allow-loss"
            echo "  - A backup is ALWAYS created before any changes"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ============================================
# Header
# ============================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║    ZZA VPS V6.0 - Safe Schema Update                          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

log_info "Application: $APP_NAME"
log_info "Database: $DB_NAME"
echo ""

# ============================================
# Step 1: Create Backup (MANDATORY)
# ============================================
log_info "Step 1: Creating mandatory backup..."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${APP_NAME}_before_schema_${TIMESTAMP}.sql.gz"

ssh $VPS_HOST << ENDSSH
set -e
mkdir -p $VPS_PATH/backups
docker exec $DB_CONTAINER pg_dump -U $DB_USER $DB_NAME | gzip > $VPS_PATH/backups/$BACKUP_FILE
echo "Backup created: $BACKUP_FILE"
ENDSSH

log_success "Backup created: $BACKUP_FILE"
echo ""

# ============================================
# Step 2: Check for Schema Changes
# ============================================
log_info "Step 2: Checking schema changes..."

# First, try a dry run to see what would change
log_info "Running Prisma migrate status..."

MIGRATE_STATUS=$(ssh $VPS_HOST "docker exec ${APP_NAME}-app pnpm exec prisma migrate status 2>&1" 2>/dev/null || \
                 ssh $VPS_HOST "docker exec ${APP_NAME} pnpm exec prisma migrate status 2>&1" 2>/dev/null || \
                 echo "Unable to check migration status")

echo ""
echo "Current migration status:"
echo "$MIGRATE_STATUS"
echo ""

# ============================================
# Step 3: Attempt Schema Push
# ============================================
log_info "Step 3: Attempting schema push..."

# Try without force first
CONTAINER_NAME="${APP_NAME}-app"
PUSH_RESULT=$(ssh $VPS_HOST "docker exec $CONTAINER_NAME pnpm exec prisma db push 2>&1" 2>/dev/null || \
              ssh $VPS_HOST "docker exec ${APP_NAME} pnpm exec prisma db push 2>&1" 2>/dev/null || \
              echo "error")

if echo "$PUSH_RESULT" | grep -qi "data loss"; then
    echo ""
    log_error "⚠️  SCHEMA CHANGE WOULD CAUSE DATA LOSS"
    echo ""
    echo "$PUSH_RESULT"
    echo ""
    
    if [[ "$ALLOW_LOSS" == "true" ]]; then
        log_warning "You specified --allow-loss"
        echo ""
        echo "This operation will DELETE data from the database."
        echo "A backup has been created: $BACKUP_FILE"
        echo ""
        read -p "Type 'Yes, accept data loss' to confirm: " CONFIRM
        
        if [[ "$CONFIRM" == "Yes, accept data loss" ]]; then
            log_warning "Proceeding with data loss..."
            
            ssh $VPS_HOST << ENDSSH
docker exec $CONTAINER_NAME pnpm exec prisma db push --accept-data-loss 2>/dev/null || \
docker exec ${APP_NAME} pnpm exec prisma db push --accept-data-loss
ENDSSH
            
            log_success "Schema updated (with data loss)"
        else
            log_info "Operation cancelled"
            exit 0
        fi
    else
        echo ""
        echo "────────────────────────────────────────────────────────────────"
        echo ""
        echo "Options:"
        echo ""
        echo "  1. Modify schema to be additive (recommended)"
        echo "     - Add new columns instead of renaming"
        echo "     - Mark old columns as deprecated"
        echo "     - Migrate data manually"
        echo ""
        echo "  2. Run with --allow-loss (destructive)"
        echo "     ./deploy/safe-schema-update.sh --allow-loss"
        echo ""
        echo "  3. Restore from backup if needed:"
        echo "     ./deploy/backup-database.sh --restore $BACKUP_FILE"
        echo ""
        log_info "Schema update cancelled (data loss protection)"
        exit 1
    fi
else
    # No data loss - schema pushed successfully
    echo "$PUSH_RESULT"
    log_success "Schema updated successfully (no data loss)"
fi

# ============================================
# Step 4: Verify Schema
# ============================================
log_info "Step 4: Verifying schema..."

ssh $VPS_HOST << ENDSSH
docker exec $CONTAINER_NAME pnpm exec prisma migrate status 2>/dev/null || \
docker exec ${APP_NAME} pnpm exec prisma migrate status || true
ENDSSH

# ============================================
# Summary
# ============================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║    ✅ Schema Update Complete                                   ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Application: $APP_NAME"
echo "💾 Backup: $VPS_PATH/backups/$BACKUP_FILE"
echo ""
echo "📋 If you need to rollback schema:"
echo "   ./deploy/backup-database.sh --restore $BACKUP_FILE"
echo ""
log_success "Schema update complete!"
