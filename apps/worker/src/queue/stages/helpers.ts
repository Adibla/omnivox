import { createHash } from "node:crypto";

export function sanitizeMermaidCode(code: string) {
  return code.replace(/[<>]/g, "").replace(/\r\n/g, "\n").trim();
}

export function repairMermaidCode(input: {
  diagramType: "mindmap" | "flowchart";
  mermaidCode: string;
}) {
  const sanitized = sanitizeMermaidCode(input.mermaidCode);
  if (input.diagramType === "flowchart") {
    return sanitized
      .replace(/\s--\s/g, " --> ")
      .replace(/\s-\.\s/g, " -.-> ")
      .replace(/\s==\s/g, " ==> ");
  }
  return sanitized;
}

export function meetingTemplateInstruction(template: string | undefined): string {
  switch (template) {
    case "standup":
      return "Daily stand-up: focus on blockers, progress since last meeting, plan until next sync.";
    case "board":
      return "Board or steering meeting: decisions, governance, KPIs, formal motions.";
    case "client":
      return "Client-facing meeting: commitments, scope, risks, next steps with the customer.";
    case "retro":
      return "Retrospective: what went well, improvements, action items for the team process.";
    default:
      return "General business meeting: capture decisions, owners, and follow-ups.";
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function artifactStatus(
  state: "pending" | "generating" | "completed" | "failed",
  error?: string,
) {
  return {
    state,
    ...(error ? { error } : {}),
    updatedAt: nowIso(),
  };
}

export function outputLanguageInstruction(outputLanguage: string | undefined) {
  return outputLanguage === "auto" || !outputLanguage
    ? "the same language as the transcript"
    : outputLanguage;
}

export function actionId(
  action: { actionType: string; title: string; owner: string; dueDate?: string | null },
  index: number,
) {
  const hash = createHash("sha256")
    .update(`${index}:${action.actionType}:${action.title}:${action.owner}:${action.dueDate ?? ""}`)
    .digest("hex")
    .slice(0, 16);
  return `action-${hash}`;
}
