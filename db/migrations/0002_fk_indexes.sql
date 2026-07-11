-- Postgres does not index foreign key columns automatically. These cover the
-- per-job lookups and deletes on the child tables and the cascade path from
-- pipeline_jobs.
create index if not exists pipeline_artifacts_job_idx on pipeline_artifacts (job_id);

create index if not exists pipeline_actions_job_idx on pipeline_actions (job_id);

create index if not exists audit_events_job_idx on audit_events (job_id);
