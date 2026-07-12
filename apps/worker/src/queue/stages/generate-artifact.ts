import { AnalysisOutputSchema, type PipelineMessage } from "@omnivox/shared";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { getJob, setArtifactGenerationStatus, writeAudit } from "../db";
import { outputLanguageInstruction } from "./helpers";
import type { StageContext } from "./types";

export type GenerationInput = {
  transcript: string;
  participants: string[];
  outLang: string;
};

type GenerationSpec = {
  kind: "actions" | "diagrams";
  buildRequest: (input: GenerationInput) => ResponseCreateParamsNonStreaming;
  /** Maps the model's JSON text to rows; the save function validates them. */
  parseOutput: (outputText: string) => unknown;
  save: (jobId: string, parsed: unknown) => Promise<void>;
  fallbackError: string;
};

// Failures land on the artifact status, not on the job: a failed generation never takes the report down.
export async function runArtifactGeneration(
  payload: PipelineMessage,
  context: StageContext,
  spec: GenerationSpec,
) {
  const job = await getJob(payload.jobId);
  if (!job) {
    throw new Error(`Unknown job ${payload.jobId}.`);
  }
  const result = AnalysisOutputSchema.parse(job.result);
  const transcript = result.normalizedTranscript;
  if (!transcript) {
    throw new Error(`Missing normalized transcript for ${spec.kind} generation.`);
  }
  await setArtifactGenerationStatus(payload.jobId, spec.kind, "generating");
  try {
    const response = await context.openai.responses.create(
      spec.buildRequest({
        transcript,
        participants: result.participants ?? [],
        outLang: outputLanguageInstruction(payload.outputLanguage),
      }),
    );
    await spec.save(payload.jobId, spec.parseOutput(response.output_text));
    await writeAudit(payload.jobId, "pipeline-step", { state: `${spec.kind}-completed` });
  } catch (error) {
    await setArtifactGenerationStatus(
      payload.jobId,
      spec.kind,
      "failed",
      error instanceof Error ? error.message : spec.fallbackError,
    );
    await writeAudit(payload.jobId, "pipeline-step", { state: `${spec.kind}-failed` });
  }
}
