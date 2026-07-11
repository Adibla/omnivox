# Security Policy

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately using
[GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Report a vulnerability" under the repository's **Security** tab).

When reporting, please include:

- A description of the vulnerability and its impact.
- Steps to reproduce, or a proof of concept.
- Affected version, commit, or configuration.

We will acknowledge your report and keep you updated on the fix.

## Scope and expectations

OmniVox is a self-hostable project. Each deployment controls its own identity,
storage, database, and AI backend. Security depends partly on how it is deployed.

When self-hosting, you are responsible for:

- Setting a strong `SESSION_SECRET` (the app refuses the default in production).
- Securing Postgres, Redis, and S3-compatible storage access.
- Configuring TLS and a reverse proxy in front of the app.
- Reviewing data sent to the configured AI backend against your own policy.

See [`docs/PRIVACY.md`](docs/PRIVACY.md) for privacy and data-handling notes.
