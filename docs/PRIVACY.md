# Privacy and GDPR

This is not legal advice. It only explains what data the project may touch and what still has to be decided for a real deployment.

## Data Processed

OmniVox may process:

- audio files uploaded by the user
- transcripts
- summaries and model-generated outputs
- diagrams and operational actions
- technical job metadata
- minimal OIDC identifiers when Keycloak is enabled

In Keycloak mode, the app does not create an application user table. Jobs are linked to:

- `tenant_id`
- `owner_issuer`
- `owner_subject`

Email and name may be shown in the UI from the session, but Keycloak remains the user source.

## Where Data Lives

With the local compose stack:

- audio: MinIO
- jobs and results: Postgres
- OIDC session tokens: Redis
- queue: Redis

In production, this depends on the services chosen by whoever installs the project.

## AI Backend

The pipeline sends content to the configured AI backend for transcription and analysis. OpenAI is the default, but `OPENAI_BASE_URL` can point to a service compatible with the OpenAI APIs used by the project.

Before using it with real data, check:

- contract and settings for the AI account or service
- Zero Data Retention, if available
- legal basis for processing
- user-facing privacy notice
- internal policy for audio and transcripts

`OPENAI_ZDR_HEADER` and `OPENAI_ZDR_VALUE` can be used to send dedicated headers when supported by the contract or service.

## Retention

The project does not impose a universal retention policy. In production, define:

- audio retention in storage
- result retention in Postgres
- backup and restore policy
- deletion on request
- technical logs and log duration

MinIO/S3 can apply bucket lifecycle policies. Postgres needs an application policy or scheduled jobs.

## Data Access

With `AUTH_MODE=keycloak`, APIs filter jobs by tenant and ownership:

- `tenant_id`
- `owner_issuer`
- `owner_subject`

With `AUTH_MODE=disabled`, the app is only suitable for local development or controlled environments: everyone uses the tenant configured by `DEFAULT_TENANT_ID`.

## Production Checklist

- Keycloak configured with real realm, client, and redirect URIs
- stable `tenant_id` claim
- long `SESSION_SECRET` handled as a secret
- storage on HTTPS or behind a TLS proxy
- S3 credentials not shared with untrusted clients
- documented retention
- documented backups
- limited admin access
- logs without unnecessary sensitive content
