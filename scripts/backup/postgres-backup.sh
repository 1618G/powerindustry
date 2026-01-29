#!/bin/bash
# ZZA Build - PostgreSQL Backup Script
# Usage: ./scripts/backup/postgres-backup.sh [options]
#
# Options:
#   -d, --dir DIR       Backup directory (default: /var/backups/zza/${APP_NAME})
#   -r, --retention N   Days to keep backups (default: 30)
#   -c, --compose       Use docker compose exec instead of direct connection
#   --dry-run           Show what would be done without doing it

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Defaults
BACKUP_DIR="${BACKUP_DIR:-/var/backups/zza/${APP_NAME:-app}}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
USE_COMPOSE=false
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        -r|--retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        -c|--compose)
            USE_COMPOSE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
APP_VERSION="${APP_VERSION:-unknown}"
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}_v${APP_VERSION}.sql.gz"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}           PostgreSQL Backup                          ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  App Name:    ${APP_NAME:-app}"
echo "  App Version: ${APP_VERSION}"
echo "  Backup Dir:  ${BACKUP_DIR}"
echo "  Retention:   ${RETENTION_DAYS} days"
echo "  Output:      ${BACKUP_FILE}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN - No changes will be made${NC}"
    echo ""
fi

# Create backup directory
if [ "$DRY_RUN" = false ]; then
    mkdir -p "$BACKUP_DIR"
fi

# Perform backup
echo -e "${GREEN}[1/3]${NC} Creating backup..."

if [ "$DRY_RUN" = false ]; then
    if [ "$USE_COMPOSE" = true ]; then
        # Use docker compose exec
        docker compose exec -T postgres pg_dump -U "${DB_USER:-app}" "${DB_NAME:-app}" | gzip > "$BACKUP_FILE"
    else
        # Direct connection via DATABASE_URL
        if [ -z "${DATABASE_URL:-}" ]; then
            echo -e "${RED}ERROR: DATABASE_URL not set and --compose not specified${NC}"
            exit 1
        fi
        pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
    fi
    
    # Verify backup
    if [ ! -f "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
        echo -e "${RED}ERROR: Backup file is empty or missing${NC}"
        exit 1
    fi
    
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "  Created: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
    echo "  Would create: ${BACKUP_FILE}"
fi

# Clean old backups
echo -e "${GREEN}[2/3]${NC} Cleaning old backups (older than ${RETENTION_DAYS} days)..."

if [ "$DRY_RUN" = false ]; then
    DELETED=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
    echo "  Deleted ${DELETED} old backup(s)"
else
    OLD_COUNT=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +${RETENTION_DAYS} 2>/dev/null | wc -l || echo "0")
    echo "  Would delete ${OLD_COUNT} old backup(s)"
fi

# Summary
echo -e "${GREEN}[3/3]${NC} Backup summary..."

if [ "$DRY_RUN" = false ]; then
    TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" | wc -l)
    TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
    echo "  Total backups: ${TOTAL_BACKUPS}"
    echo "  Total size: ${TOTAL_SIZE}"
fi

echo ""
echo -e "${GREEN}✓ Backup complete${NC}"
echo ""

# Cron example
echo "To schedule daily backups, add to crontab:"
echo "  0 2 * * * /path/to/scripts/backup/postgres-backup.sh -c >> /var/log/backup.log 2>&1"
