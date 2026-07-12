import { CompleteUploadRequestSchema } from "@omnivox/shared";
import { verifyUploadedObject } from "@/lib/s3";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  ensureSessionCookie,
  requireAuthenticatedSession,
  resolveSessionTenantId,
  validateCsrf,
} from "@/lib/auth";
import { describeError, fail, getCorrelationId, ok } from "@/lib/http";
import { writeAuditEvent } from "@/lib/pipeline-db-store";
import { logError } from "@/lib/logger";
import { ZodError } from "zod";

export async function POST(request: Request) {
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
    const tenantId = resolveSessionTenantId(session);
    if (!(await checkRateLimit(`${tenantId}:complete`))) {
      return fail(request, { status: 429, code: "rate_limited", message: "Rate limit exceeded." });
    }
    const payload = CompleteUploadRequestSchema.parse(await request.json());
    if (!payload.objectKey.startsWith(`${tenantId}/`)) {
      return fail(request, {
        status: 403,
        code: "forbidden",
        message: "Access denied for this object.",
      });
    }
    await verifyUploadedObject(payload.objectKey);
    try {
      await writeAuditEvent({
        eventType: "upload-complete",
        payload,
      });
    } catch (auditError) {
      logError({
        event: "storage.v1.complete.audit_write_failed",
        error: auditError instanceof Error ? auditError.message : "Unknown error",
        payload: {
          meetingId: payload.meetingId,
          objectKey: payload.objectKey,
        },
      });
    }
    return ok(request, { ok: true });
  } catch (error) {
    const isValidation = error instanceof ZodError;
    const detail = describeError(error);
    if (!isValidation) {
      logError({
        correlationId: getCorrelationId(request),
        event: "storage.v1.complete.failed",
        error: detail,
      });
    }
    return fail(request, {
      status: 400,
      code: "bad_request",
      message: "Upload verification failed.",
      detail: isValidation ? detail : undefined,
    });
  }
}
