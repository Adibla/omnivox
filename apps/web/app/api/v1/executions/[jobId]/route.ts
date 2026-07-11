import {
  canAccessOwnedResource,
  ensureSessionCookie,
  requireAuthenticatedSession,
  validateCsrf,
} from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getJobById, softDeleteJob } from "@/lib/pipeline-db-store";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
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
  const job = await getJobById(jobId);
  if (!job) {
    return fail(request, { status: 404, code: "not_found", message: "Job not found." });
  }
  if (!canAccessOwnedResource(session, job)) {
    return fail(request, { status: 403, code: "forbidden", message: "Access denied." });
  }
  await softDeleteJob(jobId);
  return ok(request, { ok: true });
}
