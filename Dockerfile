# ZZA Platform Dockerfile
# Multi-stage build for production deployment
#
# Build: docker build -t appname:latest .
# Run: docker run -p 3000:3000 --env-file .env appname:latest

# ============================================
# Stage 1: Builder (deps + build)
# ============================================
FROM node:20-slim AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Copy source code (before install so prisma postinstall works)
COPY . .

# Install ALL dependencies (including dev)
# Skip only husky prepare script, allow other scripts like prisma
ENV HUSKY=0
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

# Generate Prisma client using project's version
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
RUN pnpm exec prisma generate

# Build the application
RUN pnpm build

# ============================================
# Stage 2: Production Runner
# ============================================
FROM node:20-slim AS runner

# Install required packages for Prisma and health checks
RUN apt-get update -y && \
    apt-get install -y openssl curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 remix

# Copy package files and node_modules from builder (includes generated Prisma client)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Copy built application and other files from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Create uploads directory with proper permissions
RUN mkdir -p /app/uploads && chown remix:nodejs /app/uploads

# Switch to non-root user
USER remix

# Expose the application port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/healthz || exit 1

# Start the application
CMD ["pnpm", "start"]
