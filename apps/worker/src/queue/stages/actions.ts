import type { PipelineMessage } from "@omnivox/shared";
import { saveGeneratedActions } from "../db";
import { runArtifactGeneration } from "./generate-artifact";
import { actionId } from "./helpers";
import type { StageContext } from "./types";

type RawAction = {
  title: string;
  owner: string;
  dueDate?: string | null;
  priority: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  actionType: "task" | "decision" | "risk" | "follow_up";
};

function parseOutput(outputText: string) {
  const candidate = JSON.parse(outputText) as { actions: RawAction[] };
  return candidate.actions.map((action, index) => {
    const parsedDate = action.dueDate ? new Date(action.dueDate) : null;
    const dueDate =
      parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;
    return { ...action, id: actionId(action, index), dueDate, status: "todo" as const };
  });
}

export async function processActions(payload: PipelineMessage, context: StageContext) {
  await runArtifactGeneration(payload, context, {
    kind: "actions",
    buildRequest: ({ transcript, participants, outLang }) => ({
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
All user-facing action titles and generic owner roles MUST be written in: ${outLang}. Keep proper names unchanged.`,
        },
        {
          role: "user",
          content: JSON.stringify({ normalizedTranscript: transcript, participants }),
        },
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
                    actionType: {
                      type: "string",
                      enum: ["task", "decision", "risk", "follow_up"],
                    },
                  },
                  required: ["title", "owner", "dueDate", "priority", "risk", "actionType"],
                },
              },
            },
            required: ["actions"],
          },
          strict: true,
        },
      },
    }),
    parseOutput,
    save: saveGeneratedActions,
    fallbackError: "Action generation failed.",
  });
}
