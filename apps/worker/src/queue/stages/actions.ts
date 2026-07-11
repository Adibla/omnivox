import { AnalysisOutputSchema, type PipelineMessage } from "@omnivox/shared";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { getJob, updateJobResult, writeAudit } from "../db";
import { actionId, artifactStatus, outputLanguageInstruction } from "./helpers";
import type { StageContext } from "./types";

export async function processActions(payload: PipelineMessage, context: StageContext) {
  const job = await getJob(payload.jobId);
  if (!job) {
    throw new Error(`Unknown job ${payload.jobId}.`);
  }
  const result = AnalysisOutputSchema.parse(job.result);
  const transcript = result.normalizedTranscript;
  if (!transcript) {
    throw new Error("Missing normalized transcript for action generation.");
  }
  await updateJobResult(payload.jobId, {
    ...result,
    artifactStatus: {
      ...result.artifactStatus,
      actions: artifactStatus("generating")
    }
  });
  try {
    const outLang = outputLanguageInstruction(payload.outputLanguage);
    const response = await context.openai.responses.create({
      model: context.workerEnv.MODEL_REASONING,
      input: [
        {
          role: "system",
          content: `Return strict JSON only with actions.
Extract a useful operating plan, not only literal tasks. Include:
- explicit tasks and follow-ups;
- operational decisions stated or strongly implied;
- risks that need active monitoring;
- clearly derivable next steps.
Use actionType: task, decision, risk, or follow_up.
Use owner from the transcript when present; otherwise use "Da assegnare" for Italian output or "Unassigned" for English output.
Do not invent unrelated work. Prefer 4-8 high-signal items when the transcript supports them.
All user-facing action titles and generic owner roles MUST be written in: ${outLang}. Keep proper names unchanged.`
        },
        {
          role: "user",
          content: JSON.stringify({
            normalizedTranscript: transcript,
            participants: result.participants ?? []
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meeting_actions",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              actions: {
                type: "array",
                minItems: 1,
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
                    actionType: { type: "string", enum: ["task", "decision", "risk", "follow_up"] }
                  },
                  required: ["title", "owner", "dueDate", "priority", "risk", "actionType"]
                }
              }
            },
            required: ["actions"]
          },
          strict: true
        }
      }
    } satisfies ResponseCreateParamsNonStreaming);
    const candidate = JSON.parse(response.output_text) as {
      actions: Array<{
        title: string;
        owner: string;
        dueDate?: string | null;
        priority: "low" | "medium" | "high";
        risk: "low" | "medium" | "high";
        actionType: "task" | "decision" | "risk" | "follow_up";
      }>;
    };
    const latestJob = await getJob(payload.jobId);
    if (!latestJob) {
      throw new Error(`Unknown job ${payload.jobId}.`);
    }
    const latest = AnalysisOutputSchema.parse(latestJob.result);
    const parsed = AnalysisOutputSchema.parse({
      ...latest,
      actions: candidate.actions.map((action, index) => {
        if (!action.dueDate) {
          return { ...action, id: actionId(action, index), dueDate: null, status: "todo" as const };
        }
        const parsedDate = new Date(action.dueDate);
        return Number.isNaN(parsedDate.getTime())
          ? { ...action, id: actionId(action, index), dueDate: null, status: "todo" as const }
          : { ...action, id: actionId(action, index), dueDate: parsedDate.toISOString(), status: "todo" as const };
      }),
      artifactStatus: {
        ...latest.artifactStatus,
        actions: artifactStatus("completed")
      }
    });
    await updateJobResult(payload.jobId, parsed);
    await writeAudit(payload.jobId, "pipeline-step", { state: "actions-completed" });
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
        actions: artifactStatus("failed", error instanceof Error ? error.message : "Action generation failed.")
      }
    });
    await writeAudit(payload.jobId, "pipeline-step", { state: "actions-failed" });
  }
}
