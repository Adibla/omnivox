import { z } from "zod";
import {
  canAccessOwnedResource,
  ensureSessionCookie,
  requireAuthenticatedSession,
  resolveSessionTenantId,
  validateCsrf
} from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getOpenAIClient } from "@/lib/openai";
import { getEnv } from "@/lib/env";
import { getJobById } from "@/lib/pipeline-db-store";
import { checkRateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  question: z.string().min(3).max(800).trim()
});

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await ensureSessionCookie();
    try {
      requireAuthenticatedSession(session);
    } catch {
      return fail(request, { status: 401, code: "unauthorized", message: "Login richiesto." });
    }
    if (!validateCsrf(request, session.csrfToken)) {
      return fail(request, { status: 403, code: "forbidden", message: "Invalid CSRF token." });
    }
    const { jobId } = await context.params;
    const rateKey = `${resolveSessionTenantId(session)}:pipeline-ask`;
    if (!checkRateLimit(rateKey)) {
      return fail(request, { status: 429, code: "rate_limited", message: "Troppe domande. Riprova tra poco." });
    }
    let body: z.infer<typeof BodySchema>;
    try {
      const json = (await request.json()) as unknown;
      body = BodySchema.parse(json);
    } catch {
      return fail(request, { status: 400, code: "bad_request", message: "Domanda non valida." });
    }
    const job = await getJobById(jobId);
    if (!job) {
      return fail(request, { status: 404, code: "not_found", message: "Job non trovato." });
    }
    if (!canAccessOwnedResource(session, job)) {
      return fail(request, { status: 403, code: "forbidden", message: "Accesso negato." });
    }
    const stored = job.result;
    if (!stored) {
      return fail(request, { status: 400, code: "bad_request", message: "Analisi non ancora completata." });
    }
    const transcript = stored.normalizedTranscript?.trim();
    if (!transcript || transcript.length < 40) {
      return fail(request, {
        status: 400,
        code: "bad_request",
        message: "Trascrizione non disponibile per questo job (risultato precedente o incompleto)."
      });
    }
    const briefSnippet = stored.executiveBriefMarkdown.slice(0, 2000);
    const completion = await getOpenAIClient().chat.completions.create({
      model: getEnv().MODEL_ASK,
      messages: [
        {
          role: "system",
          content:
            "Sei un assistente che risponde solo in base al materiale fornito (trascrizione e estratto di brief). " +
            "Se l'informazione non è presente, dillo chiaramente. Rispondi in italiano, in modo conciso e professionale."
        },
        {
          role: "user",
          content: `Estratto brief (contesto):\n---\n${briefSnippet}\n---\n\nTrascrizione riunione:\n---\n${transcript.slice(0, 120_000)}\n---\n\nDomanda: ${body.question}`
        }
      ],
      max_tokens: 600
    });
    const answer = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!answer) {
      return fail(request, { status: 502, code: "internal_error", message: "Risposta vuota dal modello." });
    }
    return ok(request, { answer });
  } catch (error) {
    return fail(request, {
      status: 500,
      code: "internal_error",
      message: "Errore durante la risposta.",
      detail: error instanceof Error ? error.message : undefined
    });
  }
}
