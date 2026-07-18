# Architecture

These are the technical notes for the project. The README explains how to get started; this file keeps the runtime flow, main APIs, and choices worth knowing before changing the system.

## Components

| Component                    | Role                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Browser                      | UI, file selection, SHA-256 hash, direct storage upload, polling, report rendering            |
| Web (`apps/web`)             | Next.js, UI, `/api/v1/*` routes, session, CSRF, S3 presign, pipeline enqueue, DB reads/writes |
| Worker (`apps/worker`)       | BullMQ consumer, transcription, preprocessing, reasoning, lazy actions/diagrams               |
| Redis                        | BullMQ queue and server-side OIDC session token store                                         |
| Postgres                     | Job metadata, report data, actions, artifacts, generation status, and audit data              |
| MinIO/S3                     | Original audio files                                                                          |
| Keycloak                     | Local/optional OIDC identity provider                                                         |
| OpenAI / compatible endpoint | Transcription and generated outputs                                                           |

The browser does not call the AI backend directly. It also does not call the worker. It goes through the web API, which enqueues work in Redis and reads state from Postgres.

## Application Boundary

`apps/web` intentionally contains both the dashboard and the lightweight HTTP API. For the current product shape this keeps local setup and self-hosting simple: one web process owns browser-facing concerns such as session cookies, CSRF, presigned uploads, polling endpoints, and report reads.

The CPU/network-heavy work is not handled by Next.js. Audio transcription, model calls, preprocessing, reasoning, and lazy artifact generation run in `apps/worker`, which can be deployed and scaled separately. Postgres remains the source of truth and Redis/BullMQ only delivers work.

A separate backend service would make sense if the project needed public third-party APIs, multiple independent frontends, a different backend language/runtime, or separate deployment ownership for a larger team. Until then, splitting the HTTP API out would add operational cost without improving the main bottleneck, which is worker throughput.

## Main Flow

```mermaid
sequenceDiagram
  participant browser as Browser
  participant web as Web API
  participant s3 as S3
  participant redis as Redis/BullMQ
  participant worker as Worker
  participant pg as Postgres
  participant openai as AI backend

  browser->>web: POST /api/v1/auth/session
  web-->>browser: csrfToken + omni_session cookie
  browser->>web: POST /api/v1/storage/presign
  web-->>browser: uploadUrl + objectKey + requiredHeaders
  browser->>s3: PUT audio
  browser->>web: POST /api/v1/storage/complete
  browser->>web: POST /api/v1/pipeline/start
  web->>pg: create queued job
  web->>redis: enqueue transcription
  browser->>web: GET /api/v1/pipeline/{jobId}
  redis-->>worker: transcription/preprocess/reasoning stage
  worker->>s3: read audio
  worker->>openai: transcription + analysis
  worker->>pg: update job state and result entities
  browser->>web: POST /api/v1/pipeline/{jobId}/actions/generate
  browser->>web: POST /api/v1/pipeline/{jobId}/diagrams/generate
```

Main job states:

```text
queued -> transcribing -> preprocessing -> reasoning -> completed
                                         \-> failed
```

Actions and diagrams are generated on demand. A job can be `completed` while the dedicated action or diagram tables are still empty.

## Data Model

Postgres is the source of truth. The API response still exposes a convenient `result` object for the frontend, but that object is assembled from normalized tables instead of being stored as a central JSON blob.

