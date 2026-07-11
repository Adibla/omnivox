import { AnalysisOutputSchema, TranslateReportRequestSchema } from "@omnivox/shared";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import {
  canAccessOwnedResource,
  ensureSessionCookie,
  requireAuthenticatedSession,
  resolveSessionTenantId,
  validateCsrf,
} from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { describeError, fail, getCorrelationId, ok } from "@/lib/http";
import { logError } from "@/lib/logger";
import { getOpenAIClient } from "@/lib/openai";
import { getJobById } from "@/lib/pipeline-db-store";
import { checkRateLimit } from "@/lib/rate-limit";
import { ZodError } from "zod";

const LANGUAGE_LABELS: Record<"it" | "en", string> = {
  it: "Italiano",
  en: "English",
};

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

function resultForTranslation(result: unknown) {
  const parsed = AnalysisOutputSchema.parse(result);
  return {
    executiveBriefMarkdown: parsed.executiveBriefMarkdown,
    artifacts: parsed.artifacts,
    actions: parsed.actions,
    sentiment: parsed.sentiment,
  };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await ensureSessionCookie();
    try {
      requireAuthenticatedSession(session);
    } catch {
      return fail(request, { status: 401, code: "unauthorized", message: "Login required." });
    }
    if (!validateCsrf(request, session.csrfToken)) {
      return fail(request, { status: 403, code: "forbidden", message: "Invalid CSRF token." });
    }

    const { jobId } = await context.params;
    if (!checkRateLimit(`${resolveSessionTenantId(session)}:pipeline-translate`)) {
      return fail(request, {
        status: 429,
        code: "rate_limited",
        message: "Too many translations. Try again shortly.",
      });
    }

    const body = TranslateReportRequestSchema.parse(await request.json());
    const job = await getJobById(jobId);
    if (!job) {
      return fail(request, { status: 404, code: "not_found", message: "Job not found." });
    }
    if (!canAccessOwnedResource(session, job)) {
      return fail(request, { status: 403, code: "forbidden", message: "Access denied." });
    }
    if (!job.result) {
      return fail(request, {
        status: 400,
        code: "bad_request",
        message: "Analysis not completed yet.",
      });
    }

    const source = resultForTranslation(job.result);
    const targetLabel = LANGUAGE_LABELS[body.targetLanguage];
    const response = await getOpenAIClient().responses.create({
      model: getEnv().MODEL_ASK,
      input: [
        {
          role: "system",
          content:
            `Translate the report into ${targetLabel}. Return strict JSON only with the same schema. ` +
            "Translate executiveBriefMarkdown, artifact titles, Mermaid node labels, action titles, and owner values only when they are generic role names. " +
            "Keep action id, status, dueDate, priority, risk, actionType, sentiment and Mermaid syntax structurally equivalent.",
        },
        {
          role: "user",
          content: JSON.stringify(source),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "translated_meeting_outcomes",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              executiveBriefMarkdown: { type: "string", minLength: 40 },
              artifacts: {
                type: "array",
                minItems: 0,
                maxItems: 4,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string", minLength: 3 },
                    diagramType: { type: "string", enum: ["mindmap", "flowchart"] },
                    mermaidCode: { type: "string", minLength: 20, maxLength: 8000 },
                  },
                  required: ["title", "diagramType", "mermaidCode"],
                },
              },
              actions: {
                type: "array",
                minItems: 0,
                maxItems: 30,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string", minLength: 3 },
                    owner: { type: "string", minLength: 1 },
                    dueDate: { type: ["string", "null"] },
                    priority: { type: "string", enum: ["low", "medium", "high"] },
                    risk: { type: "string", enum: ["low", "medium", "high"] },
                    actionType: { type: "string", enum: ["task", "decision", "risk", "follow_up"] },
                    id: { type: "string" },
                    status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] },
                  },
                  required: [
                    "title",
                    "owner",
                    "dueDate",
                    "priority",
                    "risk",
                    "actionType",
                    "id",
                    "status",
                  ],
                },
              },
              sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
            },
            required: ["executiveBriefMarkdown", "artifacts", "actions", "sentiment"],
          },
          strict: true,
        },
      },
    } satisfies ResponseCreateParamsNonStreaming);

    const translatedReport = JSON.parse(response.output_text);
    const original = AnalysisOutputSchema.parse(job.result);
    const translated = AnalysisOutputSchema.parse({
      ...translatedReport,
      normalizedTranscript: original.normalizedTranscript,
      participants: original.participants,
      transcriptSegments: original.transcriptSegments,
    });
    return ok(request, { result: translated, targetLanguage: body.targetLanguage });
  } catch (error) {
    const isValidation = error instanceof ZodError;
    const detail = describeError(error);
    if (!isValidation) {
      logError({
        correlationId: getCorrelationId(request),
        event: "pipeline.v1.translate.failed",
        error: detail,
      });
    }
    return fail(request, {
      status: isValidation ? 400 : 500,
      code: isValidation ? "bad_request" : "internal_error",
      message: isValidation ? "Invalid translation request." : "Translation failed.",
      detail: isValidation ? detail : undefined,
    });
  }
}
