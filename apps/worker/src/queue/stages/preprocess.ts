import type { PipelineMessage } from "@omnivox/shared";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { writeAudit } from "../db";
import { updateJobState } from "../db";
import { buildQueueJobId } from "../job-ids";
import { meetingTemplateInstruction } from "./helpers";
import type { StageContext } from "./types";

export async function processPreprocess(payload: PipelineMessage, context: StageContext) {
  if (!payload.transcript) {
    throw new Error("Missing transcript for preprocess stage.");
  }
  await updateJobState(payload.jobId, "preprocessing");
  const templateLine = meetingTemplateInstruction(payload.meetingTemplate);
  const response = await context.openai.responses.create({
    model: context.workerEnv.MODEL_PREPROCESS,
    input: [
      {
        role: "system",
        content: `You normalize meeting transcripts. Context: ${templateLine} Return strict JSON only: normalizedTranscript (clean, readable) and participants (array of speaker labels or roles inferred from the text).`,
      },
      { role: "user", content: payload.transcript },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "transcript_preprocess",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            normalizedTranscript: { type: "string", minLength: 40 },
            participants: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          },
          required: ["normalizedTranscript", "participants"],
        },
        strict: true,
      },
    },
  } satisfies ResponseCreateParamsNonStreaming);
  const parsed = JSON.parse(response.output_text) as {
    normalizedTranscript: string;
    participants: string[];
  };
  await writeAudit(payload.jobId, "pipeline-step", { state: "preprocessing" });
  await context.pipelineQueue.add(
    "reasoning",
    {
      ...payload,
      transcript: parsed.normalizedTranscript,
      participants: parsed.participants,
      transcriptSegments: payload.transcriptSegments ?? [],
    },
    {
      jobId: buildQueueJobId([payload.jobId, "reasoning"]),
      attempts: 3,
      backoff: { type: "exponential", delay: 500 },
    },
  );
}
