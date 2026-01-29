# Database Migration Discipline

## Core Principles

### 1. Migrations Must Be Backward Compatible

Every migration must work with **both** the old and new application code running simultaneously.

This enables:
- Zero-downtime deployments
- Safe rollbacks
- Blue-green deployments

### 2. Expand and Contract Pattern

**Never** make breaking changes in a single migration. Instead:

#### Phase 1: Expand
- Add new columns (nullable or with defaults)
- Add new tables
- Add new indexes

#### Phase 2: Migrate Data
- Backfill data to new columns
- Run in batches to avoid locking

#### Phase 3: Switch Code
- Deploy new code that uses new schema
- Keep writing to old columns too

#### Phase 4: Contract (separate PR)
- Remove old columns
- Remove old code paths
- Only after old code is fully retired

## Examples

### Adding a Required Column

❌ **Wrong (Breaking)**
```prisma
model User {
  id    String @id
  email String @unique
  phone String // New required field - breaks existing inserts!
}
```

✅ **Right (Expand/Contract)**

**Step 1: Add nullable column**
```prisma
model User {
  id    String  @id
  email String  @unique
  phone String? // Nullable first
}
```

**Step 2: Backfill and update code**
```typescript
// Backfill existing users
await db.user.updateMany({
  where: { phone: null },
  data: { phone: "UNKNOWN" },
});

// Update code to always set phone
```

**Step 3: Make required (after all code updated)**
```prisma
model User {
  id    String @id
  email String @unique
  phone String @default("UNKNOWN") // Now required with default
}
```

### Renaming a Column

❌ **Wrong**
```prisma
// Direct rename breaks existing queries
model User {
  fullName String // Was: name
}
```

✅ **Right**

**Step 1: Add new column**
```prisma
model User {
  name     String? // Old, nullable now
  fullName String? // New
}
```

**Step 2: Backfill and update writes**
```typescript
// Backfill
await db.$executeRaw`UPDATE users SET full_name = name WHERE full_name IS NULL`;

// Update code to write to both
await db.user.update({
  data: { name: value, fullName: value },
});
```

**Step 3: Update reads to use new column**

**Step 4: Drop old column (separate migration)**
```prisma
model User {
  fullName String // Only new column
}
```

### Adding an Index

Safe to do directly (non-blocking in most cases):
```prisma
model Order {
  id        String   @id
  userId    String
  createdAt DateTime

  @@index([userId, createdAt])
}
```

For large tables, consider `CREATE INDEX CONCURRENTLY` in raw SQL.

## Migration Checklist

Before creating a migration:

- [ ] Can the current code run with the new schema?
- [ ] Can the new code run with the old schema?
- [ ] Are new columns nullable or have defaults?
- [ ] Are there any foreign key additions?
- [ ] Is there a data backfill needed?
- [ ] Have you tested rollback?

## Running Migrations

### Development

```bash
pnpm db:push  # Quick schema sync
```

### Production

```bash
# Always run in separate step before deploying code
docker compose -f deploy/docker-compose.yml run --rm migrate
```

The migrate service:
- Uses the same image as app
- Runs `pnpm db:migrate:deploy`
- Exits after migration completes

### Migration Status

```bash
# Check pending migrations
docker compose exec app npx prisma migrate status

# View migration history
docker compose exec postgres psql -U ${DB_USER} -d ${DB_NAME} \
  -c "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 10"
```

## Rollback Procedures

### Schema-Only Rollback

If migration hasn't deployed to prod yet:
```bash
# Revert to previous migration
npx prisma migrate resolve --rolled-back <migration_name>
```

### Data + Schema Rollback

Restore from backup:
```bash
# See backups.md for full procedure
./scripts/restore/postgres-restore.sh /path/to/backup.sql.gz -c
```

## Dangerous Operations

⚠️ These require extra care:

| Operation | Risk | Mitigation |
|-----------|------|------------|
| DROP TABLE | Data loss | Backup first, soft-delete pattern |
| DROP COLUMN | Data loss | Verify no code uses it |
| NOT NULL on existing | Blocks if nulls exist | Backfill first |
| Rename column | Breaks queries | Expand/contract |
| Change column type | May fail | Add new column instead |
| Add foreign key | Validation may fail | Clean data first |

## Schema Change Request Template

```markdown
## Migration Request

**Change**: [Description]

**Reason**: [Why needed]

**Backward Compatible**: Yes / No (if no, explain rollout plan)

**Tables Affected**:
- 

**Estimated Rows Affected**: 

**Data Backfill Required**: Yes / No

**Rollback Plan**:

**Testing Done**:
- [ ] Tested with current code
- [ ] Tested with new code
- [ ] Tested rollback
```
