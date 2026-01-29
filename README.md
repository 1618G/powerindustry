# Power Industry

A production-ready platform built with ZZA Build V6.0 Enterprise template.

**Built with**: Remix, React, TypeScript, Tailwind CSS, Prisma, PostgreSQL  
**Port**: 1212

## Features

### Core Stack
- **Remix** - Full-stack web framework with SSR
- **React 18** - UI library with hooks
- **TypeScript** - Type-safe JavaScript
- **Vite** - Lightning-fast dev server and build tool
- **Tailwind CSS** - Utility-first CSS framework
- **Prisma** - Type-safe database ORM
- **PostgreSQL** - Production-ready database

### Authentication
- **Session-based auth** - Secure cookie sessions
- **OAuth providers** - Google, GitHub, Microsoft
- **Magic links** - Passwordless email authentication
- **Password reset** - Secure token-based reset flow
- **Role-based access** - User, Admin, Super Admin roles

### File Management
- **Multi-format uploads** - Images, videos, documents
- **WebP optimization** - Automatic image optimization
- **Thumbnail generation** - Auto-generated image thumbnails
- **Size validation** - Configurable file size limits
- **MIME type validation** - Security-first file handling

### Email System
- **SendGrid integration** - Production-ready transactional email
- **Gmail support** - Via Google OAuth
- **SMTP fallback** - For development/custom servers
- **Email queue** - Background processing with retries
- **Templates** - Welcome, password reset, magic link

### Security
- **Rate limiting** - Configurable per-endpoint limits
- **Input validation** - Zod schemas on all inputs
- **CSRF protection** - Built into Remix
- **Security headers** - Via Traefik middleware
- **Audit logging** - Track admin actions

### Admin Dashboard
- **User management** - CRUD operations for users
- **System health** - Real-time status monitoring
- **Metrics** - Memory, CPU, uptime tracking
- **Audit logs** - Full activity history
- **Quick actions** - Common admin tasks

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm
- Docker (for PostgreSQL)

### Setup

```bash
# Clone/copy this template
cp -r starter-template my-project
cd my-project

# Install dependencies
pnpm install

# Start PostgreSQL
docker compose up -d postgres

# Configure environment
cp .env.example .env
# Edit .env with your values

# Setup database
pnpm prisma migrate dev --name init

# Start development server
pnpm dev
```

Open http://localhost:1212

### Create Admin User

```bash
pnpm db:seed
```

Default admin: `admin@example.com` / `Admin123!`

## Configuration

### Environment Variables

See `.env.example` for all available options. Key settings:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Cookie encryption key (32+ chars) |
| `EMAIL_PROVIDER` | `sendgrid`, `gmail`, or `smtp` |
| `GOOGLE_CLIENT_ID` | For Google OAuth |
| `GITHUB_CLIENT_ID` | For GitHub OAuth |
| `STORAGE_TYPE` | `local`, `s3`, or `gcs` |

### Rate Limits

| Endpoint Type | Default Limit | Window |
|--------------|---------------|--------|
| Auth | 5 requests | 15 min |
| API | 100 requests | 15 min |
| Upload | 10 requests | 1 hour |

## Project Structure

```
├── app/
│   ├── components/     # Shared UI components
│   ├── lib/            # Utilities (prisma, etc.)
│   ├── routes/         # Remix routes
│   ├── services/       # Business logic
│   │   ├── admin-users.server.ts
│   │   ├── email.server.ts
│   │   ├── file-upload.server.ts
│   │   ├── magic-link.server.ts
│   │   ├── oauth.server.ts
│   │   ├── rate-limit.server.ts
│   │   └── system-health.server.ts
│   ├── styles/         # CSS files
│   └── utils/          # Helper functions
├── prisma/
│   └── schema.prisma   # Database schema
├── public/             # Static assets
├── uploads/            # Uploaded files
└── deploy/             # Deployment configs
```

## Routes

### Public
- `/` - Home page
- `/about` - About page
- `/contact` - Contact form
- `/login` - Email/password login
- `/register` - User registration
- `/auth/magic` - Magic link login
- `/auth/oauth` - Social login options
- `/auth/google` - Google OAuth
- `/auth/github` - GitHub OAuth

