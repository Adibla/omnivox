import { describe, expect, it } from "vitest";
import { normalizeMermaidCodeForRender } from "../lib/mermaid-guard";

describe("normalizeMermaidCodeForRender", () => {
  it("fixes labeled edges that use --| instead of -->|", () => {
    const raw = "flowchart TD\n  H --|Sì| L[Delibere]";
    expect(normalizeMermaidCodeForRender(raw)).toBe("flowchart TD\n  H -->|Sì| L[Delibere]");
  });

  it("does not alter ---| (three dashes)", () => {
    const raw = "flowchart TD\n  A ---|x| B";
    expect(normalizeMermaidCodeForRender(raw)).toBe(raw.trim());
  });

  it("does not alter existing -->| edges", () => {
    const raw = "flowchart TD\n  M -->|Yes| N[Done]";
    expect(normalizeMermaidCodeForRender(raw)).toBe(raw.trim());
  });
});
