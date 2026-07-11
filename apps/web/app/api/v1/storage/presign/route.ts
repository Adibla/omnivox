import { PresignRequestBaseSchema, PresignRequestSchema } from "@omnivox/shared";
import { createPresignedUpload } from "@/lib/s3";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureSessionCookie, requireAuthenticatedSession, resolveSessionTenantId, validateCsrf } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { writeAuditEvent } from "@/lib/pipeline-db-store";
import { ZodError } from "zod";
import { logError } from "@/lib/logger";

const PresignClientPayloadSchema = PresignRequestBaseSchema.omit({ tenantId: true });

function describeError(error: unknown) {
  if (error instanceof ZodError) {
    return JSON.stringify(error.issues);
  }
  if (error instanceof Error) {
    return error.message || error.name;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await ensureSessionCookie();
    try {
      requireAuthenticatedSession(session);
    } catch (error) {
      return fail(request, {
        status: 401,
        code: "unauthorized",
        message: "Login richiesto.",
        detail: describeError(error)
      });
    }
    if (!validateCsrf(request, session.csrfToken)) {
      return fail(request, { status: 403, code: "forbidden", message: "Invalid CSRF token." });
    }
    const tenantId = resolveSessionTenantId(session);
    const rateKey = `${tenantId}:presign`;
    if (!checkRateLimit(rateKey)) {
      return fail(request, { status: 429, code: "rate_limited", message: "Rate limit exceeded." });
    }
    const clientPayload = PresignClientPayloadSchema.parse(await request.json());
    const payload = PresignRequestSchema.parse({
      ...clientPayload,
      tenantId
    });
    const result = await createPresignedUpload(payload);
    try {
      await writeAuditEvent({
        eventType: "presign-issued",
        payload: {
          meetingId: payload.meetingId,
          tenantId: payload.tenantId,
          objectKey: result.objectKey
        }
      });
    } catch (auditError) {
      logError({
        event: "storage.v1.presign.audit_write_failed",
        error: describeError(auditError),
        payload: {
          meetingId: payload.meetingId,
          objectKey: result.objectKey
        }
      });
    }
    return ok(request, result, 201);
  } catch (error) {
    const detail = describeError(error);
    const isValidation = error instanceof ZodError;
    return fail(request, {
      status: isValidation ? 400 : 500,
      code: isValidation ? "bad_request" : "internal_error",
      message: isValidation ? "Invalid presign request." : "Unable to create presigned URL.",
      detail
    });
  }
}
