create table if not exists pipeline_jobs (
  id bigserial primary key,
  external_id uuid not null unique,
  idempotency_key text not null unique,
  meeting_id text not null,
  display_title text,
  object_key text not null,
  state text not null,
  attempt int not null default 0,
  error text,
  token_estimate int,
  tenant_id text,
  owner_issuer text,
  owner_subject text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pipeline_jobs_owner_idx
  on pipeline_jobs(tenant_id, owner_issuer, owner_subject, updated_at desc);

create table if not exists pipeline_results (
  job_id bigint primary key references pipeline_jobs(id) on delete cascade,
  executive_brief_markdown text not null,
  sentiment text not null,
  normalized_transcript text,
  participants_json jsonb not null default '[]'::jsonb,
  transcript_segments_json jsonb not null default '[]'::jsonb,
  result_schema_version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists pipeline_artifacts (
  id bigserial primary key,
  job_id bigint not null references pipeline_jobs(id) on delete cascade,
  diagram_type text not null,
  title text not null,
  mermaid_code text not null,
  sort_order int not null default 0
);

create table if not exists pipeline_actions (
  id bigserial primary key,
  job_id bigint not null references pipeline_jobs(id) on delete cascade,
  action_id text,
  title text not null,
  owner text not null,
  due_date timestamptz,
  priority text not null,
  risk text not null,
  action_type text not null default 'task',
  sort_order int not null default 0
);

create table if not exists pipeline_action_states (
  job_id bigint not null references pipeline_jobs(id) on delete cascade,
  action_id text not null,
  status text not null,
  updated_at timestamptz not null default now(),
  primary key (job_id, action_id)
);

create table if not exists pipeline_artifact_statuses (
  job_id bigint not null references pipeline_jobs(id) on delete cascade,
  artifact_kind text not null,
  state text not null,
  error text,
  updated_at timestamptz not null default now(),
  primary key (job_id, artifact_kind)
);

create table if not exists audit_events (
  id bigserial primary key,
  external_id uuid not null unique,
  job_id bigint references pipeline_jobs(id) on delete set null,
  event_type text not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now()
);
