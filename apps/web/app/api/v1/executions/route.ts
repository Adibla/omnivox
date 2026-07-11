import {
  ensureSessionCookie,
  requireAuthenticatedSession,
  resolveSessionTenantId,
} from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { listJobsByOwner } from "@/lib/pipeline-db-store";

export async function GET(request: Request) {
  const session = await ensureSessionCookie();
  try {
    requireAuthenticatedSession(session);
  } catch {
    return fail(request, { status: 401, code: "unauthorized", message: "Login required." });
  }
  if (!session.auth) {
    return ok(request, { items: [] });
  }
  const jobs = await listJobsByOwner({
    tenantId: resolveSessionTenantId(session),
    ownerIssuer: session.auth.issuer,
    ownerSubject: session.auth.subject,
    limit: 50,
  });
  return ok(request, {
    items: jobs.map((job) => ({
      jobId: job.jobId,
      meetingId: job.meetingId,
      title: job.displayTitle || job.meetingId,
      status:
        job.state === "completed" ? "completed" : job.state === "failed" ? "failed" : "in_progress",
      updatedAt: job.updatedAt,
      actionCount: job.result?.actions.length,
      diagramCount: job.result?.artifacts.length,
    })),
  });
}
