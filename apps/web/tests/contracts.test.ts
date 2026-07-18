import { describe, expect, it } from "vitest";
import {
  PresignRequestSchema,
  AnalysisOutputSchema,
  PipelineStartRequestSchema,
} from "@omnivox/shared";

describe("contract schemas", () => {
  it("validates presign request", () => {
    const value = PresignRequestSchema.parse({
      tenantId: "acme-team",
      meetingId: "meeting_001",
      contentType: "audio/ogg",
      audioFormat: "ogg",
      contentLength: 1024,
      sha256: "a".repeat(64),
      retentionClass: "standard",
    });
    expect(value.tenantId).toBe("acme-team");
  });

  it("rejects presign when audioFormat and contentType disagree", () => {
    // mp3 is the only audioFormat the client is allowed to declare; if it
    // arrives with a different content-type the superRefine must reject.
    expect(() =>
      PresignRequestSchema.parse({
        tenantId: "acme-team",
        meetingId: "meeting_001",
        contentType: "audio/wav",
        audioFormat: "mp3",
        contentLength: 1024,
        sha256: "a".repeat(64),
        retentionClass: "standard",
      }),
    ).toThrowError(/audioFormat is not compatible with contentType/);
  });

  it("rejects invalid pipeline start", () => {
    expect(() =>
      PipelineStartRequestSchema.parse({
        meetingId: "m",
        objectKey: "",
        languageHint: "it",
      }),
    ).toThrowError();
  });

  it("applies defaults for meeting template and automatic output language", () => {
    const value = PipelineStartRequestSchema.parse({
      meetingId: "meeting_001",
      objectKey: "tenant/2026/01/x.ogg",
    });
    expect(value.meetingTemplate).toBe("generic");
    expect(value.outputLanguage).toBe("auto");
  });

  it("accepts a transcript-only start with no object key", () => {
    const value = PipelineStartRequestSchema.parse({
      meetingId: "meeting_001",
      transcriptText: "a".repeat(40),
    });
    expect(value.objectKey).toBeUndefined();
    expect(value.transcriptText).toHaveLength(40);
  });

  it("rejects a start with neither object key nor transcript", () => {
    expect(() =>
      PipelineStartRequestSchema.parse({
        meetingId: "meeting_001",
      }),
    ).toThrowError();
  });

  it("enforces analysis output shape", () => {
    expect(() =>
      AnalysisOutputSchema.parse({
        executiveBriefMarkdown: "too short",
        sentiment: "neutral",
      }),
    ).toThrowError();
  });

  it("accepts a base analysis before on-demand artifacts", () => {
    const value = AnalysisOutputSchema.parse({
      executiveBriefMarkdown:
        "# Brief\n\nContenuto sufficiente per rappresentare una sintesi base della riunione.",
      sentiment: "neutral",
      normalizedTranscript: "x".repeat(40),
    });
    expect(value.actions).toEqual([]);
    expect(value.artifacts).toEqual([]);
    expect(value.artifactStatus.actions.state).toBe("pending");
    expect(value.artifactStatus.diagrams.state).toBe("pending");
  });

  it("accepts optional transcript fields on analysis output", () => {
    const value = AnalysisOutputSchema.parse({
      executiveBriefMarkdown:
        "# Brief\n\nContenuto sufficientemente lungo per superare la validazione minima.",
      artifacts: [
        {
          title: "Diagram one",
          diagramType: "flowchart",
          mermaidCode: "flowchart TD\n  A --> B[Example node with enough chars]",
        },
      ],
      actions: [
        {
          title: "Follow up task title here",
          owner: "Team",
          dueDate: null,
          priority: "medium",
          risk: "low",
          actionType: "follow_up",
          id: "action-test",
          status: "in_progress",
        },
      ],
      sentiment: "neutral",
      normalizedTranscript: "x".repeat(40),
      participants: ["Alice", "Bob"],
      transcriptSegments: [{ startSec: 0, endSec: 2.5, text: "Hello team." }],
    });
    expect(value.participants?.length).toBe(2);
    expect(value.transcriptSegments?.[0]?.startSec).toBe(0);
    expect(value.actions[0]?.actionType).toBe("follow_up");
    expect(value.actions[0]?.status).toBe("in_progress");
  });
});
