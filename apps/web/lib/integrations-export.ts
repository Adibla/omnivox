import type { AnalysisOutput } from "@omnivox/shared";
import { describeAction, exportLabels, formatExportDate } from "./export-labels";

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const SLACK_STRINGS = {
  it: {
    briefExcerpt: "Brief (estratto)",
    topActions: "Azioni principali",
    due: "scad.",
    priority: "prio",
    more: (count: number) => `…e altre ${count} azioni (vedi export completo).`,
  },
  en: {
    briefExcerpt: "Brief (excerpt)",
    topActions: "Top actions",
    due: "due",
    priority: "prio",
    more: (count: number) => `…and ${count} more actions (see the full export).`,
  },
};

/** Formatted text to paste into Slack / Teams. */
export function buildSlackSummary(input: {
  title: string;
  result: AnalysisOutput;
  locale: string;
}): string {
  const { title, result, locale } = input;
  const strings = locale === "en" ? SLACK_STRINGS.en : SLACK_STRINGS.it;
  const lines: string[] = [
    `*${title}* — OmniVox`,
    "",
    `*Sentiment:* ${result.sentiment}`,
    "",
    `*${strings.briefExcerpt}*`,
    result.executiveBriefMarkdown.slice(0, 1200) +
      (result.executiveBriefMarkdown.length > 1200 ? "…" : ""),
    "",
    `*${strings.topActions}*`,
  ];
  for (const action of result.actions.slice(0, 8)) {
    const described = describeAction(action, locale);
    const due = action.dueDate ? formatExportDate(action.dueDate, locale) : "—";
    lines.push(
      `• [${described.status}] [${described.type}] ${action.title} — @${action.owner} — ${strings.due} ${due} — ${strings.priority} ${described.priority}`,
    );
  }
  if (result.actions.length > 8) {
    lines.push(`_${strings.more(result.actions.length - 8)}_`);
  }
  return lines.join("\n");
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// RFC 5545 §3.1: content lines longer than 75 octets must be folded with
// CRLF + a single space. Split on character boundaries so multi-byte
// characters are never cut in half.
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) {
    return line;
  }
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    // Continuation lines begin with a space, which counts toward the limit.
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + charBytes > limit) {
      parts.push(current);
      current = char;
      currentBytes = charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts.join("\r\n ");
}

// Deterministic slug so re-exporting the same meeting yields stable event
// UIDs (calendar clients update instead of duplicating), while different
// meetings never collide.
function icsUidSlug(title: string): string {
  let hash = 5381;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 33) ^ title.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/** An .ics file with one event per action that has a due date. */
export function buildActionsIcs(input: {
  title: string;
  result: AnalysisOutput;
  locale: string;
}): string {
  const { title, result, locale } = input;
  const labels = exportLabels(locale);
  const slug = icsUidSlug(title);
  const stamp = formatIcsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OmniVox//Actions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + escapeIcsText(`OmniVox — ${title}`),
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
    const uid = `omnivox-${slug}-${seq}-${start.getTime()}@omnivox`;
    seq += 1;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const described = describeAction(action, locale);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcsText(action.title)}`,
      `DESCRIPTION:${escapeIcsText(
        `${labels.fields.status}: ${described.status}. ${labels.fields.type}: ${described.type}. ${labels.fields.owner}: ${action.owner}. ${labels.fields.priority}: ${described.priority}. ${labels.fields.risk}: ${described.risk}.`,
      )}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n");
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
