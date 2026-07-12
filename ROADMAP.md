# Roadmap

This is a working list of improvements for future releases. It is not a commitment list; it describes the current product and technical direction.

## Hardening

- Pluggable queue transport, with possible RabbitMQ or NATS support if a dedicated broker, multi-language workers, or more explicit routing become useful.
- Shared rate limiting on Redis for deployments with multiple web replicas.
- DLQ tooling for inspecting, retrying, and purging failed jobs.
- More complete readiness checks for web and worker: Redis, Postgres, S3-compatible storage, and AI configuration.
- Operational metrics: queue depth, job duration, error rate per stage, average job age.
- Configurable retention for audio, results, audit data, and sessions.
- Clear backup and restore policy for Postgres, Redis, and object storage.
- Better separation of OpenAI/API keys between web and worker if separate budgets or permissions are needed.

## Product

- Transcript-only analyses: start from a pasted transcript with no audio upload (also enables a one-click sample demo).
- Global search across transcripts, actions, decisions, and diagrams.
- Advanced filters for analyses: owner, risk, priority, status, date range, meeting template.
- Richer action board: assignee, comments, history, and bulk updates.
- Controlled report sharing with explicit permissions.
- Custom meeting templates.
- PDF/DOCX export in addition to Markdown, Slack/Teams, and calendar export.
- Comparison between multiple meetings for the same project or customer.

## AI Pipeline

- Pluggable AI provider layer: OpenAI/OpenAI-compatible by default, with future native adapters for Gemini or Claude where the required features match.
- Chunking and large-file handling beyond the current direct upload limit.
- Server-side audio normalization (e.g. remuxing 3GP-in-`.m4a` phone recordings) so quirky containers are transcribed instead of rejected.
- More robust speaker diarization.
- Selective regeneration of individual sections: brief, actions, diagrams, or translation.
- Output quality checks with targeted retry only on the weak stage.
- Prompt configuration by tenant or meeting template.
- Native provider-specific tests for structured JSON, Mermaid generation, translation, and provider-specific limitations.

## Self-Hosting

- Reverse proxy TLS examples.
- Clearer local reset and demo seed scripts.
- Kubernetes/Helm examples.
- Full backup/restore runbook.

## Developer Experience

- E2E suite that can run against the full local stack.
- Small, safe audio fixtures for reproducible tests.
- `make` targets or npm scripts for setup, reset, tests, and smoke checks.
- GitHub Actions for typecheck, tests, and build.
