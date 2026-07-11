export type DiagramSemanticNode = {
  id: string;
  label: string;
  children: DiagramSemanticNode[];
};

function cleanLabel(input: string): string {
  return input
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^["']|["']$/g, "")
    .replace(/^\(+|\)+$/g, "")
    .replace(/^\[+|\]+$/g, "")
    .replace(/^\{+|\}+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNodeSyntax(input: string): string {
  const s = input.trim();
  const bracket = s.match(/^[A-Za-z0-9_-]+\s*(?:\[\[|\[|\(|\{)(.*?)(?:\]\]|\]|\)|\})\s*$/);
  if (bracket?.[1]) {
    return cleanLabel(bracket[1]);
  }
  const quoted = s.match(/^[A-Za-z0-9_-]+\s*\["(.+)"\]\s*$/);
  if (quoted?.[1]) {
    return cleanLabel(quoted[1]);
  }
  return cleanLabel(s.replace(/^[A-Za-z0-9_-]+\s*:::\s*/, ""));
}

function parseMindmap(code: string): DiagramSemanticNode[] {
  const lines = code
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("%%") && line.trim() !== "mindmap");
  const stack: Array<{ indent: number; node: DiagramSemanticNode }> = [];
  const roots: DiagramSemanticNode[] = [];
  let count = 0;

  for (const line of lines) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const label = stripNodeSyntax(line.trim());
    if (!label) {
      continue;
    }
    const node: DiagramSemanticNode = { id: `mind-${count++}`, label, children: [] };
    while (stack.length && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]?.node;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push({ indent, node });
  }
  return roots;
}

function parseFlowchart(code: string): DiagramSemanticNode[] {
  const nodeLabels = new Map<string, string>();
  const children = new Map<string, Set<string>>();
  const seenAsChild = new Set<string>();
  const lines = code
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const ensure = (raw: string) => {
    const id = raw.match(/^[A-Za-z0-9_-]+/)?.[0] ?? raw;
    const label = stripNodeSyntax(raw);
    if (!nodeLabels.has(id)) {
      nodeLabels.set(id, label || id);
    } else if (label && label !== id) {
      nodeLabels.set(id, label);
    }
    return id;
  };

  for (const line of lines) {
    if (line.startsWith("%%") || /^flowchart|^graph/.test(line)) {
      continue;
    }
    const parts = line
      .split(/(?:-->|---|==>|-.->)/)
      .map((part) => part.replace(/\|.*?\|/g, "").trim());
    if (parts.length < 2) {
      ensure(line);
      continue;
    }
    for (let i = 0; i < parts.length - 1; i += 1) {
      const from = ensure(parts[i]);
      const to = ensure(parts[i + 1]);
      if (!children.has(from)) {
        children.set(from, new Set());
      }
      children.get(from)?.add(to);
      seenAsChild.add(to);
    }
  }

  const build = (id: string, path = new Set<string>()): DiagramSemanticNode => {
    if (path.has(id)) {
      return { id, label: nodeLabels.get(id) ?? id, children: [] };
    }
    const nextPath = new Set(path);
    nextPath.add(id);
    return {
      id,
      label: nodeLabels.get(id) ?? id,
      children: [...(children.get(id) ?? [])].map((child) => build(child, nextPath)),
    };
  };

  const roots = [...nodeLabels.keys()].filter((id) => !seenAsChild.has(id));
  return (roots.length ? roots : [...nodeLabels.keys()]).map((id) => build(id));
}

export function parseDiagramSemanticTree(code: string): DiagramSemanticNode[] {
  const trimmed = code.trim();
  if (/^mindmap/m.test(trimmed)) {
    return parseMindmap(trimmed);
  }
  if (/^(flowchart|graph)/m.test(trimmed)) {
    return parseFlowchart(trimmed);
  }
  return [];
}
