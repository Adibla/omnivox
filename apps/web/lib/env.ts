import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);
const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const EnvSchema = z
  .object({
    S3_ENDPOINT: optionalNonEmptyString,
    // Endpoint reachable from the browser, used only to sign upload/read URLs.
    // Needed when the server talks to storage over an internal network.
    S3_PUBLIC_ENDPOINT: optionalNonEmptyString,
    S3_REGION: optionalString,
    S3_BUCKET: z.string().min(3).optional(),
    S3_ACCESS_KEY_ID: z.string().min(3).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(8).optional(),
    S3_SERVER_SIDE_ENCRYPTION: optionalNonEmptyString,
    S3_FORCE_PATH_STYLE: z.coerce.boolean().optional(),
    S3_CHECKSUM_ENABLED: z.coerce.boolean().optional(),
    S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().optional(),
    DATABASE_URL: z.string().url().default("postgresql://postgres:postgres@localhost:5432/omnivox"),
    REDIS_URL: z.string().url().default("redis://localhost:6379"),
    DEFAULT_TENANT_ID: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[a-z0-9-]+$/)
      .default("default-tenant"),
    OPENAI_API_KEY: z.string().min(16),
    OPENAI_BASE_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
    OPENAI_ZDR_HEADER: z.string().default("x-openai-data-retention"),
    OPENAI_ZDR_VALUE: z.string().default("zero-retention"),
    MODEL_ASK: z.string().min(3).default("gpt-4o-mini"),
    SESSION_SECRET: z.string().min(16).default("change-me-in-production"),
    AUTH_MODE: z.enum(["disabled", "keycloak"]).default("disabled"),
    APP_BASE_URL: z.string().url().default("http://localhost:3000"),
    KEYCLOAK_ISSUER_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
    KEYCLOAK_CLIENT_ID: optionalNonEmptyString,
    KEYCLOAK_CLIENT_SECRET: optionalNonEmptyString,
    PIPELINE_TOKEN_BUDGET_PER_MEETING: z.coerce.number().int().positive().default(24000),
    API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  })
  .transform((env) => ({
    ...env,
    S3_ENDPOINT: env.S3_ENDPOINT ?? "http://localhost:9000",
    S3_PUBLIC_ENDPOINT: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT ?? "http://localhost:9000",
    S3_REGION: env.S3_REGION ?? "us-east-1",
    S3_BUCKET: env.S3_BUCKET ?? "omnivox",
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID ?? "minioadmin",
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY ?? "minioadmin",
    S3_SERVER_SIDE_ENCRYPTION: env.S3_SERVER_SIDE_ENCRYPTION,
    S3_FORCE_PATH_STYLE: env.S3_FORCE_PATH_STYLE ?? true,
    S3_CHECKSUM_ENABLED: env.S3_CHECKSUM_ENABLED ?? true,
    S3_PRESIGN_TTL_SECONDS: env.S3_PRESIGN_TTL_SECONDS ?? 300,
  }))
  .superRefine((env, ctx) => {
    if (process.env.NODE_ENV === "production" && env.SESSION_SECRET === "change-me-in-production") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be set to a strong secret in production.",
      });
    }
    if (env.AUTH_MODE !== "keycloak") {
      return;
    }
    for (const key of [
      "KEYCLOAK_ISSUER_URL",
      "KEYCLOAK_CLIENT_ID",
      "KEYCLOAK_CLIENT_SECRET",
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when AUTH_MODE=keycloak.`,
        });
      }
    }
  });

export type AppEnv = z.infer<typeof EnvSchema>;

let cache: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cache) {
    return cache;
  }
  cache = EnvSchema.parse(process.env);
  return cache;
}
