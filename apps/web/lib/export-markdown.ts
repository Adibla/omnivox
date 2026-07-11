import type { AnalysisOutput } from "@omnivox/shared";

export function buildMeetingExportMarkdown(input: { meetingId: string; result: AnalysisOutput }): string {
  const { meetingId, result } = input;
  const lines: string[] = [
    `# OmniVox — ${meetingId}`,
    "",
    `**Sentiment:** ${result.sentiment}`,
    "",
    "## Executive brief",
    "",
    result.executiveBriefMarkdown,
    "",
    "## Azioni",
    ""
  ];
  for (const action of result.actions) {
    const due = action.dueDate ? new Date(action.dueDate).toISOString() : "—";
    lines.push(
      `- **${action.title}** — Stato: ${action.status} — Tipo: ${action.actionType} — Owner: ${action.owner} — Priorità: ${action.priority} — Rischio: ${action.risk} — Scadenza: ${due}`,
      ""
    );
  }
  if (result.participants?.length) {
    lines.push("## Partecipanti", "", result.participants.map((p) => `- ${p}`).join("\n"), "", "");
  }
  if (result.normalizedTranscript) {
    lines.push("## Trascrizione", "", result.normalizedTranscript, "", "");
  }
  lines.push("## Diagrammi (Mermaid)", "");
  for (const art of result.artifacts) {
    lines.push(`### ${art.title} (${art.diagramType})`, "", "```mermaid", art.mermaidCode, "```", "");
  }
  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/markdown;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
