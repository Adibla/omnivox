export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
  },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 400;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const statusCode = extractStatusCode(error);
      const shouldRetry = statusCode === null || statusCode === 429 || statusCode >= 500;
      if (!shouldRetry || attempt === maxAttempts) {
        break;
      }
      const waitMs = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}

function extractStatusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const maybeStatus = (error as { status?: unknown }).status;
  return typeof maybeStatus === "number" ? maybeStatus : null;
}
