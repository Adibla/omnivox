#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const migrationsDir = join(repoRoot, "db", "migrations");
const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/omnivox";

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  for (const candidate of ["apps/web/.env.local", "apps/web/.env"]) {
    const path = join(repoRoot, candidate);
    if (existsSync(path)) {
      process.loadEnvFile(path);
      if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
      }
    }
  }
  return DEFAULT_DATABASE_URL;
}

function readMigrations() {
  if (!existsSync(migrationsDir)) {
    return [];
  }
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ version: name, sql: readFileSync(join(migrationsDir, name), "utf8") }));
}

async function main() {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      );
    `);
    const { rows } = await client.query("select version from schema_migrations");
    const applied = new Set(rows.map((row) => row.version));

    const pending = readMigrations().filter((migration) => !applied.has(migration.version));
    if (pending.length === 0) {
      console.log("Database is up to date. No migrations to apply.");
      return;
    }

    for (const migration of pending) {
      console.log(`Applying ${migration.version} ...`);
      await client.query("begin");
      try {
        await client.query(migration.sql);
        await client.query("insert into schema_migrations (version) values ($1)", [
          migration.version,
        ]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(
          `Migration ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

function describeError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code = "code" in error && error.code ? ` (${error.code})` : "";
  if (error.message) {
    return `${error.message}${code}`;
  }
  return `Could not connect to the database${code}. Is Postgres running and is DATABASE_URL correct?`;
}

main().catch((error) => {
  console.error(`Migration failed: ${describeError(error)}`);
  process.exit(1);
});
