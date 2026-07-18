import { createHash, randomUUID } from "node:crypto";
import { PipelineStartRequestSchema } from "@omnivox/shared";
import {
  ensureSessionCookie,
  getOwnerFromSession,
  resolveSessionTenantId,
  requireAuthenticatedSession,
  validateCsrf,
} from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { describeError, fail, ok } from "@/lib/http";
import { createJob, getJobByIdempotency, writeAuditEvent } from "@/lib/pipeline-db-store";
import { enqueuePipelineStage } from "@/lib/queue";
import { getEnv } from "@/lib/env";
import { getCorrelationId } from "@/lib/http";
import { logError, logInfo } from "@/lib/logger";
import { ZodError } from "zod";

function createIdempotencyKey(input: {
  meetingId: string;
  objectKey?: string | null;
  transcriptText?: string | null;
  ownerSubject?: string | null;
}) {
  // Text-mode jobs have no object key, so they dedupe on a hash of the transcript.
  const source = input.objectKey
    ? `obj:${input.objectKey}`
    : `txt:${createHash("sha256")
        .update(input.transcriptText ?? "")
        .digest("hex")}`;
  return `${input.ownerSubject ?? "anonymous"}:${input.meetingId}:${source}`;
}

function estimateTokenUsage(input: { transcriptText?: string }) {
  if (!input.transcriptText) {
    return 1500;
  }
  return Math.ceil(input.transcriptText.length / 4);
}

export async function POST(request: Request) {
  const correlationId = getCorrelationId(request);
  try {
    const session = await ensureSessionCookie();
    try {
      requireAuthenticatedSession(session);
    } catch {
      return fail(request, {
        status: 401,
        code: "unauthorized",
        message: "Login required.",
      });
    }
    if (!validateCsrf(request, session.csrfToken)) {
      return fail(request, { status: 403, code: "forbidden", message: "Invalid CSRF token." });
    }
    const tenantId = resolveSessionTenantId(session);
    if (!(await checkRateLimit(`${tenantId}:pipeline_start`))) {
      return fail(request, { status: 429, code: "rate_limited", message: "Rate limit exceeded." });
    }

    const payload = PipelineStartRequestSchema.parse(await request.json());
    if (payload.objectKey && !payload.objectKey.startsWith(`${tenantId}/`)) {
      return fail(request, {
        status: 403,
        code: "forbidden",
        message: "Access denied for this object.",
      });
    }
    const owner = getOwnerFromSession(session);
    const idempotencyKey = createIdempotencyKey({
      meetingId: payload.meetingId,
      objectKey: payload.objectKey,
      transcriptText: payload.transcriptText,
      ownerSubject: owner.ownerSubject,
    });
    const existing = await getJobByIdempotency(idempotencyKey);
    if (existing) {
      return ok(
        request,
        {
          jobId: existing.jobId,
          state: existing.state,
        },
        202,
      );
    }

    const tokenEstimate = estimateTokenUsage(payload);
    if (tokenEstimate > getEnv().PIPELINE_TOKEN_BUDGET_PER_MEETING) {
      return fail(request, {
        status: 409,
        code: "conflict",
        message: "Token budget exceeded for meeting pipeline.",
      });
    }

    const jobId = randomUUID();
    await createJob({
      jobId,
      idempotencyKey,
      meetingId: payload.meetingId,
      displayTitle: payload.displayTitle ?? null,
      objectKey: payload.objectKey,
      state: "queued",
      tokenEstimate,
      tenantId,
      ownerIssuer: owner.ownerIssuer,
      ownerSubject: owner.ownerSubject,
    });
    await writeAuditEvent({
      jobId,
      eventType: "pipeline-started",
      payload: {
        meetingId: payload.meetingId,
        displayTitle: payload.displayTitle ?? null,
        objectKey: payload.objectKey,
      },
    });
    await enqueuePipelineStage({
      name: "transcription",
      jobId,
      payload: {
        jobId,
        meetingId: payload.meetingId,
        objectKey: payload.objectKey ?? null,
        transcriptText: payload.transcriptText ?? null,
        meetingTemplate: payload.meetingTemplate,
        outputLanguage: payload.outputLanguage,
        languageHint: payload.languageHint,
      },
    });
    logInfo({
      correlationId,
      event: "pipeline.v1.start.enqueued",
      payload: {
        jobId,
        meetingId: payload.meetingId,
      },
    });
    return ok(
      request,
      {
        jobId,
        state: "queued",
      },
      202,
    );
  } catch (error) {
    const detail = describeError(error);
    const isValidation = error instanceof ZodError;
    logError({
      correlationId,
      event: "pipeline.v1.start.failed",
      error: detail,
    });
    return fail(request, {
      status: isValidation ? 400 : 500,
      code: isValidation ? "bad_request" : "internal_error",
      message: "Unable to start the pipeline.",
      detail: isValidation ? detail : undefined,
    });
  }
}
