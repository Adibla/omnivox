type AuditEvent =
  | "presign-issued"
  | "upload-complete"
  | "pipeline-started"
  | "pipeline-step"
  | "pipeline-failed"
  | "pipeline-completed";

type AuditPayload = Record<string, unknown>;

export function writeAudit(event: AuditEvent, payload: AuditPayload) {
  const entry = {
    event,
    at: new Date().toISOString(),
    payload,
  };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}
