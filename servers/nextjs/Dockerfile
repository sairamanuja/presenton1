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

RUN npm run build

# ============================================
# Stage 3: Production runner (minimal)
# ============================================
FROM node:20-alpine AS runner

# Install only chromium for Puppeteer (PDF export, PPTX model, template routes)
RUN apk add --no-cache chromium \
    && rm -rf /var/cache/apk/*

WORKDIR /app

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV APP_DATA_DIRECTORY=/app_data
ENV USER_CONFIG_PATH=/app_data/userConfig.json
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Copy standalone server (includes only the Node.js files needed at runtime)
COPY --from=builder /app/.next-build/standalone ./

# Copy static assets and public files (not included in standalone)
COPY --from=builder /app/.next-build/static ./.next-build/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
