export type ApiErrorBody = {
  code?: string;
  message?: string;
  detail?: string;
  correlationId?: string;
};

const CODE_HINTS: Record<string, Record<string, string>> = {
  it: {
    bad_request: "Richiesta non valida.",
    unauthorized: "Sessione non valida o scaduta. Ricarica la pagina.",
    forbidden: "Operazione non consentita (CSRF o permessi).",
    not_found: "Risorsa non trovata.",
    conflict: "Conflitto: ad esempio budget token superato.",
    rate_limited: "Troppe richieste. Riprova tra poco.",
    internal_error: "Errore interno del server.",
  },
  en: {
    bad_request: "Invalid request.",
    unauthorized: "Session invalid or expired. Reload the page.",
    forbidden: "Operation not allowed (CSRF or permissions).",
    not_found: "Resource not found.",
    conflict: "Conflict: for example, token budget exceeded.",
    rate_limited: "Too many requests. Try again shortly.",
    internal_error: "Internal server error.",
  },
};

const GENERIC_ERROR: Record<string, string> = {
  it: "Si è verificato un errore.",
  en: "Something went wrong.",
};

export function formatApiErrorMessage(body: ApiErrorBody, locale = "en"): string {
  const hints = CODE_HINTS[locale] ?? CODE_HINTS.en;
  const base =
    body.message?.trim() || hints[body.code ?? ""] || GENERIC_ERROR[locale] || GENERIC_ERROR.en;
  const detail = body.detail?.trim();
  if (detail && detail !== base) {
    return `${base} (${detail})`;
  }
  return base;
}

export async function parseFailedResponse(response: Response, locale = "en"): Promise<string> {
  return (await parseFailedResponseMeta(response, locale)).message;
}

export async function parseFailedResponseMeta(
  response: Response,
  locale = "en",
): Promise<ApiErrorBody & { status: number; message: string }> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as ApiErrorBody;
    if (body.message || body.code) {
      return {
        ...body,
        status: response.status,
        message: formatApiErrorMessage(body, locale),
      };
    }
  } catch {
    /* not JSON */
  }
  return {
    status: response.status,
    message: text.trim() || `HTTP ${response.status}`,
  };
}
