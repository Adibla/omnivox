# scripts/setup.ps1 — Windows equivalent of setup.sh.
# Idempotent: safe to re-run. Copies env files only if missing, brings up the
# docker-compose stack, waits for healthchecks, and runs the migration.

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

function Step($msg) { Write-Host "`n▶ $msg" -ForegroundColor Blue }
function Ok($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# --- preflight ---------------------------------------------------------------

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail "docker is required (https://docs.docker.com/get-docker/)"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "node is required (see .nvmrc)"
}

# --- env files ---------------------------------------------------------------

Step "Preparing env files"

if (-not (Test-Path "apps/web/.env.local")) {
  if (Test-Path "apps/web/.env.example") {
    Copy-Item "apps/web/.env.example" "apps/web/.env.local"
    Ok "created apps/web/.env.local from .env.example"
  } else {
    Warn "apps/web/.env.example not found; skipping env copy"
  }
} else {
  Ok "apps/web/.env.local already present"
}

if (-not (Test-Path "apps/worker/.env.local")) {
  if (Test-Path "apps/worker/.env.example") {
    Copy-Item "apps/worker/.env.example" "apps/worker/.env.local"
    Ok "created apps/worker/.env.local from .env.example"
  } else {
    Warn "apps/worker/.env.example not found; skipping env copy"
  }
} else {
  Ok "apps/worker/.env.local already present"
}

# --- dependencies ------------------------------------------------------------

Step "Installing npm dependencies"
npm install

# --- docker stack ------------------------------------------------------------

Step "Starting docker-compose stack"
docker compose up -d

# --- healthchecks ------------------------------------------------------------

Step "Waiting for service healthchecks"

function Wait-Healthy($service, $maxAttempts = 60) {
  $container = docker compose ps -q $service 2>$null
  if (-not $container) {
    Warn "no running container for service $service; relying on compose ordering"
    return
  }
  for ($i = 1; $i -le $maxAttempts; $i++) {
    $status = docker inspect --format='{{.State.Health.Status}}' $container 2>$null
    if ($status -eq "healthy") { Ok "$service is healthy"; return }
    if ($status -eq "unhealthy") { Fail "$service is unhealthy" }
    Start-Sleep -Seconds 1
  }
  Fail "$service did not become healthy within ${maxAttempts}s"
}

foreach ($svc in @("postgres", "redis", "minio")) {
  Wait-Healthy $svc
}

# --- database migration ------------------------------------------------------

Step "Running database migration"
npm run db:migrate

Write-Host "`n✓ setup complete" -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "  - npm run dev          # start the web app (http://localhost:3000)"
Write-Host "  - npm run dev:worker   # start the pipeline worker"