| Table                        | Purpose                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline_jobs`              | Execution metadata: internal numeric `id`, public `external_id`, idempotency key, meeting id, display title, object key, state, owner, tenant, error, timestamps, soft delete |
| `pipeline_results`           | Base report: executive brief, sentiment, normalized transcript, participants, timestamped transcript segments, schema version                                                 |
| `pipeline_actions`           | Generated tasks, decisions, risks, and follow-ups                                                                                                                             |
| `pipeline_action_states`     | User-controlled board state for each action                                                                                                                                   |
| `pipeline_artifacts`         | Generated Mermaid artifacts such as mind maps and flowcharts                                                                                                                  |
| `pipeline_artifact_statuses` | Lazy generation state for `actions` and `diagrams`                                                                                                                            |
| `audit_events`               | Operational audit trail for pipeline and generation events                                                                                                                    |

Tables use numeric primary keys internally and expose UUIDs through `external_id` at the API boundary. Child tables reference the internal `pipeline_jobs.id`; URLs, queue payloads, recent items, and API responses use the public execution UUID.

The schema is managed with forward-only SQL migrations in `db/migrations`, applied with `npm run db:migrate` (a minimal runner that tracks applied files in a `schema_migrations` table). Web and worker never mutate the schema at runtime: on startup they only verify that it exists and fail fast with a clear message if migrations have not been applied.

`GET /api/v1/pipeline/{jobId}` composes the frontend shape from these tables, where `{jobId}` is the public execution UUID. This keeps the UI simple while avoiding duplicated business data in `pipeline_jobs`.

## Auth and Data Isolation

Supported modes:

- `AUTH_MODE=keycloak`: OIDC login, opaque HttpOnly cookie, OIDC tokens stored server-side in Redis.
- `AUTH_MODE=disabled`: useful locally; uses `DEFAULT_TENANT_ID`.

In Keycloak mode, the app does not keep an application user table. Each job stores only:

- `tenant_id`
- `owner_issuer`
- `owner_subject`

Job reads are filtered by tenant and owner. The client does not send `tenantId`; the server derives it from the OIDC token or the local default.

Mutating routes require the `omni_session` cookie and the `x-csrf-token` header returned by `POST /api/v1/auth/session`.

## Storage

The browser uploads directly to S3-compatible storage through a presigned URL.

Object key format:

```text
tenantId/YYYY/MM/meetingId.ext
```

Supported audio formats in the direct upload flow:

```text
flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm
```

Current limit: 25 MiB. Client-side chunking is not implemented yet.

Local MinIO configuration:

```env
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=omnivox
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
S3_SERVER_SIDE_ENCRYPTION=
S3_CHECKSUM_ENABLED=true
```

If a storage provider does not support SHA-256 checksum headers on presigned uploads, use `S3_CHECKSUM_ENABLED=false`. If it requires server-side encryption, set `S3_SERVER_SIDE_ENCRYPTION`.

When the server reaches storage over an internal network (e.g. the compose `app` profile talks to `http://minio:9000`), set `S3_PUBLIC_ENDPOINT` to the browser-facing storage URL: presigned upload/read URLs embed the endpoint host in the signature, so they must be signed against the host the browser will actually call.

## Pipeline Worker

Stages:

1. `transcription`: reads audio from S3 and uses `MODEL_TRANSCRIPTION` (`whisper-1` by default).
2. `preprocess`: normalizes text, participants, and segments.
3. `reasoning`: creates the base report.
4. `actions`: generates tasks, decisions, risks, and follow-ups when requested.
5. `diagrams`: generates Mermaid diagrams when requested.

Today these consumers live in the same worker process because that is easier to run locally. The stages are already separated as BullMQ jobs. If the workload grows, they can be split into multiple processes or services, for example one worker for transcription and another for reasoning/actions/diagrams. Redis would remain the queue contract and Postgres would remain the state store.

Default models:

```env
OPENAI_BASE_URL=
MODEL_TRANSCRIPTION=whisper-1
MODEL_PREPROCESS=gpt-5.4-mini
MODEL_REASONING=gpt-5.5
MODEL_ASK=gpt-4o-mini
```

If `OPENAI_BASE_URL` is empty, the standard OpenAI endpoint is used. If it is set, web and worker use that endpoint through the OpenAI SDK. The alternative service must be compatible with the endpoints used here: audio transcription, Responses API, and Chat Completions.

Native Gemini or Claude adapters would need a real provider layer rather than only a different base URL. The useful boundary would be small: `transcribeAudio`, `generateStructuredJson`, `askQuestion`, and `translateReport`. Claude may be a good fit for reasoning-style stages but does not replace speech-to-text by itself; Gemini may cover more multimodal cases, but it still needs dedicated tests for schema output and Mermaid quality.

Worker probes:

```text
GET http://localhost:4010/health
GET http://localhost:4010/ready
```

## Main APIs

All product APIs live under `/api/v1`.

| Method   | Endpoint                               | Purpose                                    |
| -------- | -------------------------------------- | ------------------------------------------ |
| `POST`   | `/auth/session`                        | create/reuse session and return CSRF token |
| `GET`    | `/auth/login`                          | redirect to Keycloak login                 |
| `GET`    | `/auth/callback`                       | OIDC callback                              |
| `GET`    | `/auth/logout`                         | app/Keycloak logout                        |
| `POST`   | `/storage/presign`                     | presigned URL for audio upload             |
| `POST`   | `/storage/complete`                    | verify object after upload                 |
| `POST`   | `/pipeline/start`                      | create job and enqueue pipeline            |
| `GET`    | `/pipeline/{jobId}`                    | read state and result                      |
| `POST`   | `/pipeline/{jobId}/actions/generate`   | generate actions on demand                 |
| `POST`   | `/pipeline/{jobId}/diagrams/generate`  | generate diagrams on demand                |
| `PATCH`  | `/pipeline/{jobId}/actions/{actionId}` | update action card status                  |
| `POST`   | `/pipeline/{jobId}/retry`              | re-enqueue a failed analysis               |
| `POST`   | `/pipeline/{jobId}/read-audio`         | temporary URL to replay source audio       |
| `POST`   | `/pipeline/{jobId}/ask`                | ask a question about the meeting           |
| `POST`   | `/pipeline/{jobId}/translate`          | translate the report                       |
| `GET`    | `/executions`                          | list recent analyses visible to the user   |
| `DELETE` | `/executions/{jobId}`                  | remove an analysis from the user's list    |

