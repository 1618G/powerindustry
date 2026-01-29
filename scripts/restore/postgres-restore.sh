#!/bin/bash
# ZZA Build - PostgreSQL Restore Script
# Usage: ./scripts/restore/postgres-restore.sh <backup_file> [options]
#
# Options:
#   -c, --compose       Use docker compose exec instead of direct connection
#   -f, --force         Skip confirmation prompt
#   --dry-run           Show what would be done without doing it

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Defaults
USE_COMPOSE=false
FORCE=false
DRY_RUN=false

# Parse arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup_file> [options]"
    echo ""
    echo "Options:"
    echo "  -c, --compose       Use docker compose exec"
    echo "  -f, --force         Skip confirmation"
    echo "  --dry-run           Show what would be done"
    exit 1
fi

BACKUP_FILE="$1"
shift

while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--compose)
            USE_COMPOSE=true
            shift
            ;;
        -f|--force)
            FORCE=true
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

# Validate backup file
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}ERROR: Backup file not found: ${BACKUP_FILE}${NC}"
    exit 1
fi

# Extract info from filename
FILENAME=$(basename "$BACKUP_FILE")
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}           PostgreSQL Restore                         ${NC}"
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Backup File: ${FILENAME}"
echo "  File Size:   $(du -h "$BACKUP_FILE" | cut -f1)"
echo "  Database:    ${DB_NAME:-app}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN - No changes will be made${NC}"
    echo ""
fi

# Confirmation
if [ "$FORCE" = false ] && [ "$DRY_RUN" = false ]; then
    echo -e "${RED}⚠️  WARNING: This will OVERWRITE the current database!${NC}"
    echo ""
    read -p "Type 'RESTORE' to confirm: " CONFIRM
    
    if [ "$CONFIRM" != "RESTORE" ]; then
        echo "Restore cancelled."
        exit 0
    fi
    echo ""
fi

# Perform restore
echo -e "${GREEN}[1/2]${NC} Restoring database..."

if [ "$DRY_RUN" = false ]; then
    if [ "$USE_COMPOSE" = true ]; then
        # Drop and recreate database
        echo "  Dropping existing database..."
        docker compose exec -T postgres dropdb -U "${DB_USER:-app}" --if-exists "${DB_NAME:-app}"
        docker compose exec -T postgres createdb -U "${DB_USER:-app}" "${DB_NAME:-app}"
        
        # Restore
        echo "  Restoring from backup..."
        gunzip -c "$BACKUP_FILE" | docker compose exec -T postgres psql -U "${DB_USER:-app}" "${DB_NAME:-app}"
    else
        # Direct connection
        if [ -z "${DATABASE_URL:-}" ]; then
            echo -e "${RED}ERROR: DATABASE_URL not set and --compose not specified${NC}"
            exit 1
        fi
        
        # Extract connection details from DATABASE_URL
        # Format: postgresql://user:pass@host:port/dbname
        DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:]+):.*|\1|')
        DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
        DB_NAME_PARSED=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+).*|\1|')
        DB_USER_PARSED=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
        
        echo "  Restoring from backup..."
        gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
    fi
    
    echo -e "  ${GREEN}✓ Database restored successfully${NC}"
else
    echo "  Would restore database from: ${BACKUP_FILE}"
fi

# Post-restore steps
echo -e "${GREEN}[2/2]${NC} Post-restore steps..."
echo "  - Run 'pnpm db:generate' to regenerate Prisma client"
echo "  - Verify application connectivity"
echo "  - Check data integrity"

echo ""
echo -e "${GREEN}✓ Restore complete${NC}"
echo ""
echo "Next steps:"
echo "  1. Verify the application works correctly"
echo "  2. Check audit logs for any issues"
echo "  3. Notify team of restore completion"
