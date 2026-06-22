# ──────────────────────────────────────────────────────────────────────────────
# frontend/Dockerfile  — production build for the Next.js app
#
# Multi-stage: install deps → build → run a slim standalone server.
# Requires `output: 'standalone'` in next.config.js (see the provided config).
#
# On Render, set the service's Root Directory to `frontend` and (if using Docker)
# Dockerfile Path to `./Dockerfile`. Or deploy without Docker using:
#   Build:  npm install && npm run build
#   Start:  npm start
# ──────────────────────────────────────────────────────────────────────────────

# 1. Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Use `npm ci` when a lockfile is present (reproducible, faster); fall back to
# `npm install` if there isn't one yet. Either path works for the build below.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 2. Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars must be present at BUILD time to be inlined into the bundle.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3. Runtime — minimal image serving the standalone output
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as a non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone server + static assets + public files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
