import { AnalysisOutputSchema, type PipelineMessage } from "@omnivox/shared";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { completeJob, updateJobState, writeAudit } from "../db";
import { artifactStatus, meetingTemplateInstruction, outputLanguageInstruction } from "./helpers";
import type { StageContext } from "./types";

export async function processReasoning(payload: PipelineMessage, context: StageContext) {
  if (!payload.transcript || !payload.participants) {
    throw new Error("Missing preprocess payload for reasoning stage.");
  }
  await updateJobState(payload.jobId, "reasoning");
  const outLang = outputLanguageInstruction(payload.outputLanguage);
  const templateLine = meetingTemplateInstruction(payload.meetingTemplate);
  const response = await context.openai.responses.create({
    model: context.workerEnv.MODEL_REASONING,
    input: [
      {
        role: "system",
        content: `Return strict JSON only with executiveBriefMarkdown (Markdown body) and sentiment.
Meeting context: ${templateLine}
All user-facing text in executiveBriefMarkdown MUST be written in: ${outLang}.
Do not generate action items or diagrams in this step. Keep the brief decisive, concise, and useful as the first screen of the report.`
      },
      {
        role: "user",
        content: JSON.stringify({
          normalizedTranscript: payload.transcript,
          participants: payload.participants,
          meetingTemplate: payload.meetingTemplate ?? "generic",
          outputLanguage: outLang
        })
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "meeting_outcomes",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            executiveBriefMarkdown: { type: "string", minLength: 40 },
            sentiment: { type: "string", enum: ["positive", "neutral", "negative"] }
          },
          required: ["executiveBriefMarkdown", "sentiment"]
        },
        strict: true
      }
    }
  } satisfies ResponseCreateParamsNonStreaming);
  const candidate = JSON.parse(response.output_text) as {
    executiveBriefMarkdown: string;
    sentiment: "positive" | "neutral" | "negative";
  };
  const parsed = AnalysisOutputSchema.parse({
    ...candidate,
    artifacts: [],
    actions: [],
    artifactStatus: {
      diagrams: artifactStatus("pending"),
      actions: artifactStatus("pending")
    },
    normalizedTranscript: payload.transcript,
    participants: payload.participants,
    transcriptSegments: payload.transcriptSegments ?? []
  });
  await completeJob(payload.jobId, parsed);
  await writeAudit(payload.jobId, "pipeline-completed", { state: "completed" });
}