Error envelope:

```json
{
  "code": "bad_request|unauthorized|forbidden|not_found|conflict|rate_limited|internal_error",
  "message": "Human readable message.",
  "detail": "Optional diagnostic string.",
  "correlationId": "uuid"
}
```

## Local Run

```bash
docker compose up -d
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.env.example apps/worker/.env.local
```

Then set `OPENAI_API_KEY` in both env files, apply migrations, and start the processes:

```bash
npm run db:migrate
npm run dev
npm run dev:worker
```

Local services:

| Service       | URL                            |
| ------------- | ------------------------------ |
| Web           | `http://localhost:3000`        |
| Keycloak      | `http://localhost:8080`        |
| MinIO console | `http://localhost:9001`        |
| Worker health | `http://localhost:4010/health` |

Demo Keycloak users:

| Username | Password | Tenant |
| -------- | -------- | ------ |
| `demo`   | `demo`   | `acme` |
| `demo2`  | `demo2`  | `acme` |

## Essential Env

Web:

```env
AUTH_MODE=keycloak
APP_BASE_URL=http://localhost:3000
SESSION_SECRET=replace-with-long-secret
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/omnivox
REDIS_URL=redis://localhost:6379
KEYCLOAK_ISSUER_URL=http://localhost:8080/realms/omnivox
KEYCLOAK_CLIENT_ID=omnivox-web
KEYCLOAK_CLIENT_SECRET=omnivox-local-secret
OPENAI_API_KEY=replace-with-your-openai-api-key
OPENAI_BASE_URL=
```

Worker:

```env
OPENAI_API_KEY=replace-with-your-openai-api-key
OPENAI_BASE_URL=
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/omnivox
REDIS_URL=redis://localhost:6379
```

Web and worker must use the same bucket.

## Idempotency

`POST /api/v1/pipeline/start` accepts either an uploaded `objectKey` or a pasted `transcriptText`, and uses this logical key:

```text
ownerSubject + ":" + meetingId + ":" + (objectKey | sha256(transcriptText))
```

Audio jobs dedupe on the stored object; transcript-only jobs dedupe on a hash of the text, so re-submitting the same input returns the existing job instead of duplicating work, while an edited transcript starts a new one.

## Known Limits

- Rate limiting is a fixed per-minute window on Redis; it fails open if Redis is unreachable.
- The `/api/v1/*` routes are same-origin by design: no CORS headers are set, so they are meant to be consumed only by the bundled web app, not by external clients.
- The weak default `SESSION_SECRET` is rejected only when `NODE_ENV=production`. Real deployments must set `NODE_ENV=production` explicitly, otherwise the app starts with the insecure default.
- Generated content is derived from untrusted meeting audio: a hostile transcript can steer what the model writes (prompt injection). The blast radius is contained — the model has no tools, outputs are schema-validated, rendered without raw HTML, and the CSP blocks external requests from rendered content — but briefs and actions remain suggestions to review, not facts.
- Worker readiness is still simple; it mostly checks Postgres today.
- A DLQ exists on the worker side, but operator tooling for inspect/replay is still missing.
- Large files need chunking or preprocessing to go beyond the current direct upload limit.
- Metrics, tracing, and alerting still need work.
- `packages/wasm-audio` contains contracts for a possible browser-side path, but it is not part of the active pipeline.

## Queue Choice

Redis + BullMQ is the current queue choice: Redis is already used for sessions, BullMQ handles retry/backoff, and the pipeline model is still a job queue. RabbitMQ would make sense if a dedicated task broker became useful. Kafka would fit better if the pipeline became an event log with replay and more external consumers.

If the worker side grows, the likely direction is not jumping straight to Kafka, but making the queue transport replaceable. RabbitMQ or NATS would be good candidates if we needed workers in different languages, more explicit routing, dedicated queues per stage, or a more recognizable infrastructure boundary. Postgres would still remain the source of truth for job state: the broker delivers work, it does not own application state.
