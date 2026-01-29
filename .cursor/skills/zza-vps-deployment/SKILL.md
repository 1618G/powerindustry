# ZZA VPS Deployment Skill

Deploy ZZA platforms to production VPS using the V6.0 Safety-First methodology.

## Triggers

Use this skill when:
- User mentions "deploy", "VPS", "production", "go live"
- User asks about "SSH setup", "deployment scripts"
- User wants to "push to server", "release", "launch"
- User mentions "rollback", "backup database", "schema update"
- User asks about "Docker deployment", "Traefik setup"

## Overview

This skill guides deployment of ZZA platforms using:
- **Git-based deployment** - Push to GitHub, pull on VPS
- **SSH key authentication** - Seamless access between local → VPS → GitHub
- **Automatic backups** - Database backup before every deployment
- **Safety-first policy** - No accidental deletions, additive schema changes

## Prerequisites

Before first deployment:
1. VPS access configured (deploy user)
2. Traefik reverse proxy running on VPS
3. GitHub repository with code
4. Domain pointing to VPS

## Deployment Scripts (in `deploy/` folder)

| Script | Purpose |
|--------|---------|
| `setup-ssh.sh` | One-time SSH key setup |
| `deploy-v6.sh` | Deploy with safety features |
| `rollback-v6.sh` | Rollback to previous version |
| `backup-database.sh` | Database backup/restore |
| `safe-schema-update.sh` | Schema changes (additive) |

## Workflow

### First-Time Setup

```bash
# 1. Set up SSH keys (one-time)
./deploy/setup-ssh.sh

# 2. Clone repo on VPS
ssh zza-vps "cd ~/apps && git clone git@github.com:org/repo.git appname"

# 3. Create .env on VPS
ssh zza-vps "cd ~/apps/appname/deploy && nano .env"
# Copy from env.production.example, fill in secrets

# 4. First deployment
APP_NAME=appname ./deploy/deploy-v6.sh
```

### Regular Deployment

```bash
# Make changes locally
git add . && git commit -m "feature: add new feature"

# Deploy (includes automatic backup)
APP_NAME=appname ./deploy/deploy-v6.sh

# Optionally deploy specific tag
APP_NAME=appname ./deploy/deploy-v6.sh --tag v1.0.0
```

### Rollback

```bash
# Rollback to tag
APP_NAME=appname ./deploy/rollback-v6.sh v1.0.0

# Rollback to previous commit
APP_NAME=appname ./deploy/rollback-v6.sh HEAD~1
```

### Database Operations

```bash
# Create backup
APP_NAME=appname ./deploy/backup-database.sh

# Download backup locally
APP_NAME=appname ./deploy/backup-database.sh --download

# List backups
APP_NAME=appname ./deploy/backup-database.sh --list

# Restore (DESTRUCTIVE - requires confirmation)
APP_NAME=appname ./deploy/backup-database.sh --restore filename.sql.gz
```

### Schema Updates

```bash
# Safe schema push (additive only)
APP_NAME=appname ./deploy/safe-schema-update.sh

# Allow data loss (requires typed confirmation)
APP_NAME=appname ./deploy/safe-schema-update.sh --allow-loss
```

## Environment Variables

The deployment scripts use these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | myapp | Application name |
| `VPS_HOST` | zza-vps | SSH alias for VPS |
| `BRANCH` | main | Git branch to deploy |
| `DOMAIN` | APP_NAME.zzagroup.cloud | Application domain |
| `DB_USER` | app | Database user |
| `DB_NAME` | APP_NAME_db | Database name |

## VPS File Structure

```
/home/deploy/apps/
├── appname/
│   ├── .git/
│   ├── deploy/
│   │   ├── docker-compose.yml
│   │   ├── .env (gitignored!)
│   │   └── traefik/
│   ├── backups/
│   │   ├── appname_20260129_120000.sql.gz
│   │   └── ...
│   ├── prisma/
│   ├── Dockerfile
│   └── ...
```

## Safety Rules (V6.0)

### NEVER Do These Without Confirmation:
- Delete database data
- Reset Prisma schema with data loss
- Remove Docker volumes
- Recreate VPS

### ALWAYS Do These:
- Backup database before schema changes
- Verify SSH connection before deploying
- Check uncommitted changes before push
- Verify HTTPS works after deployment

## Troubleshooting

### SSH Connection Failed
```bash
# Re-run setup
./deploy/setup-ssh.sh --force
```

### GitHub Access Denied from VPS
```bash
# Check deploy key on GitHub
ssh zza-vps 'ssh -T git@github.com'

# Re-add key to GitHub if needed
ssh zza-vps 'cat ~/.ssh/id_ed25519.pub'
```

### Container Won't Start
```bash
# Check logs
ssh zza-vps 'docker logs appname-app'

# Check container status
ssh zza-vps 'docker ps -a | grep appname'

# Check compose file
ssh zza-vps 'cd ~/apps/appname/deploy && docker compose config'
```

### Database Connection Failed
```bash
# Check database container
ssh zza-vps 'docker logs appname-db'

# Check DATABASE_URL in .env
ssh zza-vps 'grep DATABASE_URL ~/apps/appname/deploy/.env'
```

### SSL Certificate Not Working
```bash
# Wait 2-3 minutes for Let's Encrypt
sleep 180

# Check Traefik logs
ssh zza-vps 'docker logs traefik 2>&1 | grep appname'

# Verify domain resolves
nslookup appname.zzagroup.cloud
```

## Quick Reference

```bash
# Deploy
APP_NAME=appname ./deploy/deploy-v6.sh

# Rollback
APP_NAME=appname ./deploy/rollback-v6.sh v1.0.0

# Backup
APP_NAME=appname ./deploy/backup-database.sh

# View logs
ssh zza-vps 'docker logs -f appname-app'

# Check status
ssh zza-vps 'docker ps | grep appname'

# Enter container
ssh zza-vps 'docker exec -it appname-app sh'

# View VPS version
ssh zza-vps 'cd ~/apps/appname && git log -1 --oneline'
```

## Version History

- **V6.0** (Jan 2026): Safety-first, SSH keys, mandatory backups
- **V5.1** (Jan 2026): Tarball fallback, enhanced learnings
- **V5.0** (Jan 2025): Git-based deployment

---

**Philosophy**: Never delete without asking, always backup first.
