import { MermaidArtifactSchema } from "@omnivox/shared";

const diagramTypeStart: Record<string, RegExp> = {
  mindmap: /^mindmap/m,
  flowchart: /^flowchart|^graph/m
};

export async function validateMermaidArtifact(input: unknown) {
  const parsed = MermaidArtifactSchema.parse(input);
  const matcher = diagramTypeStart[parsed.diagramType];
  if (!matcher.test(parsed.mermaidCode.trim())) {
    throw new Error(`Mermaid code does not match ${parsed.diagramType} syntax.`);
  }
  const lines = parsed.mermaidCode.split("\n").map((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("Mermaid code is too short.");
  }

  const hasNodeDefinition = lines.some((line) => /(\[.*\]|\(.*\)|-->)/.test(line));
  if (!hasNodeDefinition) {
    throw new Error("Mermaid code does not contain valid node or edge definitions.");
  }
  return parsed;
}

export function sanitizeMermaidCode(mermaidCode: string) {
  return mermaidCode
    .replace(/[<>]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

/**
 * Fixes common LLM mistakes before browser render.
 * Labeled directed edges must use `-->|label|`; `--|label|` is a lexical error in flowcharts.
 */
export function normalizeMermaidCodeForRender(mermaidCode: string): string {
  let out = mermaidCode.replace(/\r\n/g, "\n").trim();
  // Not `---|` (thick / undirected segment): only two dashes before `|`
  out = out.replace(/(?<![-])(\s*)--\|/g, "$1-->|");
  return out;
}
