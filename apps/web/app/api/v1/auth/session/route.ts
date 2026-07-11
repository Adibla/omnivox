import { ensureSessionCookie, isAuthRequired } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

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
              name: session.auth.name
            }
          : null
      },
      201
    );
  } catch (error) {
    return fail(request, {
      status: 500,
      code: "internal_error",
      message: "Unable to create session cookie.",
      detail: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
