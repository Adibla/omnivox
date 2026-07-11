import { AnalysisOutputSchema } from "@omnivox/shared";
import {
  canAccessOwnedResource,
  ensureSessionCookie,
  requireAuthenticatedSession,
  resolveSessionTenantId,
  validateCsrf,
} from "@/lib/auth";
import { describeError, fail, getCorrelationId, ok } from "@/lib/http";
import { logError } from "@/lib/logger";
import { getJobById, updateJobResult } from "@/lib/pipeline-db-store";
import { enqueuePipelineStage, type PipelineQueueJobName } from "@/lib/queue";
import { checkRateLimit } from "@/lib/rate-limit";

type GenerationKind = Extract<PipelineQueueJobName, "actions" | "diagrams">;

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

function statusGenerating() {
  return {
    state: "generating" as const,
    updatedAt: new Date().toISOString(),
  };
}

export async function generatePipelineArtifact(
  request: Request,
  context: RouteContext,
  kind: GenerationKind,
) {
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
    if (!checkRateLimit(`${resolveSessionTenantId(session)}:pipeline_${kind}`)) {
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
    if (job.state !== "completed" || !job.result) {
      return fail(request, {
        status: 409,
        code: "conflict",
        message: "Complete the base analysis first.",
      });
    }

    const result = AnalysisOutputSchema.parse(job.result);
    const currentStatus = result.artifactStatus[kind]?.state;
    if (currentStatus === "generating") {
      return ok(request, { state: "generating" }, 202);
    }
    if (kind === "diagrams" && result.artifacts.length > 0) {
      return ok(request, { state: "completed" });
    }
    if (kind === "actions" && result.actions.length > 0) {
      return ok(request, { state: "completed" });
    }

    const next = AnalysisOutputSchema.parse({
      ...result,
      artifactStatus: {
        ...result.artifactStatus,
        [kind]: statusGenerating(),
      },
    });
    await updateJobResult(jobId, next);
    await enqueuePipelineStage({
      name: kind,
      jobId,
      payload: {
        jobId,
        meetingId: job.meetingId,
        objectKey: job.objectKey,
      },
    });
    return ok(request, { state: "generating" }, 202);
  } catch (error) {
    logError({
      correlationId: getCorrelationId(request),
      event: "pipeline.v1.generation.failed",
      error: describeError(error),
    });
    return fail(request, {
      status: 500,
      code: "internal_error",
      message: "Unable to generate the requested content.",
    });
  }
}
