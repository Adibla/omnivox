import { fail, ok } from "@/lib/http";
import { getJobById } from "@/lib/pipeline-db-store";
import {
  canAccessOwnedResource,
  ensureSessionCookie,
  requireAuthenticatedSession,
} from "@/lib/auth";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const session = await ensureSessionCookie();
  try {
    requireAuthenticatedSession(session);
  } catch {
    return fail(request, { status: 401, code: "unauthorized", message: "Login required." });
  }
  const { jobId } = await context.params;
  const job = await getJobById(jobId);
  if (!job) {
    return fail(request, {
      status: 404,
      code: "not_found",
      message: "Job not found.",
    });
  }
  if (!canAccessOwnedResource(session, job)) {
    return fail(request, { status: 403, code: "forbidden", message: "Access denied." });
  }
  const { internalId: _internalId, ...publicJob } = job;
  return ok(request, publicJob);
}
