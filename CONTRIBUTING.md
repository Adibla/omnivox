# Contributing to OmniVox

Thanks for your interest in contributing. This guide covers the basics to get a
change merged smoothly.

## Development setup

OmniVox is an npm workspaces monorepo (`apps/*`, `packages/*`). You need Node.js
20+, npm, and Docker.

```bash
# 1. Start local infrastructure (Postgres, Redis, Keycloak, MinIO)
docker compose up -d

# 2. Install dependencies
npm ci

# 3. Create local env files and set OPENAI_API_KEY in both
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.env.example apps/worker/.env.local

# 4. Apply database migrations
npm run db:migrate

# 5. Run web and worker (separate terminals)
npm run dev
npm run dev:worker
```

See [`README.md`](README.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for
more detail.

## Database changes

The schema is managed with forward-only SQL migrations in `db/migrations`. Never
mutate the schema at runtime.

- Add a new file named `NNNN_short_description.sql` (incrementing the numeric prefix).
- Never edit a migration that has already been applied or merged — add a new one.
- Keep migrations idempotent where reasonable.
- Run `npm run db:migrate` to apply.

## Before opening a pull request

Run the full verification locally:

```bash
npm run verify
npm run lint
npm run format:check
```

`verify` runs typecheck (web + worker), tests, and builds (web + worker). CI runs
all of the above on every pull request, so lint and formatting failures block the
merge; `npm run lint:fix` and `npm run format` fix most issues automatically.

## Pull request guidelines

- Keep changes focused; one logical change per PR.
- Use clear commit messages: `<type>(<scope>): <description>` (`feat`, `fix`,
  `refactor`, `test`, `docs`, `chore`).
- Update documentation when behavior or configuration changes.
- Add or update tests when you change logic.
- Fill in the pull request template.

## Code style

- TypeScript everywhere; code, identifiers, and in-code docs in English.
- Small functions, descriptive names, fail-fast input validation.
- Comments only when the "why" is not obvious from the code.
- Avoid new dependencies when the standard library or existing tooling is enough.

## Reporting bugs and requesting features

Use the GitHub issue templates. For security issues, do **not** open a public
issue — see [`SECURITY.md`](SECURITY.md).
