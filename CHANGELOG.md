# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-12

First open source release.

### Added

- Direct browser upload to S3-compatible storage with presigned URLs.
- Transcription and analysis pipeline (summary, sentiment, participants, transcript segments) running on a dedicated BullMQ worker.
- On-demand generation of Mermaid diagrams and classified action items (`task`, `decision`, `risk`, `follow_up`).
- Markdown, Slack/Teams, and calendar exports.
- Q&A over the transcript and full report translation.
- Optional Keycloak (OIDC) login with tenant and per-user isolation.
- Versioned SQL migrations, structured logging with correlation ids, audit events.
- Local compose stack (Postgres, Redis, MinIO, Keycloak) and one-shot setup scripts.
- Dockerfiles for web and worker with an opt-in compose `app` profile that runs the full stack, including automatic database migration.
