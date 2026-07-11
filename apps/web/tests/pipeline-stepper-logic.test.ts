import { describe, expect, it } from "vitest";
import { PIPELINE_PHASES, pipelinePhaseStatus } from "../lib/pipeline-ui";

describe("pipelinePhaseStatus", () => {
  it("marks earlier phases done, the current one active, and later ones upcoming", () => {
    expect(pipelinePhaseStatus("queued", "preprocessing")).toBe("done");
    expect(pipelinePhaseStatus("transcribing", "preprocessing")).toBe("done");
    expect(pipelinePhaseStatus("preprocessing", "preprocessing")).toBe("active");
    expect(pipelinePhaseStatus("reasoning", "preprocessing")).toBe("upcoming");
  });

  it("marks every phase done when the job is completed", () => {
    for (const phase of PIPELINE_PHASES) {
      expect(pipelinePhaseStatus(phase, "completed")).toBe("done");
    }
  });

  it("falls back to an active first phase for unknown states", () => {
    expect(pipelinePhaseStatus("queued", "something-new")).toBe("active");
    expect(pipelinePhaseStatus("reasoning", "something-new")).toBe("upcoming");
  });
});
