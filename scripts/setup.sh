#!/usr/bin/env bash
# scripts/setup.sh — one-shot local environment bootstrap.
# Idempotent: safe to re-run. Copies env files only if missing, then brings up
# the docker-compose stack, waits for healthchecks, and runs the database
# migration.

set -euo pipefail

# Resolve repo root regardless of where the script is invoked from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

step() {
  printf '\n\033[1;34m▶ %s\033[0m\n' "$1"
}

ok() {
  printf '\033[1;32m✓ %s\033[0m\n' "$1"
}

warn() {
  printf '\033[1;33m⚠ %s\033[0m\n' "$1"
}

fail() {
  printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2
  exit 1
}

# --- preflight ---------------------------------------------------------------

command -v docker >/dev/null 2>&1 || fail "docker is required (https://docs.docker.com/get-docker/)"
command -v node >/dev/null 2>&1 || fail "node is required (see .nvmrc; install via nvm if needed)"

# --- env files ---------------------------------------------------------------

step "Preparing env files"

if [ ! -f apps/web/.env.local ]; then
  if [ -f apps/web/.env.example ]; then
    cp apps/web/.env.example apps/web/.env.local
    ok "created apps/web/.env.local from .env.example"
  else
    warn "apps/web/.env.example not found; skipping env copy"
  fi
else
  ok "apps/web/.env.local already present"
fi

if [ ! -f apps/worker/.env.local ]; then
  if [ -f apps/worker/.env.example ]; then
    cp apps/worker/.env.example apps/worker/.env.local
    ok "created apps/worker/.env.local from .env.example"
  else
    warn "apps/worker/.env.example not found; skipping env copy"
  fi
else
  ok "apps/worker/.env.local already present"
fi

# --- dependencies ------------------------------------------------------------

step "Installing npm dependencies"
npm install

# --- docker stack ------------------------------------------------------------

step "Starting docker-compose stack (postgres, redis, minio, keycloak)"

if docker compose version >/dev/null 2>&1; then
  docker compose up -d
else
  fail "docker compose plugin is required (Docker Desktop or docker-compose-plugin)"
fi

# --- healthchecks ------------------------------------------------------------

step "Waiting for service healthchecks"

wait_for_healthy() {
  local service="$1"
  local max_attempts="${2:-60}"
  local attempt=1
  local container
  container=$(docker compose ps -q "$service" 2>/dev/null)
  if [ -z "$container" ]; then
    warn "no running container for service $service; relying on docker compose startup ordering"
    return 0
  fi
  while [ "$attempt" -le "$max_attempts" ]; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")
    case "$status" in
      healthy)
        ok "$service is healthy"
        return 0
        ;;
      unhealthy)
        fail "$service is unhealthy; check 'docker compose logs $service'"
        ;;
    esac
    sleep 1
    attempt=$((attempt + 1))
  done
  fail "$service did not become healthy within ${max_attempts}s"
}

for svc in postgres redis minio; do
  wait_for_healthy "$svc"
done

# --- database migration ------------------------------------------------------

step "Running database migration"
npm run db:migrate

# --- done --------------------------------------------------------------------

printf '\n\033[1;32m✓ setup complete\033[0m\n'
printf 'Next steps:\n'
printf '  - npm run dev          # start the web app (http://localhost:3000)\n'
printf '  - npm run dev:worker   # start the pipeline worker\n'