### Protected
- `/dashboard` - User dashboard
- `/logout` - Sign out

### Admin
- `/admin` - Admin dashboard
- `/admin/users` - User management
- `/admin/health` - System health
- `/admin/messages` - Contact messages

### API
- `/api/healthz` - Health check endpoint
- `/api/upload` - File upload endpoint

## Deployment

This template uses **ZZA VPS V6.0 Safety-First** deployment methodology.

### First-Time Setup

```bash
# 1. Set up SSH keys (one-time)
./deploy/setup-ssh.sh

# 2. Clone repo on VPS
ssh zza-vps "cd ~/apps && git clone git@github.com:YOUR_ORG/YOUR_REPO.git appname"

# 3. Create .env on VPS
ssh zza-vps "cd ~/apps/appname/deploy && nano .env"
# Copy from deploy/env.production.example, fill in production values

# 4. First deployment
APP_NAME=appname ./deploy/deploy-v6.sh
```

### Regular Deployment

```bash
# Make changes, commit, and deploy
git add . && git commit -m "feature: add new feature"
APP_NAME=appname ./deploy/deploy-v6.sh

# Deploy specific version
APP_NAME=appname ./deploy/deploy-v6.sh --tag v1.0.0
```

### Deployment Scripts

| Script | Purpose |
|--------|---------|
| `deploy/setup-ssh.sh` | One-time SSH key setup |
| `deploy/deploy-v6.sh` | Deploy with safety features |
| `deploy/rollback-v6.sh` | Rollback to previous version |
| `deploy/backup-database.sh` | Database backup/restore |
| `deploy/safe-schema-update.sh` | Safe schema updates |

### Database Operations

```bash
# Create backup
APP_NAME=appname ./deploy/backup-database.sh

# Download backup locally
APP_NAME=appname ./deploy/backup-database.sh --download

# List backups
APP_NAME=appname ./deploy/backup-database.sh --list

# Restore (DESTRUCTIVE - requires typed confirmation)
APP_NAME=appname ./deploy/backup-database.sh --restore filename.sql.gz
```

### Rollback

```bash
# Rollback to tag
APP_NAME=appname ./deploy/rollback-v6.sh v1.0.0

# Rollback to previous commit
APP_NAME=appname ./deploy/rollback-v6.sh HEAD~1
```

### V6.0 Safety Features

- **Automatic backups** - Database backup before every deployment
- **SSH key authentication** - No passwords in scripts
- **Additive schema policy** - ADD new data, don't delete
- **Typed confirmations** - Destructive operations require explicit approval

See [ZZA VPS Deployment Skill](../../.cursor/skills/zza-vps-deployment/SKILL.md) for detailed documentation.

## Development

### Commands

```bash
pnpm dev           # Start dev server
pnpm build         # Build for production
pnpm start         # Start production server
pnpm typecheck     # Run TypeScript checks
pnpm lint          # Run ESLint
pnpm lint:fix      # Fix linting issues
pnpm test          # Run tests
pnpm db:studio     # Open Prisma Studio
pnpm db:push       # Push schema to DB
pnpm db:migrate    # Run migrations
```

### Adding a New Service

1. Create `app/services/my-service.server.ts`
2. Export from `app/services/index.ts`
3. Import in routes as needed

### Adding OAuth Provider

1. Get credentials from provider
2. Add to `.env`
3. Create `app/routes/auth.PROVIDER.tsx`
4. Create `app/routes/auth.PROVIDER.callback.tsx`

## Security Checklist

- [ ] Generate unique `SESSION_SECRET`
- [ ] Configure rate limiting
- [ ] Set up OAuth providers
- [ ] Enable email verification
- [ ] Configure Traefik security headers
- [ ] Run security scan before deployment

## License

MIT

---

**Part of the ZZA Platform Ecosystem**

- [ZZA_Build](./) - This template
- [ZZA_VPS](../../zza_vps/) - Deployment infrastructure
- [ZZA_Legal](../../ZZA_Legal/) - Legal compliance
- [ZZA_Marketing](../../ZZA_Marketing/) - Launch planning

