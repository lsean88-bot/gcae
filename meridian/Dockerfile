# syntax=docker/dockerfile:1
# Meridian image. Multi-arch (amd64 + arm64); no architecture-specific binaries.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL is read at import time; build does not connect to it.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

# Setup/maintenance image: full dependencies + tsx + drizzle-kit (migrate, db:harden, setup:passwords, uat).
FROM build AS tools
ENV NODE_ENV=production
RUN chown -R node:node /app
USER node
CMD ["sh", "-c", "npx drizzle-kit push --force && npm run db:harden"]

# Runtime image (default target, last stage).
FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
