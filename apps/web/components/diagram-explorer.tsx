"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import type { DiagramSemanticNode } from "@/lib/diagram-semantic-tree";
import { cn } from "@/lib/utils";

type DiagramExplorerProps = {
  tree: DiagramSemanticNode[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelectLabel: (label: string) => void;
};

type TreeHit = {
  node: DiagramSemanticNode;
  path: DiagramSemanticNode[];
};

type LayoutNode = TreeHit & {
  depth: number;
  x: number;
  y: number;
};

type LayoutLink = {
  from: LayoutNode;
  to: LayoutNode;
};

const NODE_W = 220;
const NODE_H = 78;
const DEPTH_GAP = 310;
const ROW_GAP = 108;
const PAD_X = 90;
const PAD_Y = 90;
const SCALE_MIN = 0.36;
const SCALE_MAX = 2.1;

function flattenTree(nodes: DiagramSemanticNode[], path: DiagramSemanticNode[] = []): TreeHit[] {
  return nodes.flatMap((node) => {
    const nextPath = [...path, node];
    return [{ node, path: nextPath }, ...flattenTree(node.children, nextPath)];
  });
}

function collectIds(nodes: DiagramSemanticNode[]): Set<string> {
  const ids = new Set<string>();
  const visit = (node: DiagramSemanticNode) => {
    ids.add(node.id);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return ids;
}

function countDescendants(node: DiagramSemanticNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function truncate(label: string, max = 56): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function clampScale(scale: number): number {
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale));
}

function initialExpanded(tree: DiagramSemanticNode[]) {
  const ids = new Set<string>();
  for (const root of tree) {
    ids.add(root.id);
  }
  return ids;
}

function longestPath(nodes: DiagramSemanticNode[]): DiagramSemanticNode[] {
  let best: DiagramSemanticNode[] = [];
  const visit = (node: DiagramSemanticNode, path: DiagramSemanticNode[]) => {
    const next = [...path, node];
    if (next.length > best.length) {
      best = next;
    }
    node.children.forEach((child) => visit(child, next));
  };
  nodes.forEach((node) => visit(node, []));
  return best;
}

function buildLayout(tree: DiagramSemanticNode[], expandedIds: Set<string>) {
  const nodes: LayoutNode[] = [];
  const links: LayoutLink[] = [];
  let row = 0;

  const place = (
    node: DiagramSemanticNode,
    depth: number,
    path: DiagramSemanticNode[],
  ): LayoutNode => {
    const nextPath = [...path, node];
    const layoutNode: LayoutNode = {
      node,
      path: nextPath,
      depth,
      x: PAD_X + depth * DEPTH_GAP,
      y: PAD_Y,
    };
    nodes.push(layoutNode);

    if (expandedIds.has(node.id) && node.children.length > 0) {
      const children = node.children.map((child) => place(child, depth + 1, nextPath));
      for (const child of children) {
        links.push({ from: layoutNode, to: child });
      }
      layoutNode.y = children.reduce((sum, child) => sum + child.y, 0) / children.length;
    } else {
      layoutNode.y = PAD_Y + row * ROW_GAP;
      row += 1;
    }
    return layoutNode;
  };

  tree.forEach((root) => place(root, 0, []));
  const maxDepth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
  const maxY = nodes.reduce((max, node) => Math.max(max, node.y), PAD_Y);
  return {
    nodes,
    links,
    width: PAD_X * 2 + NODE_W + maxDepth * DEPTH_GAP,
    height: Math.max(560, maxY + PAD_Y + NODE_H),
  };
}

export function DiagramExplorer({
  tree,
  searchQuery,
  onSearchChange,
  onSelectLabel,
}: DiagramExplorerProps) {
  const { t } = useI18n();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => initialExpanded(tree));
  const [activeId, setActiveId] = useState(tree[0]?.id ?? "");
  const [mode, setMode] = useState<"graph" | "sequence">("graph");
  const [scale, setScale] = useState(0.82);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [dragging, setDragging] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });

  useEffect(() => {
    setExpandedIds(initialExpanded(tree));
    setActiveId(tree[0]?.id ?? "");
    setPan({ x: 24, y: 24 });
    setScale(0.82);
  }, [tree]);

  const allHits = useMemo(() => flattenTree(tree), [tree]);
  const layout = useMemo(() => buildLayout(tree, expandedIds), [tree, expandedIds]);
  const sequence = useMemo(() => longestPath(tree), [tree]);
  const activeHit = allHits.find((hit) => hit.node.id === activeId) ?? allHits[0] ?? null;
  const activeNode =
    layout.nodes.find((node) => node.node.id === activeHit?.node.id) ?? layout.nodes[0] ?? null;
  const activePathIds = new Set(activeHit?.path.map((node) => node.id) ?? []);
  const q = searchQuery.trim().toLowerCase();
  const searchHits = q
    ? allHits.filter((hit) => hit.node.label.toLowerCase().includes(q)).slice(0, 8)
    : [];
  const matchedIds = new Set(searchHits.map((hit) => hit.node.id));

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) {
      return;
    }
    const next = clampScale(
      Math.min(vp.clientWidth / layout.width, vp.clientHeight / layout.height) * 0.92,
    );
    setScale(next);
    setPan({ x: 24, y: 24 });
  }, [layout.height, layout.width]);

  const zoomBy = (factor: number) => setScale((current) => clampScale(current * factor));

  const openPath = (path: DiagramSemanticNode[]) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      path.forEach((node) => next.add(node.id));
      return next;
    });
    const selected = path[path.length - 1];
    if (selected) {
      setActiveId(selected.id);
      onSelectLabel(selected.label);
    }
  };

  const selectOnly = (hit: TreeHit) => {
    setActiveId(hit.node.id);
    onSelectLabel(hit.node.label);
  };

  const toggleNode = (node: DiagramSemanticNode) => {
    if (node.children.length === 0) {
      return;
    }
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    setDragging(true);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) {
      return;
    }
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    if (Math.hypot(dx, dy) > 4) {
      dragRef.current.moved = true;
    }
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  if (!activeHit || !activeNode) {
    return (
      <div className="grid min-h-[520px] place-items-center bg-slate-50 px-4 py-12 text-sm text-muted-foreground dark:bg-[#0f1218]">
        {t("diagram.noStructure")}
      </div>
    );
  }

  return (
    <div className="bg-slate-50 dark:bg-[#0f1218]">
      <div className="relative min-h-[min(78vh,760px)] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.055)_1px,transparent_1px)] bg-[size:34px_34px] dark:bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)]" />

        <div className="relative grid min-h-[min(78vh,760px)] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 border-b border-border/60 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background/75 px-4 py-3 backdrop-blur-sm">
              <div className="min-w-0">
                <p className="ui-overline mb-1 text-[10px]">{t("diagram.visualGraph")}</p>
                <p className="truncate text-sm font-medium text-foreground">
                  {activeHit.node.label}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-md border border-border/60 bg-background/75 p-0.5">
                  <Button
                    type="button"
                    variant={mode === "graph" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8"
                    onClick={() => setMode("graph")}
                  >
                    {t("diagram.graph")}
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "sequence" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8"
                    disabled={sequence.length < 3}
                    onClick={() => setMode("sequence")}
                  >
                    {t("diagram.sequence")}
                  </Button>
                </div>
                <div className="flex rounded-md border border-border/60 bg-background/75 p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 px-0"
                    onClick={() => zoomBy(0.86)}
                    aria-label={t("diagram.zoomOut")}
                  >
                    -
                  </Button>
                  <span className="flex h-8 min-w-14 items-center justify-center border-x border-border/60 px-2 text-xs text-muted-foreground tabular-nums">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 px-0"
                    onClick={() => zoomBy(1.16)}
                    aria-label={t("diagram.zoomIn")}
                  >
                    +
                  </Button>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={fit}>
                  {t("diagram.fit")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setExpandedIds(collectIds(tree))}
                >
                  {t("diagram.openAll")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setExpandedIds(new Set(activeHit.path.map((node) => node.id)))}
                >
                  Focus
                </Button>
              </div>
            </div>

            {q ? (
              <div className="border-b border-border/60 bg-background/85 px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("diagram.searchResults")}
                  </p>
                  <button
                    type="button"
                    className="rounded-md border border-border/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    onClick={() => onSearchChange("")}
                  >
                    {t("diagram.clear")}
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {searchHits.length > 0 ? (
                    searchHits.map((hit) => (
                      <button
                        key={`${hit.node.id}-search`}
                        type="button"
                        className="min-w-[220px] rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-left text-xs text-foreground hover:border-primary/45 hover:bg-muted/35"
                        onClick={() => openPath(hit.path)}
                      >
                        <span className="mb-1 block text-[10px] text-muted-foreground">
                          {t("diagram.openPath")}
                        </span>
                        <span className="line-clamp-2">{hit.node.label}</span>
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("diagram.noNodeFound")}
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            <div
              ref={viewportRef}
              className={cn(
                "relative h-[min(72vh,650px)] overflow-hidden",
                dragging ? "cursor-grabbing" : "cursor-grab",
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={(event) => {
                if (!event.ctrlKey && !event.metaKey) {
                  return;
                }
                event.preventDefault();
                zoomBy(event.deltaY > 0 ? 0.92 : 1.08);
              }}
            >
              <div
                className="absolute left-0 top-0"
                style={{
                  width: mode === "sequence" ? Math.max(860, sequence.length * 280) : layout.width,
                  height: mode === "sequence" ? 520 : layout.height,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                  transformOrigin: "0 0",
                }}
              >
                {mode === "sequence" ? (
                  <SequenceView
                    nodes={sequence}
                    activeId={activeId}
                    onSelect={(index) => openPath(sequence.slice(0, index + 1))}
                    labels={{ branches: t("diagram.branches"), final: t("diagram.final") }}
                  />
                ) : (
                  <GraphCanvas
                    layout={layout}
                    activeId={activeId}
                    activePathIds={activePathIds}
                    matchedIds={matchedIds}
                    expandedIds={expandedIds}
                    onSelect={selectOnly}
                    onToggle={toggleNode}
                    labels={{
                      branches: t("diagram.branches"),
                      final: t("diagram.final"),
                      open: t("diagram.open"),
                      closed: t("diagram.closed"),
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <aside className="bg-background/80 p-4 backdrop-blur-sm">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <p className="ui-overline mb-3 text-[10px]">{t("diagram.selectedNode")}</p>
              <h4 className="text-lg font-semibold leading-tight text-foreground">
                {activeHit.node.label}
              </h4>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="rounded-md border border-border/60 bg-background/55 p-2">
                  <span className="block text-[10px] uppercase tracking-wider">
                    {t("diagram.branches")}
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-foreground tabular-nums">
                    {activeHit.node.children.length}
                  </span>
                </div>
                <div className="rounded-md border border-border/60 bg-background/55 p-2">
                  <span className="block text-[10px] uppercase tracking-wider">
                    {t("diagram.descendants")}
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-foreground tabular-nums">
                    {countDescendants(activeHit.node)}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openPath(activeHit.path.slice(0, 1))}
                >
                  {t("diagram.root")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={activeHit.node.children.length === 0}
                  onClick={() => toggleNode(activeHit.node)}
                >
                  {expandedIds.has(activeHit.node.id) ? t("diagram.close") : t("diagram.openVerb")}
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border/60 bg-muted/15 p-3">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("diagram.path")}
              </p>
              <div className="space-y-1.5">
                {activeHit.path.map((node, index) => (
                  <button
                    key={`${node.id}-path`}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs",
                      node.id === activeId
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-background/65 hover:text-foreground",
                    )}
                    onClick={() => openPath(activeHit.path.slice(0, index + 1))}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/60 text-[10px] tabular-nums">
                      {index + 1}
                    </span>
                    <span className="line-clamp-2 min-w-0 flex-1">{node.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {activeHit.node.children.length > 0 ? (
              <div className="mt-4 rounded-lg border border-border/60 bg-muted/15 p-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("diagram.branches")}
                </p>
                <div className="space-y-1.5">
                  {activeHit.node.children.map((child) => (
                    <button
                      key={`${child.id}-child`}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-background/65 hover:text-foreground"
                      onClick={() => openPath([...activeHit.path, child])}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary/80" />
                      <span className="line-clamp-2 min-w-0 flex-1">{child.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

function GraphCanvas({
  layout,
  activeId,
  activePathIds,
  matchedIds,
  expandedIds,
  onSelect,
  onToggle,
  labels,
}: {
  layout: ReturnType<typeof buildLayout>;
  activeId: string;
  activePathIds: Set<string>;
  matchedIds: Set<string>;
  expandedIds: Set<string>;
  onSelect: (hit: TreeHit) => void;
  onToggle: (node: DiagramSemanticNode) => void;
  labels: {
    branches: string;
    final: string;
    open: string;
    closed: string;
  };
}) {
  return (
    <div className="relative" style={{ width: layout.width, height: layout.height }}>
      <svg
        className="absolute inset-0"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="explorer-link" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#3b7df0" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#7ab0ff" stopOpacity="0.78" />
          </linearGradient>
        </defs>
        {layout.links.map((link) => {
          const sx = link.from.x + NODE_W;
          const sy = link.from.y + NODE_H / 2;
          const tx = link.to.x;
          const ty = link.to.y + NODE_H / 2;
          const c = Math.max(70, (tx - sx) * 0.44);
          const active = activePathIds.has(link.from.node.id) && activePathIds.has(link.to.node.id);
          return (
            <path
              key={`${link.from.node.id}-${link.to.node.id}`}
              d={`M ${sx} ${sy} C ${sx + c} ${sy}, ${tx - c} ${ty}, ${tx} ${ty}`}
              fill="none"
              stroke={active ? "#7ab0ff" : "url(#explorer-link)"}
              strokeWidth={active ? 3 : 2}
              strokeOpacity={active ? 0.95 : 0.62}
            />
          );
        })}
      </svg>

      {layout.nodes.map((item) => {
        const active = item.node.id === activeId;
        const inPath = activePathIds.has(item.node.id);
        const matched = matchedIds.has(item.node.id);
        const expanded = expandedIds.has(item.node.id);
        const hasChildren = item.node.children.length > 0;
        return (
          <button
            key={item.node.id}
            type="button"
            className={cn(
              "absolute rounded-lg border p-0 text-left shadow-lg shadow-slate-200/70 transition-colors dark:shadow-2xl dark:shadow-black/20",
              active
                ? "border-primary/80 bg-primary/15"
                : inPath
                  ? "border-primary/45 bg-primary/10 dark:bg-[#172033]"
                  : "border-border/70 bg-white/90 hover:border-primary/45 dark:bg-[#171b22]",
              matched && "border-warning bg-warning/10",
            )}
            style={{ left: item.x, top: item.y, width: NODE_W, height: NODE_H }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSelect(item)}
          >
            <span className="flex h-full gap-3 p-3">
              <span
                className={cn(
                  "h-full w-2 shrink-0 rounded-full",
                  active ? "bg-primary" : inPath ? "bg-primary/75" : "bg-muted-foreground/45",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
                  {truncate(item.node.label, 58)}
                </span>
                <span className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>
                    {hasChildren ? `${item.node.children.length} ${labels.branches}` : labels.final}
                  </span>
                  {hasChildren ? <span>{expanded ? labels.open : labels.closed}</span> : null}
                </span>
              </span>
              {hasChildren ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-primary/35 bg-primary/15 text-sm font-semibold text-primary"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(item.node);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onToggle(item.node);
                    }
                  }}
                >
                  {expanded ? "-" : "+"}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SequenceView({
  nodes,
  activeId,
  onSelect,
  labels,
}: {
  nodes: DiagramSemanticNode[];
  activeId: string;
  onSelect: (index: number) => void;
  labels: {
    branches: string;
    final: string;
  };
}) {
  const width = Math.max(880, nodes.length * 280);
  return (
    <div className="relative" style={{ width, height: 520 }}>
      <svg
        className="absolute inset-0"
        width={width}
        height={520}
        viewBox={`0 0 ${width} 520`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="sequence-link" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#3b7df0" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#7ab0ff" stopOpacity="0.86" />
          </linearGradient>
        </defs>
        <line
          x1="130"
          y1="260"
          x2={width - 150}
          y2="260"
          stroke="url(#sequence-link)"
          strokeWidth="4"
        />
      </svg>
      {nodes.map((node, index) => {
        const x = 80 + index * 270;
        const active = node.id === activeId;
        const above = index % 2 === 0;
        return (
          <button
            key={`${node.id}-sequence`}
            type="button"
            className={cn(
              "absolute rounded-lg border bg-white/90 p-4 text-left shadow-lg shadow-slate-200/70 transition-colors hover:border-primary/50 dark:bg-[#171b22] dark:shadow-2xl dark:shadow-black/20",
              active ? "border-primary/80 bg-primary/20" : "border-border/70",
            )}
            style={{ left: x, top: above ? 120 : 300, width: 210, minHeight: 92 }}
            onClick={() => onSelect(index)}
          >
            <span className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md border border-primary/40 bg-primary/15 text-xs font-semibold text-primary tabular-nums">
                {index + 1}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {node.children.length ? `${node.children.length} ${labels.branches}` : labels.final}
              </span>
            </span>
            <span className="line-clamp-3 text-xs font-semibold leading-snug text-foreground">
              {truncate(node.label, 70)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
