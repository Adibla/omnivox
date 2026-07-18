import {
  canAccessOwnedResource,
  ensureSessionCookie,
  requireAuthenticatedSession,
  resolveSessionTenantId,
  validateCsrf,
} from "@/lib/auth";
import { describeError, fail, getCorrelationId, ok } from "@/lib/http";
import { logError } from "@/lib/logger";
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
      return fail(request, { status: 401, code: "unauthorized", message: "Login required." });
    }
    if (!validateCsrf(request, session.csrfToken)) {
      return fail(request, { status: 403, code: "forbidden", message: "Invalid CSRF token." });
    }
    const { jobId } = await context.params;
    const rateKey = `${resolveSessionTenantId(session)}:read-audio`;
    if (!(await checkRateLimit(rateKey))) {
      return fail(request, {
        status: 429,
        code: "rate_limited",
        message: "Too many requests. Try again shortly.",
      });
    }
    const job = await getJobById(jobId);
    if (!job) {
      return fail(request, { status: 404, code: "not_found", message: "Job not found." });
    }
    if (!canAccessOwnedResource(session, job)) {
      return fail(request, {
        status: 403,
        code: "forbidden",
        message: "Access denied for this object.",
      });
    }
    if (!job.objectKey) {
      return fail(request, {
        status: 404,
        code: "not_found",
        message: "This analysis has no source audio.",
      });
    }
    const url = await createPresignedReadUrl(job.objectKey);
    return ok(request, { url, expiresInSeconds: 300 });
  } catch (error) {
    logError({
      correlationId: getCorrelationId(request),
      event: "pipeline.v1.read_audio.failed",
      error: describeError(error),
    });
    return fail(request, {
      status: 500,
      code: "internal_error",
      message: "Unable to generate read URL.",
    });
  }
}
