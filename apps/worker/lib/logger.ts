export function logInfo(input: { event: string; payload?: Record<string, unknown> }) {
  process.stdout.write(
    `${formatLog({
      level: "info",
      event: input.event,
      payload: input.payload ?? {},
    })}\n`,
  );
}

export function logError(input: {
  event: string;
  error: string;
  payload?: Record<string, unknown>;
}) {
  process.stderr.write(
    `${formatLog({
      level: "error",
      event: input.event,
      error: input.error,
      payload: input.payload ?? {},
    })}\n`,
  );
}

function formatLog(input: {
  level: "info" | "error";
  event: string;
  error?: string;
  payload: Record<string, unknown>;
}) {
  return JSON.stringify({
    level: input.level,
    at: new Date().toISOString(),
    event: input.event,
    error: input.error,
    payload: input.payload,
  });
}
