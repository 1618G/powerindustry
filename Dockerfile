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

# Install ALL dependencies (including dev)
ENV HUSKY=0
RUN pnpm install --frozen-lockfile --ignore-scripts || pnpm install --no-frozen-lockfile --ignore-scripts

# Copy source code
COPY . .

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

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

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
ENV HUSKY=0
RUN pnpm install --prod --frozen-lockfile --ignore-scripts || pnpm install --prod --no-frozen-lockfile --ignore-scripts

# Copy Prisma schema and regenerate for this platform
COPY prisma ./prisma
RUN npx prisma generate

# Copy built application from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public

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
