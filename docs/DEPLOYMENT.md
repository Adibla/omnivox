# Deployment

Four ways to run OmniVox, from quickest to most manual. Kubernetes/Helm
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

## 3. Production with Docker

The bundled compose file is the local trial stack. In production you keep your
managed Postgres, Redis, S3-compatible storage, and identity provider, and run
only the two application images against them.

Build the images from the repository root (locally or in CI):

```bash
docker build -f apps/web/Dockerfile -t <registry>/omnivox-web:0.1.0 .
docker build -f apps/worker/Dockerfile -t <registry>/omnivox-worker:0.1.0 .
```

Apply migrations as a release step — a one-shot container from the worker
image:

```bash
docker run --rm -e DATABASE_URL=postgresql://... \
  -w /app <registry>/omnivox-worker:0.1.0 node scripts/migrate.mjs
```

Then run the two services with your orchestrator of choice (Compose, Swarm,
Nomad, ECS, ...):

| Service  | Image                             | Environment                                                                                                                                                                                                        |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `web`    | `omnivox-web` (port 3000)         | `DATABASE_URL`, `REDIS_URL`, `S3_*` (plus `S3_PUBLIC_ENDPOINT` when storage is reached over an internal network), `SESSION_SECRET`, `OPENAI_API_KEY`/`OPENAI_BASE_URL`, `APP_BASE_URL`, `AUTH_MODE` + `KEYCLOAK_*` |
| `worker` | `omnivox-worker` (health on 4010) | `DATABASE_URL`, `REDIS_URL`, `S3_*`, `OPENAI_API_KEY`/`OPENAI_BASE_URL`                                                                                                                                            |

Scaling notes: workers scale horizontally — BullMQ distributes jobs across
replicas. Keep the web at one replica until the in-memory rate limiter moves
to a shared store (see the roadmap). Wire the worker's `GET /health` and
`GET /ready` into your orchestrator's probes, and terminate TLS in front of
the web service.

## 4. Manual server deployment

For a single server without Docker for the app processes:

```bash
npm ci
npm run build && npm run build:worker
NODE_ENV=production npm run start -w apps/web
NODE_ENV=production npm run start -w apps/worker   # second process
```

Requirements and hardening for any real deployment (Docker or manual):

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
redirect) and by the web server (for token exchange and JWKS), under the same
hostname — the token issuer is verified strictly. In a real deployment this is
automatic: Keycloak lives at a public hostname (e.g. `https://auth.example.com`)
that browsers and servers resolve alike, so no special setup is needed beyond
registering `https://your-app.example.com/api/v1/auth/callback` as a redirect
URI on the client.

### Local compose stack with Keycloak

`localhost` does not satisfy the rule above (inside the web container it points
to the container itself). Use `host.docker.internal`, which both sides can
resolve:

1. If your browser cannot resolve it, add this line to `/etc/hosts`:

   ```text
   127.0.0.1 host.docker.internal
   ```

2. Add to the root `.env`:

   ```env
   AUTH_MODE=keycloak
   KEYCLOAK_ISSUER_URL=http://host.docker.internal:8080/realms/omnivox
   KEYCLOAK_CLIENT_ID=omnivox-web
   KEYCLOAK_CLIENT_SECRET=omnivox-local-secret
   ```

3. Restart the profile: `docker compose --profile app up -d`.

Log in with the demo users (`demo`/`demo`, `demo2`/`demo2`). The bundled demo
realm (`infra/keycloak/realm-omnivox.json`) is for local development only.
