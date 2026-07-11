import { Pool } from "pg";
import { getEnv } from "./env";

let pool: Pool | null = null;
let initialized = false;

export function getDbPool() {
  if (pool) {
    return pool;
  }
  const env = getEnv();
  pool = new Pool({
    connectionString: env.DATABASE_URL
  });
  return pool;
}

export async function initializeDatabase() {
  if (initialized) {
    return;
  }
  const db = getDbPool();
  const { rows } = await db.query(
    `select 1
     from information_schema.tables
     where table_schema = 'public' and table_name = 'pipeline_jobs'`
  );
  if (rows.length === 0) {
    throw new Error("Database schema not found. Run `npm run db:migrate` before starting the app.");
  }
  initialized = true;
}
