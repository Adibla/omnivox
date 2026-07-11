import { ensureSessionCookie, isAuthRequired } from "@/lib/auth";
import { describeError, fail, getCorrelationId, ok } from "@/lib/http";
import { logError } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const session = await ensureSessionCookie();
    return ok(
      request,
      {
        csrfToken: session.csrfToken,
        tenantId: session.auth?.tenantId ?? session.tenantId,
        authMode: isAuthRequired() ? "keycloak" : "disabled",
        authenticated: Boolean(session.auth),
        user: session.auth
          ? {
              subject: session.auth.subject,
              tenantId: session.auth.tenantId,
              email: session.auth.email,
              name: session.auth.name,
            }
          : null,
      },
      201,
    );
  } catch (error) {
    logError({
      correlationId: getCorrelationId(request),
      event: "auth.v1.session.failed",
      error: describeError(error),
    });
    return fail(request, {
      status: 500,
      code: "internal_error",
      message: "Unable to create session cookie.",
    });
  }
}
