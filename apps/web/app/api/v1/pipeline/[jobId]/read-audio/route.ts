import {
  canAccessOwnedResource,
  ensureSessionCookie,
  requireAuthenticatedSession,
  resolveSessionTenantId,
  validateCsrf
} from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getJobById } from "@/lib/pipeline-db-store";
import { checkRateLimit } from "@/lib/rate-limit";
import { createPresignedReadUrl } from "@/lib/s3";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await ensureSessionCookie();
    try {
      requireAuthenticatedSession(session);
    } catch {
      return fail(request, { status: 401, code: "unauthorized", message: "Login richiesto." });
    }
    if (!validateCsrf(request, session.csrfToken)) {
      return fail(request, { status: 403, code: "forbidden", message: "Invalid CSRF token." });
    }
    const { jobId } = await context.params;
    const rateKey = `${resolveSessionTenantId(session)}:read-audio`;
    if (!checkRateLimit(rateKey)) {
      return fail(request, { status: 429, code: "rate_limited", message: "Troppe richieste. Riprova tra poco." });
    }
    const job = await getJobById(jobId);
    if (!job) {
      return fail(request, { status: 404, code: "not_found", message: "Job non trovato." });
    }
    if (!canAccessOwnedResource(session, job)) {
      return fail(request, { status: 403, code: "forbidden", message: "Accesso negato a questo oggetto." });
    }
    const url = await createPresignedReadUrl(job.objectKey);
    return ok(request, { url, expiresInSeconds: 300 });
  } catch (error) {
    return fail(request, {
      status: 500,
      code: "internal_error",
      message: "Impossibile generare URL di lettura.",
      detail: error instanceof Error ? error.message : undefined
    });
  }
}
