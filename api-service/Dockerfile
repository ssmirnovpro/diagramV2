# Multi-stage API Service Dockerfile
# Stage 1: Dependencies installation
FROM node:18-alpine AS dependencies
WORKDIR /app

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Copy package files for better layer caching
COPY package*.json ./

# Install dependencies with audit fix
RUN npm ci --only=production --audit && \
    npm audit fix --only=prod || true && \
    npm cache clean --force

# Stage 2: Application build
FROM node:18-alpine AS build
WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./

# Copy source code
COPY . .

# Remove development files and unnecessary content
RUN rm -rf tests/ docs/ *.md .git* .env* .npm* && \
    find . -name "*.test.js" -delete && \
    find . -name "*.spec.js" -delete

# Stage 3: Production runtime
FROM node:18-alpine AS production
LABEL maintainer="DevOps Team" \
      version="1.0.0" \
      description="UML API Service - Production Ready" \
      security.scan="2024-01"

# Install security updates and minimal runtime packages
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl tini && \
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Create app directory with proper permissions
WORKDIR /app

# Create non-root user with specific UID/GID
RUN addgroup -g 1001 -S nodejs && \
    adduser -S apiuser -u 1001 -G nodejs -s /bin/sh

# Copy application from build stage
COPY --from=build --chown=apiuser:nodejs /app ./

# Create logs directory with proper permissions
RUN mkdir -p logs && chown -R apiuser:nodejs logs && \
    chmod 755 logs

# Security: Remove unnecessary binaries and set read-only filesystem
RUN rm -rf /usr/local/lib/node_modules/npm && \
    find /usr/local/bin -type f ! -name "node" ! -name "dumb-init" ! -name "tini" -delete 2>/dev/null || true

# Switch to non-root user
USER apiuser

# Expose port (non-privileged)
EXPOSE 9001

# Health check with enhanced timeout and validation
HEALTHCHECK --interval=30s --timeout=15s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:9001/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start application with dumb-init for proper signal handling
CMD ["dumb-init", "node", "server.js"]