import { z } from "zod";
import {
  canAccessOwnedResource,
  ensureSessionCookie,
  requireAuthenticatedSession,
  resolveSessionTenantId,
  validateCsrf,
} from "@/lib/auth";
import { describeError, fail, getCorrelationId, ok } from "@/lib/http";
import { logError } from "@/lib/logger";
import { getOpenAIClient } from "@/lib/openai";
import { getEnv } from "@/lib/env";
import { getJobById } from "@/lib/pipeline-db-store";
import { checkRateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  question: z.string().min(3).max(800).trim(),
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
      return fail(request, { status: 401, code: "unauthorized", message: "Login required." });
    }
    if (!validateCsrf(request, session.csrfToken)) {
      return fail(request, { status: 403, code: "forbidden", message: "Invalid CSRF token." });
    }
    const { jobId } = await context.params;
    const rateKey = `${resolveSessionTenantId(session)}:pipeline-ask`;
    if (!checkRateLimit(rateKey)) {
      return fail(request, {
        status: 429,
        code: "rate_limited",
        message: "Too many questions. Try again shortly.",
      });
    }
    let body: z.infer<typeof BodySchema>;
    try {
      const json = (await request.json()) as unknown;
      body = BodySchema.parse(json);
    } catch {
      return fail(request, { status: 400, code: "bad_request", message: "Invalid question." });
    }
    const job = await getJobById(jobId);
    if (!job) {
      return fail(request, { status: 404, code: "not_found", message: "Job not found." });
    }
    if (!canAccessOwnedResource(session, job)) {
      return fail(request, { status: 403, code: "forbidden", message: "Access denied." });
    }
    const stored = job.result;
    if (!stored) {
      return fail(request, {
        status: 400,
        code: "bad_request",
        message: "Analysis not completed yet.",
      });
    }
    const transcript = stored.normalizedTranscript?.trim();
    if (!transcript || transcript.length < 40) {
      return fail(request, {
        status: 400,
        code: "bad_request",
        message: "Transcript not available for this job (previous or incomplete result).",
      });
    }
    const briefSnippet = stored.executiveBriefMarkdown.slice(0, 2000);
    const completion = await getOpenAIClient().chat.completions.create({
      model: getEnv().MODEL_ASK,
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that answers only from the provided material (meeting transcript and brief excerpt). " +
            "If the information is not present, say so clearly. Answer in the same language as the question, concisely and professionally.",
        },
        {
          role: "user",
          content: `Brief excerpt (context):\n---\n${briefSnippet}\n---\n\nMeeting transcript:\n---\n${transcript.slice(0, 120_000)}\n---\n\nQuestion: ${body.question}`,
        },
      ],
      max_tokens: 600,
    });
    const answer = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!answer) {
      return fail(request, {
        status: 502,
        code: "internal_error",
        message: "Empty response from the model.",
      });
    }
    return ok(request, { answer });
  } catch (error) {
    logError({
      correlationId: getCorrelationId(request),
      event: "pipeline.v1.ask.failed",
      error: describeError(error),
    });
    return fail(request, {
      status: 500,
      code: "internal_error",
      message: "Failed to answer the question.",
    });
  }
}
