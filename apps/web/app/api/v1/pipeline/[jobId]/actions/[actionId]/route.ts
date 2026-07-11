import { UpdateActionStatusRequestSchema } from "@omnivox/shared";
import { canAccessOwnedResource, ensureSessionCookie, requireAuthenticatedSession, validateCsrf } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getJobById, resolveActionId, upsertActionStatus } from "@/lib/pipeline-db-store";

type RouteContext = {
  params: Promise<{
    jobId: string;
    actionId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await ensureSessionCookie();
  try {
    requireAuthenticatedSession(session);
  } catch {
    return fail(request, { status: 401, code: "unauthorized", message: "Login richiesto." });
  }
  if (!validateCsrf(request, session.csrfToken)) {
    return fail(request, { status: 403, code: "forbidden", message: "Invalid CSRF token." });
  }

  const { jobId, actionId } = await context.params;
  const job = await getJobById(jobId);
  if (!job) {
    return fail(request, { status: 404, code: "not_found", message: "Job non trovato." });
  }
  if (!canAccessOwnedResource(session, job)) {
    return fail(request, { status: 403, code: "forbidden", message: "Accesso negato." });
  }
  const result = job.result;
  if (!result?.actions.length) {
    return fail(request, { status: 404, code: "not_found", message: "Azione non trovata." });
  }

  const actionExists = result.actions.some((action, index) => resolveActionId(action, index) === actionId);
  if (!actionExists) {
    return fail(request, { status: 404, code: "not_found", message: "Azione non trovata." });
  }

  const payload = UpdateActionStatusRequestSchema.parse(await request.json());
  await upsertActionStatus({ jobId, actionId, status: payload.status });
  return ok(request, {
    actionId,
    status: payload.status,
    updatedAt: new Date().toISOString()
  });
}
