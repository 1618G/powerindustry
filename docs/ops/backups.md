# Backup & Recovery Runbook

## Backup Strategy

- **Frequency**: Daily at 2 AM (cron)
- **Retention**: 30 days (configurable)
- **Location**: `/var/backups/zza/${APP_NAME}/`
- **Format**: Gzipped SQL dump with timestamp and version

## Backup Scripts

### Manual Backup

```bash
# Using docker compose
./scripts/backup/postgres-backup.sh -c

# Direct connection (requires DATABASE_URL)
DATABASE_URL=postgresql://... ./scripts/backup/postgres-backup.sh
```

### Automated Backups (Cron)

Add to crontab:

```cron
# Daily backup at 2 AM
0 2 * * * cd /path/to/app && APP_NAME=myapp APP_VERSION=$(cat version) ./scripts/backup/postgres-backup.sh -c >> /var/log/backup.log 2>&1

# Weekly full backup to off-site (example)
0 3 * * 0 rsync -avz /var/backups/zza/ backup-server:/backups/zza/
```

### Backup Directory Structure

```
/var/backups/zza/
└── myapp/
    ├── backup_20260123_020000_v1.0.0.sql.gz
    ├── backup_20260122_020000_v1.0.0.sql.gz
    └── ...
```

## Recovery Procedures

### Restore from Backup

```bash
# 1. List available backups
ls -la /var/backups/zza/${APP_NAME}/

# 2. Stop the application
docker compose -f deploy/docker-compose.yml stop app worker

# 3. Restore (will prompt for confirmation)
./scripts/restore/postgres-restore.sh \
  /var/backups/zza/${APP_NAME}/backup_TIMESTAMP.sql.gz \
  -c

# 4. Regenerate Prisma client (if schema changed)
docker compose -f deploy/docker-compose.yml exec app pnpm db:generate

# 5. Restart application
docker compose -f deploy/docker-compose.yml up -d app worker
```

### Point-in-Time Recovery

For more granular recovery, enable PostgreSQL WAL archiving:

```yaml
# Add to postgres service in docker-compose.yml
environment:
  POSTGRES_INITDB_ARGS: "--data-checksums"
command:
  - "postgres"
  - "-c"
  - "archive_mode=on"
  - "-c"
  - "archive_command=cp %p /var/lib/postgresql/wal_archive/%f"
```

## Monthly Restore Drill

**Schedule**: First Monday of each month

### Drill Procedure

1. **Create isolated test environment**
   ```bash
   docker compose -f deploy/docker-compose.yml -p restore-test up -d postgres redis
   ```

2. **Restore latest backup to test environment**
   ```bash
   # Get latest backup
   BACKUP=$(ls -t /var/backups/zza/${APP_NAME}/*.sql.gz | head -1)
   
   # Restore to test database
   gunzip -c $BACKUP | docker compose -p restore-test exec -T postgres \
     psql -U ${DB_USER} -d ${DB_NAME}
   ```

3. **Verify data integrity**
   ```bash
   # Run integrity checks
   docker compose -p restore-test exec postgres psql -U ${DB_USER} -d ${DB_NAME} \
     -c "SELECT count(*) FROM users; SELECT count(*) FROM orders;"
   ```

4. **Document results**
   - Backup file tested
   - Restore duration
   - Data verification passed
   - Any issues encountered

5. **Cleanup**
   ```bash
   docker compose -p restore-test down -v
   ```

## Backup Verification

### Check Backup Integrity

```bash
# Verify gzip integrity
gzip -t /var/backups/zza/${APP_NAME}/backup_*.sql.gz

# Check file sizes (should be non-zero)
du -h /var/backups/zza/${APP_NAME}/backup_*.sql.gz
```

### Monitor Backup Disk Usage

```bash
# Check backup directory size
du -sh /var/backups/zza/

# Check available disk space
df -h /var/backups/
```

## Disaster Recovery

### Complete VPS Loss

1. Provision new VPS
2. Install Docker + Docker Compose
3. Copy latest backup from off-site storage
4. Deploy using standard deployment procedure
5. Restore backup
6. Update DNS

### Database Corruption

1. Stop application immediately
2. Identify last known good backup
3. Follow restore procedure
4. Investigate cause before restarting

## Contacts

- **Primary DBA**: [Name] - [Contact]
- **Backup Storage**: [Provider/Location]
- **Escalation**: [Process]
