export const DIAGRAM_SCALE_MIN = 0.2;
export const DIAGRAM_SCALE_MAX = 4;

export function clampDiagramScale(scale: number, min = DIAGRAM_SCALE_MIN, max = DIAGRAM_SCALE_MAX): number {
  return Math.min(max, Math.max(min, scale));
}

/** Pan+zoom: keep point under cursor stable when scale changes (top-left origin, CSS order translate then scale). */
export function panAfterZoomAtPoint(input: {
  pointerX: number;
  pointerY: number;
  tx: number;
  ty: number;
  scale: number;
  nextScale: number;
}): { tx: number; ty: number } {
  const { pointerX, pointerY, tx, ty, scale, nextScale } = input;
  if (scale <= 0 || nextScale <= 0) {
    return { tx, ty };
  }
  const ratio = nextScale / scale;
  return {
    tx: pointerX - (pointerX - tx) * ratio,
    ty: pointerY - (pointerY - ty) * ratio
  };
}

export type DiagramBBox = Pick<DOMRect, "x" | "y" | "width" | "height">;

/** Fit SVG user bbox into container with padding; returns translate and scale (translate before scale). */
export function fitDiagramToContainer(input: {
  bbox: DiagramBBox;
  containerWidth: number;
  containerHeight: number;
  padding?: number;
}): { tx: number; ty: number; scale: number } {
  const pad = input.padding ?? 16;
  const cw = Math.max(0, input.containerWidth - pad * 2);
  const ch = Math.max(0, input.containerHeight - pad * 2);
  const bw = Math.max(input.bbox.width, 1);
  const bh = Math.max(input.bbox.height, 1);
  const s = Math.min(cw / bw, ch / bh, 1);
  const tx = pad + (cw - bw * s) / 2 - input.bbox.x * s;
  const ty = pad + (ch - bh * s) / 2 - input.bbox.y * s;
  return { tx, ty, scale: s };
}

/**
 * With transform `translate(tx, ty) scale(scale)` and origin top-left, place the center of `bbox`
 * (in SVG user space) at the center of the viewport.
 */
export function centerBBoxInViewport(input: {
  bbox: DiagramBBox;
  containerWidth: number;
  containerHeight: number;
  scale: number;
}): { tx: number; ty: number } {
  const cx = input.bbox.x + input.bbox.width / 2;
  const cy = input.bbox.y + input.bbox.height / 2;
  return {
    tx: input.containerWidth / 2 - cx * input.scale,
    ty: input.containerHeight / 2 - cy * input.scale
  };
}
