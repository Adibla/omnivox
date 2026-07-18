import {
  canAccessOwnedResource,
  ensureSessionCookie,
  requireAuthenticatedSession,
  resolveSessionTenantId,
  validateCsrf,
} from "@/lib/auth";
import { describeError, fail, getCorrelationId, ok } from "@/lib/http";
import { logError, logInfo } from "@/lib/logger";
import { getJobById, loadStartPayload, resetJobForRetry } from "@/lib/pipeline-db-store";
import { clearPipelineStageJobs, enqueuePipelineStage } from "@/lib/queue";
import { checkRateLimit } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const correlationId = getCorrelationId(request);
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
    if (!(await checkRateLimit(`${resolveSessionTenantId(session)}:pipeline-retry`))) {
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
      return fail(request, { status: 403, code: "forbidden", message: "Access denied." });
    }
    if (job.state !== "failed") {
      return fail(request, {
        status: 409,
        code: "conflict",
        message: "Only failed analyses can be retried.",
      });
    }
    const startPayload = await loadStartPayload(jobId);
    if (!startPayload) {
      return fail(request, {
        status: 409,
        code: "conflict",
        message: "This analysis cannot be retried: its start options were not stored.",
      });
    }

    await clearPipelineStageJobs(jobId);
    await resetJobForRetry(jobId);
    await enqueuePipelineStage({
      name: "transcription",
      jobId,
      payload: {
        jobId,
        meetingId: job.meetingId,
        objectKey: job.objectKey ?? null,
        ...startPayload,
      },
    });
    logInfo({ correlationId, event: "pipeline.v1.retry.enqueued", payload: { jobId } });
    return ok(request, { jobId, state: "queued" }, 202);
  } catch (error) {
    logError({
      correlationId,
      event: "pipeline.v1.retry.failed",
      error: describeError(error),
    });
    return fail(request, {
      status: 500,
      code: "internal_error",
      message: "Unable to retry the analysis.",
    });
  }
}
