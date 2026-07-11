import { describe, expect, it } from "vitest";
import { AnalysisOutputSchema, type AnalysisOutput } from "@omnivox/shared";
import { buildMeetingExportMarkdown } from "../lib/export-markdown";
import { buildActionsIcs, buildSlackSummary } from "../lib/integrations-export";

const result: AnalysisOutput = AnalysisOutputSchema.parse({
  executiveBriefMarkdown: "A brief long enough to satisfy the schema minimum length for tests.",
  sentiment: "neutral",
  actions: [
    {
      title: "Prepare the quarterly budget review; align with finance, then share",
      owner: "Dana",
      dueDate: "2026-08-01T09:00:00.000Z",
      priority: "high",
      risk: "medium",
      actionType: "follow_up",
      status: "in_progress",
    },
  ],
  artifacts: [],
  participants: ["Dana", "Luca"],
});

describe("buildMeetingExportMarkdown", () => {
  it("localizes section headings and enum values in English", () => {
    const md = buildMeetingExportMarkdown({ meetingId: "m1", result, locale: "en" });
    expect(md).toContain("## Actions");
    expect(md).toContain("Status: In progress");
    expect(md).toContain("Type: Follow-up");
    expect(md).toContain("Priority: High");
    expect(md).not.toMatch(/in_progress|follow_up/);
  });

  it("localizes in Italian", () => {
    const md = buildMeetingExportMarkdown({ meetingId: "m1", result, locale: "it" });
    expect(md).toContain("## Azioni");
    expect(md).toContain("Stato: In corso");
    expect(md).toContain("Priorità: Alta");
  });
});

describe("buildSlackSummary", () => {
  it("uses readable localized values instead of raw enums", () => {
    const text = buildSlackSummary({ title: "Weekly sync", result, locale: "en" });
    expect(text).toContain("[In progress]");
    expect(text).not.toContain("in_progress");
  });
});

describe("buildActionsIcs", () => {
  it("folds every content line to at most 75 octets", () => {
    const ics = buildActionsIcs({
      title: "Un titolo molto lungo così pieghiamo — àèéìòù",
      result,
      locale: "it",
    });
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("keeps UIDs stable per meeting and distinct across meetings", () => {
    const first = buildActionsIcs({ title: "Meeting A", result, locale: "en" });
    const again = buildActionsIcs({ title: "Meeting A", result, locale: "en" });
    const other = buildActionsIcs({ title: "Meeting B", result, locale: "en" });
    const uidOf = (ics: string) => ics.split("\r\n").find((l) => l.startsWith("UID:"));
    expect(uidOf(first)).toBe(uidOf(again));
    expect(uidOf(first)).not.toBe(uidOf(other));
  });

  it("escapes reserved characters in text fields", () => {
    const withReserved = AnalysisOutputSchema.parse({
      ...result,
      actions: [{ ...result.actions[0], title: "Fix a; test, and\nship" }],
    });
    const ics = buildActionsIcs({ title: "t", result: withReserved, locale: "en" });
    expect(ics).toContain("Fix a\\; test\\, and\\nship");
  });
});
