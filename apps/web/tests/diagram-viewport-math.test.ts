import { describe, expect, it } from "vitest";
import {
  centerBBoxInViewport,
  clampDiagramScale,
  DIAGRAM_SCALE_MAX,
  DIAGRAM_SCALE_MIN,
  fitDiagramToContainer,
  panAfterZoomAtPoint
} from "../lib/diagram-viewport-math";

describe("diagram-viewport-math", () => {
  it("clamps scale", () => {
    expect(clampDiagramScale(0.05)).toBe(DIAGRAM_SCALE_MIN);
    expect(clampDiagramScale(10)).toBe(DIAGRAM_SCALE_MAX);
    expect(clampDiagramScale(1)).toBe(1);
  });

  it("panAfterZoomAtPoint keeps focal point (translate then scale, origin 0,0)", () => {
    const next = panAfterZoomAtPoint({
      pointerX: 100,
      pointerY: 100,
      tx: 0,
      ty: 0,
      scale: 1,
      nextScale: 2
    });
    expect(next.tx).toBe(-100);
    expect(next.ty).toBe(-100);
  });

  it("fitDiagramToContainer centers content", () => {
    const bbox = { x: 10, y: 20, width: 200, height: 100 };
    const { tx, ty, scale } = fitDiagramToContainer({
      bbox,
      containerWidth: 500,
      containerHeight: 400,
      padding: 0
    });
    expect(scale).toBe(1);
    expect(tx).toBe((500 - 200) / 2 - 10);
    expect(ty).toBe((400 - 100) / 2 - 20);
  });

  it("centerBBoxInViewport places bbox center at viewport center", () => {
    const bbox = { x: 0, y: 0, width: 100, height: 100 };
    const { tx, ty } = centerBBoxInViewport({
      bbox,
      containerWidth: 500,
      containerHeight: 400,
      scale: 1
    });
    expect(tx).toBe(250 - 50);
    expect(ty).toBe(200 - 50);
  });
});
