import type { AnalysisOutput } from "@omnivox/shared";

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Testo formattato per incollare in Slack / Teams */
export function buildSlackSummary(input: { title: string; result: AnalysisOutput }): string {
  const { title, result } = input;
  const lines: string[] = [
    `*${title}* — OmniVox`,
    "",
    `*Sentiment:* ${result.sentiment}`,
    "",
    "*Brief (estratto)*",
    result.executiveBriefMarkdown.slice(0, 1200) + (result.executiveBriefMarkdown.length > 1200 ? "…" : ""),
    "",
    "*Azioni principali*"
  ];
  for (const a of result.actions.slice(0, 8)) {
    const due = a.dueDate ? new Date(a.dueDate).toLocaleDateString("it-IT") : "—";
    lines.push(`• [${a.status}] [${a.actionType}] ${a.title} — @${a.owner} — scad. ${due} — prio ${a.priority}`);
  }
  if (result.actions.length > 8) {
    lines.push(`_…e altre ${result.actions.length - 8} azioni (vedi export completo)._`);
  }
  return lines.join("\n");
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Un file .ics con eventi per le azioni che hanno scadenza */
export function buildActionsIcs(input: { title: string; result: AnalysisOutput }): string {
  const { title, result } = input;
  const now = new Date();
  const stamp = formatIcsDate(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OmniVox//Actions//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + escapeIcsText(`OmniVox — ${title}`)
  ];
  let seq = 0;
  for (const action of result.actions) {
    if (!action.dueDate) {
      continue;
    }
    const start = new Date(action.dueDate);
    if (Number.isNaN(start.getTime())) {
      continue;
    }
    const uid = `omnivox-${seq}-${start.getTime()}@local`;
    seq += 1;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcsText(action.title)}`,
      `DESCRIPTION:${escapeIcsText(`Stato: ${action.status}. Tipo: ${action.actionType}. Owner: ${action.owner}. Priorità: ${action.priority}. Rischio: ${action.risk}.`)}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function formatIcsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}
