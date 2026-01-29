#!/bin/bash
# backup-database.sh
# ZZA VPS V6.0 - Database Backup Script
#
# Usage:
#   ./deploy/backup-database.sh                    # Backup to VPS
#   ./deploy/backup-database.sh --download         # Backup and download locally
#   ./deploy/backup-database.sh --list             # List existing backups
#   ./deploy/backup-database.sh --restore <file>   # Restore from backup (DESTRUCTIVE!)
#
# This script creates timestamped PostgreSQL backups before any changes.

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
LOCAL_BACKUP_DIR="./backups"

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
DOWNLOAD=false
LIST_ONLY=false
RESTORE_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --download)
            DOWNLOAD=true
            shift
            ;;
        --list)
            LIST_ONLY=true
            shift
            ;;
        --restore)
            RESTORE_FILE="$2"
            shift 2
            ;;
        --help)
            echo "ZZA VPS V6.0 Database Backup Script"
            echo ""
            echo "Usage: ./deploy/backup-database.sh [options]"
            echo ""
            echo "Options:"
            echo "  --download          Backup and download to local machine"
            echo "  --list              List existing backups on VPS"
            echo "  --restore <file>    Restore from backup (DESTRUCTIVE!)"
            echo "  --help              Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  APP_NAME            Application name (default: myapp)"
            echo "  VPS_HOST            VPS SSH alias (default: zza-vps)"
            echo "  DB_USER             Database user (default: app)"
            echo "  DB_NAME             Database name (default: APP_NAME_db)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./deploy/backup-database.sh [--download] [--list] [--restore <file>]"
            exit 1
            ;;
    esac
done

# ============================================
# Header
# ============================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║    ZZA VPS V6.0 - Database Backup                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# ============================================
# List Backups
# ============================================
if [[ "$LIST_ONLY" == "true" ]]; then
    log_info "Listing backups on VPS..."
    echo ""
    ssh $VPS_HOST "ls -lh $VPS_PATH/backups/ 2>/dev/null || echo 'No backups found'"
    echo ""
    
    if [[ -d "$LOCAL_BACKUP_DIR" ]]; then
        log_info "Local backups:"
        ls -lh "$LOCAL_BACKUP_DIR/" 2>/dev/null || echo "No local backups"
    fi
    exit 0
fi

# ============================================
# Restore from Backup
# ============================================
if [[ -n "$RESTORE_FILE" ]]; then
    echo ""
    log_error "⚠️  DESTRUCTIVE OPERATION DETECTED"
    echo ""
    echo "Action: Restore database from backup"
    echo "File: $RESTORE_FILE"
    echo "Database: $DB_NAME"
    echo ""
    echo "This operation will OVERWRITE ALL DATA in the database!"
    echo ""
    log_warning "This operation CANNOT be undone."
    echo ""
    read -p "Type 'Yes, restore database' to confirm: " CONFIRM
    
    if [[ "$CONFIRM" != "Yes, restore database" ]]; then
        log_info "Restore cancelled"
        exit 0
    fi
    
    log_info "Restoring database..."
    
    # Check if file exists on VPS
    if ssh $VPS_HOST "test -f $VPS_PATH/backups/$RESTORE_FILE"; then
        log_info "Restoring from VPS backup..."
        
        ssh $VPS_HOST << ENDSSH
set -e
cd $VPS_PATH

echo "Stopping application..."
cd deploy
docker compose stop ${APP_NAME}-app 2>/dev/null || docker compose stop app 2>/dev/null || true

echo "Restoring database..."
gunzip -c $VPS_PATH/backups/$RESTORE_FILE | docker exec -i $DB_CONTAINER psql -U $DB_USER $DB_NAME

echo "Starting application..."
docker compose start ${APP_NAME}-app 2>/dev/null || docker compose start app 2>/dev/null

echo "Done!"
ENDSSH
        
        log_success "Database restored from $RESTORE_FILE"
    else
        log_error "Backup file not found: $RESTORE_FILE"
        exit 1
    fi
    exit 0
fi

# ============================================
# Create Backup
# ============================================
log_info "Application: $APP_NAME"
log_info "Database: $DB_NAME"
echo ""

# Check if database container exists
DB_EXISTS=$(ssh $VPS_HOST "docker ps --filter 'name=$DB_CONTAINER' --format '{{.Names}}'" 2>/dev/null || echo "")

if [[ -z "$DB_EXISTS" ]]; then
    log_error "Database container '$DB_CONTAINER' not found or not running"
    echo ""
    log_info "Available containers:"
    ssh $VPS_HOST "docker ps --format 'table {{.Names}}\t{{.Status}}'"
    exit 1
fi

log_success "Database container found: $DB_CONTAINER"

# Create backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${APP_NAME}_${TIMESTAMP}.sql.gz"

log_info "Creating backup: $BACKUP_FILE"

ssh $VPS_HOST << ENDSSH
set -e
mkdir -p $VPS_PATH/backups

echo "Dumping database..."
docker exec $DB_CONTAINER pg_dump -U $DB_USER $DB_NAME | gzip > $VPS_PATH/backups/$BACKUP_FILE

echo ""
echo "Backup details:"
ls -lh $VPS_PATH/backups/$BACKUP_FILE
ENDSSH

log_success "Backup created on VPS: $VPS_PATH/backups/$BACKUP_FILE"

# ============================================
# Download if requested
# ============================================
if [[ "$DOWNLOAD" == "true" ]]; then
    log_info "Downloading backup to local machine..."
    
    mkdir -p "$LOCAL_BACKUP_DIR"
    scp "$VPS_HOST:$VPS_PATH/backups/$BACKUP_FILE" "$LOCAL_BACKUP_DIR/"
    
    log_success "Downloaded to: $LOCAL_BACKUP_DIR/$BACKUP_FILE"
    ls -lh "$LOCAL_BACKUP_DIR/$BACKUP_FILE"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "────────────────────────────────────────────────────────────────"
echo ""
echo "📋 Backup Commands:"
echo "  List backups:      ./deploy/backup-database.sh --list"
echo "  Download backup:   ./deploy/backup-database.sh --download"
echo "  Restore backup:    ./deploy/backup-database.sh --restore $BACKUP_FILE"
echo ""
echo "📍 VPS Location: $VPS_PATH/backups/"
if [[ "$DOWNLOAD" == "true" ]]; then
    echo "📍 Local Location: $LOCAL_BACKUP_DIR/"
fi
echo ""
log_success "Backup complete!"
