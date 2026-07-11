export type ApiErrorBody = {
  code?: string;
  message?: string;
  detail?: string;
  correlationId?: string;
};

const CODE_HINTS_IT: Record<string, string> = {
  bad_request: "Richiesta non valida.",
  unauthorized: "Sessione non valida o scaduta. Ricarica la pagina.",
  forbidden: "Operazione non consentita (CSRF o permessi).",
  not_found: "Risorsa non trovata.",
  conflict: "Conflitto: ad esempio budget token superato.",
  rate_limited: "Troppe richieste. Riprova tra poco.",
  internal_error: "Errore interno del server.",
};

export function formatApiErrorMessage(body: ApiErrorBody): string {
  const base =
    body.message?.trim() || CODE_HINTS_IT[body.code ?? ""] || "Si è verificato un errore.";
  const detail = body.detail?.trim();
  if (detail && detail !== base) {
    return `${base} (${detail})`;
  }
  return base;
}

export async function parseFailedResponse(response: Response): Promise<string> {
  return (await parseFailedResponseMeta(response)).message;
}

export async function parseFailedResponseMeta(
  response: Response,
): Promise<ApiErrorBody & { status: number; message: string }> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as ApiErrorBody;
    if (body.message || body.code) {
      return {
        ...body,
        status: response.status,
        message: formatApiErrorMessage(body),
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
