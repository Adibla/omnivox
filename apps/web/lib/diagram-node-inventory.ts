function dedupeGroups(groups: SVGGElement[]): SVGGElement[] {
  const seen = new Set<SVGGElement>();
  const out: SVGGElement[] = [];
  for (const g of groups) {
    if (seen.has(g)) {
      continue;
    }
    seen.add(g);
    out.push(g);
  }
  return out;
}

function collectNodeGroups(svg: SVGSVGElement): SVGGElement[] {
  const flow: SVGGElement[] = [];
  for (const n of svg.querySelectorAll("g.node")) {
    if (n instanceof SVGGElement) {
      flow.push(n);
    }
  }
  if (flow.length > 0) {
    return dedupeGroups(flow);
  }
  const fromBkg: SVGGElement[] = [];
  for (const el of svg.querySelectorAll("g .node-bkg")) {
    const p = el.parentElement;
    if (p instanceof SVGGElement) {
      fromBkg.push(p);
    }
  }
  return dedupeGroups(fromBkg);
}

function formatNodeLabel(g: SVGGElement): string {
  const parts = new Set<string>();
  for (const t of g.querySelectorAll("text, tspan, span, p, div, foreignObject")) {
    const s = t.textContent?.replace(/\s+/g, " ").trim();
    if (s) {
      parts.add(s);
    }
  }
  const joined = [...parts].join(" · ");
  return joined.slice(0, 600);
}

export type DiagramNodeInventoryItem = {
  key: string;
  label: string;
  order: number;
};

/**
 * Tags each node group with `data-omni-diagram-key` for stable lookup after sort.
 */
export function buildDiagramNodeInventory(svg: SVGSVGElement): DiagramNodeInventoryItem[] {
  for (const el of svg.querySelectorAll("[data-omni-diagram-key]")) {
    el.removeAttribute("data-omni-diagram-key");
    el.classList.remove("diagram-node");
  }
  const groups = collectNodeGroups(svg);
  const items: DiagramNodeInventoryItem[] = [];
  let i = 0;
  for (const g of groups) {
    const label = formatNodeLabel(g);
    if (!label) {
      continue;
    }
    const key = String(i++);
    g.setAttribute("data-omni-diagram-key", key);
    g.classList.add("diagram-node");
    items.push({ key, label, order: items.length });
  }
  return items.sort((a, b) => a.label.localeCompare(b.label, "it"));
}

export function findDiagramNodeByKey(svg: SVGSVGElement, key: string): SVGGElement | null {
  const safe = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(key) : key.replace(/"/g, '\\"');
  const el = svg.querySelector(`[data-omni-diagram-key="${safe}"]`);
  return el instanceof SVGGElement ? el : null;
}

export function findDiagramNodeByLabel(svg: SVGSVGElement, label: string): SVGGElement | null {
  const target = label.replace(/\s+/g, " ").trim().toLowerCase();
  if (!target) {
    return null;
  }
  const nodes = Array.from(svg.querySelectorAll("[data-omni-diagram-key]"));
  for (const el of nodes) {
    if (!(el instanceof SVGGElement)) {
      continue;
    }
    const candidate = formatNodeLabel(el).replace(/\s+/g, " ").trim().toLowerCase();
    if (candidate === target || candidate.includes(target) || target.includes(candidate)) {
      return el;
    }
  }
  return null;
}
