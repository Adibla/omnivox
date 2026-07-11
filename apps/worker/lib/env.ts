import { z } from "zod";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WorkerEnvSchema = z
  .object({
    OPENAI_API_KEY: z.string().min(16),
    OPENAI_BASE_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
    OPENAI_ZDR_HEADER: z.string().default("x-openai-data-retention"),
    OPENAI_ZDR_VALUE: z.string().default("zero-retention"),
    MODEL_TRANSCRIPTION: z.string().min(3).default("whisper-1"),
    MODEL_PREPROCESS: z.string().min(3).default("gpt-5.4-mini"),
    MODEL_REASONING: z.string().min(3).default("gpt-5.5"),
    REDIS_URL: z.string().url().default("redis://localhost:6379"),
    DATABASE_URL: z.string().url().default("postgresql://postgres:postgres@localhost:5432/omnivox"),
    S3_ENDPOINT: z.string().min(1).optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().min(3).optional(),
    S3_ACCESS_KEY_ID: z.string().min(3).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(8).optional(),
    S3_FORCE_PATH_STYLE: z.coerce.boolean().optional(),
  })
  .transform((env) => ({
    ...env,
    S3_ENDPOINT: env.S3_ENDPOINT ?? "http://localhost:9000",
    S3_REGION: env.S3_REGION ?? "us-east-1",
    S3_BUCKET: env.S3_BUCKET ?? "omnivox",
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID ?? "minioadmin",
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY ?? "minioadmin",
    S3_FORCE_PATH_STYLE: env.S3_FORCE_PATH_STYLE ?? true,
  }));

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

let envCache: WorkerEnv | null = null;
let envFilesLoaded = false;

function loadWorkerEnvFiles() {
  if (envFilesLoaded) {
    return;
  }
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const workerRoot = join(currentDir, "..");
  const localEnvPath = join(workerRoot, ".env.local");
  const defaultEnvPath = join(workerRoot, ".env");

  if (existsSync(localEnvPath)) {
    process.loadEnvFile(localEnvPath);
  }
  if (existsSync(defaultEnvPath)) {
    process.loadEnvFile(defaultEnvPath);
  }
  envFilesLoaded = true;
}

export function getWorkerEnv(): WorkerEnv {
  if (envCache) {
    return envCache;
  }
  loadWorkerEnvFiles();
  envCache = WorkerEnvSchema.parse(process.env);
  return envCache;
}
