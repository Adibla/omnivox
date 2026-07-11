import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { AnalysisOutputSchema, type AnalysisOutput } from "@omnivox/shared";
import { getWorkerEnv } from "@/lib/env";

let pool: Pool | null = null;
let initialized = false;

type ArtifactKind = "actions" | "diagrams";
type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export function getWorkerDbPool() {
  if (pool) {
    return pool;
  }
  pool = new Pool({
    connectionString: getWorkerEnv().DATABASE_URL,
  });
  return pool;
}

async function ensureWorkerDatabase() {
  if (initialized) {
    return;
  }
  const db = getWorkerDbPool();
  const { rows } = await db.query(
    `select 1
     from information_schema.tables
     where table_schema = 'public' and table_name = 'pipeline_jobs'`,
  );
  if (rows.length === 0) {
    throw new Error(
      "Database schema not found. Run `npm run db:migrate` before starting the worker.",
    );
  }
  initialized = true;
}

export async function updateJobState(jobId: string, state: string, error?: string | null) {
  await ensureWorkerDatabase();
  await getWorkerDbPool().query(
    `update pipeline_jobs set state = $2, error = $3, updated_at = now(), attempt = attempt + 1 where external_id = $1`,
    [jobId, state, error ?? null],
  );
}

export async function getJob(jobId: string) {
  await ensureWorkerDatabase();
  const { rows } = await getWorkerDbPool().query(
    `select id, external_id, meeting_id, object_key from pipeline_jobs where external_id = $1`,
    [jobId],
  );
  if (rows.length === 0) {
    return null;
  }
  return {
    job_id: rows[0].external_id,
    meeting_id: rows[0].meeting_id,
    object_key: rows[0].object_key,
    result: await assembleResult(Number(rows[0].id)),
  };
}

export async function completeJob(jobId: string, result: Record<string, unknown>) {
  await ensureWorkerDatabase();
  const parsed = AnalysisOutputSchema.parse(result);
  const db = getWorkerDbPool();
  const client = await db.connect();
  try {
    await client.query("begin");
    const internalJobId = await resolveInternalJobId(client, jobId);
    await client.query(
      `update pipeline_jobs set state = 'completed', updated_at = now() where id = $1`,
      [internalJobId],
    );
    await persistResultEntities(client, internalJobId, parsed);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateJobResult(jobId: string, result: Record<string, unknown>) {
  await ensureWorkerDatabase();
  const parsed = AnalysisOutputSchema.parse(result);
  const db = getWorkerDbPool();
  const client = await db.connect();
  try {
    await client.query("begin");
    const internalJobId = await resolveInternalJobId(client, jobId);
    await persistResultEntities(client, internalJobId, parsed);
    await client.query(`update pipeline_jobs set updated_at = now() where id = $1`, [
      internalJobId,
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function writeAudit(
  jobId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await ensureWorkerDatabase();
  const internalJobId = await resolveInternalJobId(getWorkerDbPool(), jobId);
  await getWorkerDbPool().query(
    `insert into audit_events (external_id, job_id, event_type, payload_json) values ($1, $2, $3, $4::jsonb)`,
    [randomUUID(), internalJobId, eventType, JSON.stringify(payload)],
  );
}

async function assembleResult(internalJobId: number): Promise<AnalysisOutput | null> {
  const db = getWorkerDbPool();
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
      return { state: "pending" };
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

async function persistResultEntities(db: Queryable, internalJobId: number, result: AnalysisOutput) {
  await db.query(
    `insert into pipeline_results (
       job_id, executive_brief_markdown, sentiment, normalized_transcript, participants_json, transcript_segments_json, result_schema_version, updated_at
     )
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 1, now())
     on conflict (job_id)
     do update set
       executive_brief_markdown = excluded.executive_brief_markdown,
       sentiment = excluded.sentiment,
       normalized_transcript = excluded.normalized_transcript,
       participants_json = excluded.participants_json,
       transcript_segments_json = excluded.transcript_segments_json,
       result_schema_version = excluded.result_schema_version,
       updated_at = now()`,
    [
      internalJobId,
      result.executiveBriefMarkdown,
      result.sentiment,
      result.normalizedTranscript ?? null,
      JSON.stringify(result.participants ?? []),
      JSON.stringify(result.transcriptSegments ?? []),
    ],
  );
  await replaceArtifacts(db, internalJobId, result.artifacts);
  await replaceActions(db, internalJobId, result.actions);
  await upsertArtifactStatus(db, internalJobId, "actions", result.artifactStatus.actions);
  await upsertArtifactStatus(db, internalJobId, "diagrams", result.artifactStatus.diagrams);
}

async function replaceArtifacts(
  db: Queryable,
  internalJobId: number,
  artifacts: AnalysisOutput["artifacts"],
) {
  await db.query(`delete from pipeline_artifacts where job_id = $1`, [internalJobId]);
  for (const [index, artifact] of artifacts.entries()) {
    await db.query(
      `insert into pipeline_artifacts (job_id, diagram_type, title, mermaid_code, sort_order)
       values ($1, $2, $3, $4, $5)`,
      [internalJobId, artifact.diagramType, artifact.title, artifact.mermaidCode, index],
    );
  }
}

async function replaceActions(
  db: Queryable,
  internalJobId: number,
  actions: AnalysisOutput["actions"],
) {
  await db.query(`delete from pipeline_actions where job_id = $1`, [internalJobId]);
  for (const [index, action] of actions.entries()) {
    const id = action.id ?? actionId(action, index);
    await db.query(
      `insert into pipeline_actions (job_id, action_id, title, owner, due_date, priority, risk, action_type, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        internalJobId,
        id,
        action.title,
        action.owner,
        action.dueDate ?? null,
        action.priority,
        action.risk,
        action.actionType,
        index,
      ],
    );
    if (action.status && action.status !== "todo") {
      await db.query(
        `insert into pipeline_action_states (job_id, action_id, status, updated_at)
         values ($1, $2, $3, now())
         on conflict (job_id, action_id)
         do update set status = excluded.status, updated_at = now()`,
        [internalJobId, id, action.status],
      );
    }
  }
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

function actionId(
  action: { actionType: string; title: string; owner: string; dueDate?: string | null },
  index: number,
) {
  const hash = createHash("sha256")
    .update(`${index}:${action.actionType}:${action.title}:${action.owner}:${action.dueDate ?? ""}`)
    .digest("hex")
    .slice(0, 16);
  return `action-${hash}`;
}
