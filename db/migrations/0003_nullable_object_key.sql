-- Transcript-only analyses have no uploaded audio, so no storage object.
alter table pipeline_jobs alter column object_key drop not null;
