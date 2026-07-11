import { AnalysisOutputSchema, type PipelineMessage } from "@omnivox/shared";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { getJob, updateJobResult, writeAudit } from "../db";
import { artifactStatus, outputLanguageInstruction, repairMermaidCode } from "./helpers";
import type { StageContext } from "./types";

export async function processDiagrams(payload: PipelineMessage, context: StageContext) {
  const job = await getJob(payload.jobId);
  if (!job) {
    throw new Error(`Unknown job ${payload.jobId}.`);
  }
  const result = AnalysisOutputSchema.parse(job.result);
  const transcript = result.normalizedTranscript;
  if (!transcript) {
    throw new Error("Missing normalized transcript for diagram generation.");
  }
  await updateJobResult(payload.jobId, {
    ...result,
    artifactStatus: {
      ...result.artifactStatus,
      diagrams: artifactStatus("generating"),
    },
  });
  try {
    const outLang = outputLanguageInstruction(payload.outputLanguage);
    const response = await context.openai.responses.create({
      model: context.workerEnv.MODEL_REASONING,
      input: [
        {
          role: "system",
          content: `Return strict JSON only with artifacts (Mermaid diagrams). Generate one mindmap and one flowchart when possible.
All user-facing text in artifact titles and Mermaid node labels MUST be written in: ${outLang}.
Keep labels short and readable. For flowcharts, split longer labels with <br/>; never put paragraphs inside nodes.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            normalizedTranscript: transcript,
            participants: result.participants ?? [],
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meeting_diagrams",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              artifacts: {
                type: "array",
                minItems: 1,
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
            },
            required: ["artifacts"],
          },
          strict: true,
        },
      },
    } satisfies ResponseCreateParamsNonStreaming);
    const candidate = JSON.parse(response.output_text) as {
      artifacts: Array<{
        title: string;
        diagramType: "mindmap" | "flowchart";
        mermaidCode: string;
      }>;
    };
    const latestJob = await getJob(payload.jobId);
    if (!latestJob) {
      throw new Error(`Unknown job ${payload.jobId}.`);
    }
    const latest = AnalysisOutputSchema.parse(latestJob.result);
    const parsed = AnalysisOutputSchema.parse({
      ...latest,
      artifacts: candidate.artifacts.map((artifact) => ({
        ...artifact,
        mermaidCode: repairMermaidCode({
          diagramType: artifact.diagramType,
          mermaidCode: artifact.mermaidCode,
        }),
      })),
      artifactStatus: {
        ...latest.artifactStatus,
        diagrams: artifactStatus("completed"),
      },
    });
    await updateJobResult(payload.jobId, parsed);
    await writeAudit(payload.jobId, "pipeline-step", { state: "diagrams-completed" });
  } catch (error) {
    const latestJob = await getJob(payload.jobId);
    if (!latestJob) {
      throw new Error(`Unknown job ${payload.jobId}.`);
    }
    const latest = AnalysisOutputSchema.parse(latestJob.result);
    await updateJobResult(payload.jobId, {
      ...latest,
      artifactStatus: {
        ...latest.artifactStatus,
        diagrams: artifactStatus(
          "failed",
          error instanceof Error ? error.message : "Diagram generation failed.",
        ),
      },
    });
    await writeAudit(payload.jobId, "pipeline-step", { state: "diagrams-failed" });
  }
}
