export function logInfo(input: { correlationId?: string; event: string; payload?: Record<string, unknown> }) {
  process.stdout.write(`${formatLog({
    level: "info",
    correlationId: input.correlationId,
    event: input.event,
    payload: input.payload ?? {}
  })}\n`);
}

export function logError(input: {
  correlationId?: string;
  event: string;
  error: string;
  payload?: Record<string, unknown>;
}) {
  process.stderr.write(`${formatLog({
    level: "error",
    correlationId: input.correlationId,
    event: input.event,
    error: input.error,
    payload: input.payload ?? {}
  })}\n`);
}

function formatLog(input: {
  level: "info" | "error";
  correlationId?: string;
  event: string;
  error?: string;
  payload: Record<string, unknown>;
}) {
  return JSON.stringify({
    level: input.level,
    at: new Date().toISOString(),
    correlationId: input.correlationId,
    event: input.event,
    error: input.error,
    payload: input.payload
  });
}
