import type { PipelineMessage } from "@omnivox/shared";
import { saveGeneratedArtifacts } from "../db";
import { runArtifactGeneration } from "./generate-artifact";
import { repairMermaidCode } from "./helpers";
import type { StageContext } from "./types";

type RawArtifact = {
  title: string;
  diagramType: "mindmap" | "flowchart";
  mermaidCode: string;
};

function parseOutput(outputText: string) {
  const candidate = JSON.parse(outputText) as { artifacts: RawArtifact[] };
  return candidate.artifacts.map((artifact) => ({
    ...artifact,
    mermaidCode: repairMermaidCode({
      diagramType: artifact.diagramType,
      mermaidCode: artifact.mermaidCode,
    }),
  }));
}

export async function processDiagrams(payload: PipelineMessage, context: StageContext) {
  await runArtifactGeneration(payload, context, {
    kind: "diagrams",
    buildRequest: ({ transcript, participants, outLang }) => ({
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
          content: JSON.stringify({ normalizedTranscript: transcript, participants }),
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
    }),
    parseOutput,
    save: saveGeneratedArtifacts,
    fallbackError: "Diagram generation failed.",
  });
}
