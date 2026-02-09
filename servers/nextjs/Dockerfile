# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ============================================
# Stage 2: Build the application
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Provide backend URL at build time for Next.js rewrites
ARG INTERNAL_API_URL=http://localhost:8000
ENV INTERNAL_API_URL=${INTERNAL_API_URL}

# Build Next.js app (outputs to .next-build/standalone)
RUN npm run build

# ============================================
# Stage 3: Production runner (minimal)
# ============================================
FROM node:20-alpine AS runner

# Install Chromium for Puppeteer (used by PDF export, PPTX models, template routes)
RUN apk add --no-cache chromium \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Environment variables
ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    APP_DATA_DIRECTORY=/app_data \
    USER_CONFIG_PATH=/app_data/userConfig.json \
    HOSTNAME=0.0.0.0

# Preserve backend URL for any runtime usage
ARG INTERNAL_API_URL=http://localhost:8000
ENV INTERNAL_API_URL=${INTERNAL_API_URL}

# Copy standalone server (includes all Node.js files needed at runtime)
COPY --from=builder /app/.next-build/standalone ./

# Copy static assets and public files (not included in standalone)
COPY --from=builder /app/.next-build/static ./.next-build/static
COPY --from=builder /app/public ./public

# Copy presentation templates (required by /api/templates route)
COPY --from=builder /app/presentation-templates ./presentation-templates

# Cloud Run expects PORT env var (default 8080), but Next.js uses 3000 by default
ENV PORT=3000
EXPOSE 3000

# Use dynamic PORT from environment
CMD ["sh", "-c", "PORT=${PORT} node server.js"]
