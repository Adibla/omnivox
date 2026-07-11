import type { AnalysisOutput } from "@omnivox/shared";
import { describeAction, exportLabels } from "./export-labels";

export function buildMeetingExportMarkdown(input: {
  meetingId: string;
  result: AnalysisOutput;
  locale: string;
}): string {
  const { meetingId, result, locale } = input;
  const labels = exportLabels(locale);
  const lines: string[] = [
    `# OmniVox — ${meetingId}`,
    "",
    `**Sentiment:** ${result.sentiment}`,
    "",
    "## Executive brief",
    "",
    result.executiveBriefMarkdown,
    "",
    `## ${labels.sections.actions}`,
    "",
  ];
  for (const action of result.actions) {
    const described = describeAction(action, locale);
    lines.push(
      `- **${action.title}** — ${labels.fields.status}: ${described.status} — ${labels.fields.type}: ${described.type} — ${labels.fields.owner}: ${action.owner} — ${labels.fields.priority}: ${described.priority} — ${labels.fields.risk}: ${described.risk} — ${labels.fields.due}: ${described.due}`,
      "",
    );
  }
  if (result.participants?.length) {
    lines.push(
      `## ${labels.sections.participants}`,
      "",
      result.participants.map((p) => `- ${p}`).join("\n"),
      "",
      "",
    );
  }
  if (result.normalizedTranscript) {
    lines.push(`## ${labels.sections.transcript}`, "", result.normalizedTranscript, "", "");
  }
  lines.push(`## ${labels.sections.diagrams}`, "");
  for (const art of result.artifacts) {
    lines.push(
      `### ${art.title} (${art.diagramType})`,
      "",
      "```mermaid",
      art.mermaidCode,
      "```",
      "",
    );
  }
  return lines.join("\n");
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/markdown;charset=utf-8",
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
