# Deployment

Three ways to run OmniVox, from quickest to most manual. Kubernetes/Helm
examples are on the [roadmap](../ROADMAP.md).

## 1. Full Docker stack (no local Node.js)

Runs everything — web, worker, and the infrastructure — in containers.

```bash
cp .env.example .env    # set OPENAI_API_KEY and SESSION_SECRET
docker compose --profile app up -d --build
```

Then open `http://localhost:3000`. A one-shot `migrate` container applies the
database migrations before web and worker start.

Notes:

- The app profile runs with `AUTH_MODE=disabled` (single default tenant). See
  [Keycloak mode](#keycloak-mode) below for real logins.
- `S3_PUBLIC_ENDPOINT` is preset to `http://localhost:9000`: presigned
  upload/read URLs are opened by the browser, so they must be signed against a
  host the browser can reach, while the containers talk to MinIO internally at
  `http://minio:9000`. If you serve the app from another machine, set it to the
  URL under which that machine reaches MinIO.
- Rebuild after pulling changes: `docker compose --profile app up -d --build`.

## 2. Development mode

Infrastructure in containers, app processes on your machine with hot reload.
This is the flow described in the [README](../README.md#local-setup):

```bash
npm run setup        # or the manual steps in the README
npm run dev          # web
npm run dev:worker   # worker, in a second terminal
```

## 3. Manual server deployment

For a single server without Docker for the app processes:

```bash
npm ci
npm run build && npm run build:worker
NODE_ENV=production npm run start -w apps/web
NODE_ENV=production npm run start -w apps/worker   # second process
```

Requirements and hardening for any real deployment:

- **Set `NODE_ENV=production`** — the weak default `SESSION_SECRET` is only
  rejected in production mode.
- **Set a strong `SESSION_SECRET`** (e.g. `openssl rand -hex 32`).
- **Terminate TLS in front of the app** with a reverse proxy (nginx, Caddy,
  Traefik). The session cookie is marked `secure` in production, so plain HTTP
  logins will not work.
- Point `DATABASE_URL`, `REDIS_URL`, and the `S3_*` variables at your managed
  services. If the server reaches storage over an internal network, set
  `S3_PUBLIC_ENDPOINT` to the browser-facing storage URL.
- The rate limiter is in-memory (per instance); put a shared limiter or an API
  gateway in front if you run multiple web replicas.

## Keycloak mode

To enable real logins set in the web environment:

```env
AUTH_MODE=keycloak
APP_BASE_URL=https://your-app.example.com
KEYCLOAK_ISSUER_URL=https://auth.example.com/realms/omnivox
KEYCLOAK_CLIENT_ID=omnivox-web
KEYCLOAK_CLIENT_SECRET=...
```

The issuer URL must be reachable **both** by the user's browser (for the login
redirect) and by the web server (for token exchange and JWKS). With the local
compose stack this means using a hostname that resolves from inside the
containers as well — a real domain, or host networking. The bundled demo realm
(`infra/keycloak/realm-omnivox.json`) is for local development only.
