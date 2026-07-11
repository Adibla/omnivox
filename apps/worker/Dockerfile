# Build context must be the repository root:
#   docker build -f apps/worker/Dockerfile .
#
# The worker runs from TypeScript sources via tsx: the shared workspace
# packages ship TS entry points, so there is no emitted-JS path to run.

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/security/package.json packages/security/
COPY packages/wasm-audio/package.json packages/wasm-audio/
RUN npm ci --omit=dev --workspace apps/worker

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/security/ packages/security/
COPY packages/wasm-audio/ packages/wasm-audio/
COPY apps/worker/ apps/worker/
COPY db/migrations/ db/migrations/
COPY scripts/migrate.mjs scripts/migrate.mjs

USER node
WORKDIR /app/apps/worker
EXPOSE 4010
CMD ["npm", "start"]
