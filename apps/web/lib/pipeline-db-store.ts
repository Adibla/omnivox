import { createHash, randomUUID } from "node:crypto";
import { AnalysisOutputSchema, type AnalysisOutput, type PipelineState } from "@omnivox/shared";
import { initializeDatabase, getDbPool } from "./db";

export type DbPipelineJob = {
  internalId: number;
  jobId: string;
  idempotencyKey: string;
  meetingId: string;
  displayTitle?: string | null;
  objectKey: string | null;
  state: PipelineState | "running" | "retrying" | "dead_letter";
  attempt: number;
  error?: string | null;
  tokenEstimate?: number | null;
  result?: AnalysisOutput | null;
  tenantId?: string | null;
  ownerIssuer?: string | null;
  ownerSubject?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActionStatus = "todo" | "in_progress" | "blocked" | "done";
type ArtifactKind = "actions" | "diagrams";
type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

const DEFAULT_ARTIFACT_STATUS = {
  state: "pending" as const,
};

export async function createJob(input: {
  jobId: string;
  idempotencyKey: string;
  meetingId: string;
  displayTitle?: string | null;
  objectKey?: string | null;
  state: DbPipelineJob["state"];
  tokenEstimate?: number;
  tenantId?: string | null;
  ownerIssuer?: string | null;
  ownerSubject?: string | null;
}) {
  await initializeDatabase();
  const db = getDbPool();
  await db.query(
    `insert into pipeline_jobs (external_id, idempotency_key, meeting_id, display_title, object_key, state, token_estimate, tenant_id, owner_issuer, owner_subject)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.jobId,
      input.idempotencyKey,
      input.meetingId,
      input.displayTitle ?? null,
      input.objectKey ?? null,
      input.state,
      input.tokenEstimate ?? null,
      input.tenantId ?? null,
      input.ownerIssuer ?? null,
      input.ownerSubject ?? null,
    ],
  );
}

export async function getJobById(jobId: string): Promise<DbPipelineJob | null> {
  await initializeDatabase();
  const db = getDbPool();
  const { rows } = await db.query(
    `${jobSelectSql()} where external_id = $1 and deleted_at is null`,
    [jobId],
  );
  return rows.length === 0 ? null : hydrateJob(rowToJob(rows[0]));
}

export async function getJobByIdempotency(idempotencyKey: string): Promise<DbPipelineJob | null> {
  await initializeDatabase();
  const db = getDbPool();
  const { rows } = await db.query(
    `${jobSelectSql()} where idempotency_key = $1 and deleted_at is null`,
    [idempotencyKey],
  );
  return rows.length === 0 ? null : hydrateJob(rowToJob(rows[0]));
}

export async function listJobsByOwner(input: {
  tenantId: string;
  ownerIssuer: string;
  ownerSubject: string;
  limit?: number;
}) {
  await initializeDatabase();
  const db = getDbPool();
  const { rows } = await db.query(
    `${jobSelectSql()}
     where tenant_id = $1 and owner_issuer = $2 and owner_subject = $3 and deleted_at is null
     order by updated_at desc
     limit $4`,
    [input.tenantId, input.ownerIssuer, input.ownerSubject, input.limit ?? 50],
  );
  return Promise.all(rows.map((row) => hydrateJob(rowToJob(row))));
}

export async function softDeleteJob(jobId: string) {
  await initializeDatabase();
  const db = getDbPool();
  await db.query(
    `update pipeline_jobs set deleted_at = now(), updated_at = now() where external_id = $1`,
    [jobId],
  );
}

// Status-only write: the worker owns the artifact tables.
export async function markArtifactGenerating(jobId: string, kind: ArtifactKind) {
  await initializeDatabase();
  const db = getDbPool();
  const internalJobId = await resolveInternalJobId(db, jobId);
  await upsertArtifactStatus(db, internalJobId, kind, {
    state: "generating",
    updatedAt: new Date().toISOString(),
  });
  await db.query(`update pipeline_jobs set updated_at = now() where id = $1`, [internalJobId]);
}

export function resolveActionId(action: AnalysisOutput["actions"][number], index: number) {
  if (action.id) {
    return action.id;
  }
  const hash = createHash("sha256")
    .update(`${index}:${action.actionType}:${action.title}:${action.owner}:${action.dueDate ?? ""}`)
    .digest("hex")
    .slice(0, 16);
  return `action-${hash}`;
}

export async function upsertActionStatus(input: {
  jobId: string;
  actionId: string;
  status: ActionStatus;
}) {
  await initializeDatabase();
  const db = getDbPool();
  const internalJobId = await resolveInternalJobId(db, input.jobId);
  await upsertActionStatusWithDb(db, { ...input, internalJobId });
}

async function upsertActionStatusWithDb(
  db: Queryable,
  input: { internalJobId: number; actionId: string; status: ActionStatus },
) {
  await db.query(
    `insert into pipeline_action_states (job_id, action_id, status, updated_at)
     values ($1, $2, $3, now())
     on conflict (job_id, action_id)
     do update set status = excluded.status, updated_at = now()`,
    [input.internalJobId, input.actionId, input.status],
  );
  await db.query(`update pipeline_jobs set updated_at = now() where id = $1`, [
    input.internalJobId,
  ]);
}

export async function writeAuditEvent(input: {
  jobId?: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  await initializeDatabase();
  const db = getDbPool();
  const internalJobId = input.jobId ? await resolveInternalJobId(db, input.jobId) : null;
  await db.query(
    `insert into audit_events (external_id, job_id, event_type, payload_json)
     values ($1, $2, $3, $4)`,
    [randomUUID(), internalJobId, input.eventType, JSON.stringify(input.payload)],
  );
}

function jobSelectSql() {
  return `select id, external_id, idempotency_key, meeting_id, display_title, object_key, state, attempt, error, token_estimate, tenant_id, owner_issuer, owner_subject, created_at, updated_at
          from pipeline_jobs`;
}

function rowToJob(row: Record<string, unknown>): DbPipelineJob {
  return {
    internalId: Number(row.id),
    jobId: String(row.external_id),
    idempotencyKey: String(row.idempotency_key),
    meetingId: String(row.meeting_id),
    displayTitle: (row.display_title as string | null) ?? null,
    objectKey: (row.object_key as string | null) ?? null,
    state: String(row.state) as DbPipelineJob["state"],
    attempt: Number(row.attempt ?? 0),
    error: (row.error as string | null) ?? null,
    tokenEstimate: (row.token_estimate as number | null) ?? null,
    result: null,
    tenantId: (row.tenant_id as string | null) ?? null,
    ownerIssuer: (row.owner_issuer as string | null) ?? null,
    ownerSubject: (row.owner_subject as string | null) ?? null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

async function hydrateJob(job: DbPipelineJob): Promise<DbPipelineJob> {
  const result = await assembleResult(job.internalId);
  return {
    ...job,
    result,
  };
}

async function assembleResult(internalJobId: number): Promise<AnalysisOutput | null> {
  const db = getDbPool();
  const { rows: resultRows } = await db.query(
    `select executive_brief_markdown, sentiment, normalized_transcript, participants_json, transcript_segments_json
     from pipeline_results
     where job_id = $1`,
    [internalJobId],
  );
  if (resultRows.length === 0) {
    return null;
  }

  const [artifactRows, actionRows, statusRows] = await Promise.all([
    db.query(
      `select diagram_type, title, mermaid_code
      from pipeline_artifacts
      where job_id = $1
      order by sort_order asc, id asc`,
      [internalJobId],
    ),
    db.query(
      `select a.action_id, a.title, a.owner, a.due_date, a.priority, a.risk, a.action_type, coalesce(s.status, 'todo') as status
       from pipeline_actions a
       left join pipeline_action_states s on s.job_id = a.job_id and s.action_id = a.action_id
       where a.job_id = $1
       order by a.sort_order asc, a.id asc`,
      [internalJobId],
    ),
    db.query(
      `select artifact_kind, state, error, updated_at
       from pipeline_artifact_statuses
       where job_id = $1`,
      [internalJobId],
    ),
  ]);

  const statusMap = Object.fromEntries(
    statusRows.rows.map((row) => [String(row.artifact_kind), row]),
  );
  const statusFor = (kind: ArtifactKind) => {
    const row = statusMap[kind];
    if (!row) {
      return DEFAULT_ARTIFACT_STATUS;
    }
    return {
      state: String(row.state),
      ...(row.error ? { error: String(row.error) } : {}),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  };

  const base = resultRows[0];
  return AnalysisOutputSchema.parse({
    executiveBriefMarkdown: base.executive_brief_markdown,
    sentiment: base.sentiment,
    normalizedTranscript: base.normalized_transcript ?? undefined,
    participants: Array.isArray(base.participants_json) ? base.participants_json : [],
    transcriptSegments: Array.isArray(base.transcript_segments_json)
      ? base.transcript_segments_json
      : [],
    artifacts: artifactRows.rows.map((row) => ({
      title: String(row.title),
      diagramType: row.diagram_type,
      mermaidCode: String(row.mermaid_code),
    })),
    actions: actionRows.rows.map((row) => ({
      id: String(row.action_id),
      title: String(row.title),
      owner: String(row.owner),
      dueDate: row.due_date ? new Date(String(row.due_date)).toISOString() : null,
      priority: row.priority,
      risk: row.risk,
      actionType: row.action_type,
      status: row.status,
    })),
    artifactStatus: {
      actions: statusFor("actions"),
      diagrams: statusFor("diagrams"),
    },
  });
}

async function upsertArtifactStatus(
  db: Queryable,
  internalJobId: number,
  kind: ArtifactKind,
  status: AnalysisOutput["artifactStatus"][ArtifactKind],
) {
  await db.query(
    `insert into pipeline_artifact_statuses (job_id, artifact_kind, state, error, updated_at)
     values ($1, $2, $3, $4, $5)
     on conflict (job_id, artifact_kind)
     do update set state = excluded.state, error = excluded.error, updated_at = excluded.updated_at`,
    [
      internalJobId,
      kind,
      status.state,
      status.error ?? null,
      status.updatedAt ? new Date(status.updatedAt) : new Date(),
    ],
  );
}

async function resolveInternalJobId(db: Queryable, externalJobId: string): Promise<number> {
  const { rows } = await db.query(
    `select id from pipeline_jobs where external_id = $1 and deleted_at is null`,
    [externalJobId],
  );
  if (rows.length === 0) {
    throw new Error(`Unknown job ${externalJobId}.`);
  }
  return Number(rows[0].id);
}
