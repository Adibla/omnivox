-- Original start options needed to retry a failed job (object key stays in its own column).
alter table pipeline_jobs add column start_payload jsonb;
