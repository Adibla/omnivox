"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DiagramExplorer } from "@/components/diagram-explorer";
import { DiagramStructurePanel } from "@/components/diagram-structure-panel";
import { useI18n } from "@/components/i18n-provider";
import {
  centerBBoxInViewport,
  clampDiagramScale,
  DIAGRAM_SCALE_MAX,
  DIAGRAM_SCALE_MIN,
  fitDiagramToContainer,
  panAfterZoomAtPoint
} from "@/lib/diagram-viewport-math";
import { buildDiagramNodeInventory, findDiagramNodeByKey, findDiagramNodeByLabel } from "@/lib/diagram-node-inventory";
import type { DiagramNodeInventoryItem } from "@/lib/diagram-node-inventory";
import { parseDiagramSemanticTree } from "@/lib/diagram-semantic-tree";
import { copyToClipboard } from "@/lib/integrations-export";
import { getMermaidInitializeOptions } from "@/lib/mermaid-theme";
import { normalizeMermaidCodeForRender } from "@/lib/mermaid-guard";
import { cn } from "@/lib/utils";

const VIEWPORT_MIN_H = "min(74vh, 640px)";
const PAN_THRESHOLD_PX = 6;

function slugExportBase(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 64) || "diagram";
}

function findNodeGroup(el: EventTarget | null): SVGGElement | null {
  if (!el || !(el instanceof Element)) {
    return null;
  }
  const g = el.closest("g.node, .diagram-node");
  return g instanceof SVGGElement ? g : null;
}

function collectTextNodes(root: SVGSVGElement): (SVGTextElement | SVGTSpanElement)[] {
  return Array.from(root.querySelectorAll("text, tspan")).filter(
    (n): n is SVGTextElement | SVGTSpanElement => n instanceof SVGTextElement || n instanceof SVGTSpanElement
  );
}

function clearSearchHighlights(root: SVGSVGElement) {
  for (const g of root.querySelectorAll(".diagram-node--search")) {
    g.classList.remove("diagram-node--search");
  }
}

function applySearchHighlights(root: SVGSVGElement, query: string): SVGGElement[] {
  clearSearchHighlights(root);
  if (!query.trim()) {
    return [];
  }
  const q = query.trim().toLowerCase();
  const matched = new Set<SVGGElement>();
  for (const node of root.querySelectorAll("[data-omni-diagram-key]")) {
    if (!(node instanceof SVGGElement)) {
      continue;
    }
    const content = (node.textContent ?? "").replace(/\s+/g, " ").toLowerCase();
    if (content.includes(q)) {
      node.classList.add("diagram-node--search");
      matched.add(node);
    }
  }
  for (const textEl of collectTextNodes(root)) {
    const content = (textEl.textContent ?? "").toLowerCase();
    if (!content.includes(q)) {
      continue;
    }
    const g = textEl.closest("g.node");
    if (g instanceof SVGGElement) {
      g.classList.add("diagram-node--search");
      matched.add(g);
    }
  }
  return [...matched];
}

function clearIsolation(root: SVGSVGElement) {
  root.classList.remove("diagram-svg--isolate");
  for (const g of root.querySelectorAll(".diagram-node--isolate")) {
    g.classList.remove("diagram-node--isolate");
  }
}

function setIsolatedNode(root: SVGSVGElement, node: SVGGElement | null) {
  clearIsolation(root);
  if (!node) {
    return;
  }
  root.classList.add("diagram-svg--isolate");
  node.classList.add("diagram-node--isolate");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function svgToPngBlob(svg: SVGSVGElement): Promise<Blob | null> {
  const serialized = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const vb = svg.viewBox;
      const w = vb?.baseVal?.width && vb.baseVal.width > 0 ? vb.baseVal.width : img.naturalWidth || 800;
      const h = vb?.baseVal?.height && vb.baseVal.height > 0 ? vb.baseVal.height : img.naturalHeight || 600;
      const canvas = document.createElement("canvas");
      const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2);
      canvas.width = Math.ceil(w * dpr);
      canvas.height = Math.ceil(h * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      ctx.fillStyle = document.documentElement.classList.contains("dark") ? "#0f1218" : "#f8fafc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (png) => {
          URL.revokeObjectURL(url);
          resolve(png);
        },
        "image/png",
        0.92
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export type MermaidViewProps = {
  code: string;
  /** Sanitized base name for downloaded files */
  exportBasename?: string;
};

export function MermaidView({ code, exportBasename = "diagram" }: MermaidViewProps) {
  const { t } = useI18n();
  const [svgMarkup, setSvgMarkup] = useState("");
  const [error, setError] = useState("");
  const [attemptedCode, setAttemptedCode] = useState("");
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [search, setSearch] = useState("");
  const [statusLine, setStatusLine] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [structureItems, setStructureItems] = useState<DiagramNodeInventoryItem[]>([]);
  const [structureActiveKey, setStructureActiveKey] = useState<string | null>(null);
  const [themeRevision, setThemeRevision] = useState(0);
  const semanticTree = useMemo(() => parseDiagramSemanticTree(code), [code]);
  const [viewMode, setViewMode] = useState<"explore" | "canvas">(() => (semanticTree.length > 0 ? "explore" : "canvas"));
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return structureItems.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 8);
  }, [search, structureItems]);

  useEffect(() => {
    setViewMode(semanticTree.length > 0 ? "explore" : "canvas");
  }, [semanticTree]);

  useEffect(() => {
    const onThemeChange = () => setThemeRevision((value) => value + 1);
    window.addEventListener("omni-theme-change", onThemeChange);
    return () => window.removeEventListener("omni-theme-change", onThemeChange);
  }, []);

  const id = useId().replace(/:/g, "");
  const shellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  const panRef = useRef({
    active: false,
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    startTx: 0,
    startTy: 0,
    moved: false
  });
  const skipClickRef = useRef(false);

  const focusNode = useCallback((svg: SVGSVGElement, node: SVGGElement, key: string | null = null) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    setIsolatedNode(svg, node);
    setStructureActiveKey(key ?? node.getAttribute("data-omni-diagram-key") ?? null);
    let bbox: DOMRect;
    try {
      bbox = node.getBBox();
    } catch {
      return;
    }
    const { width: cw, height: ch } = viewport.getBoundingClientRect();
    const nextScale = clampDiagramScale(Math.max(scale, 1.18));
    const pan = centerBBoxInViewport({
      bbox,
      containerWidth: cw,
      containerHeight: ch,
      scale: nextScale
    });
    setScale(nextScale);
    setTx(pan.tx);
    setTy(pan.ty);
  }, [scale]);

  const applyViewportFit = useCallback(() => {
    const viewport = viewportRef.current;
    const mount = mountRef.current;
    if (!viewport || !mount) {
      return;
    }
    const svg = mount.querySelector("svg");
    if (!svg) {
      return;
    }
    let bbox: DOMRect;
    try {
      bbox = svg.getBBox();
    } catch {
      return;
    }
    const { width: cw, height: ch } = viewport.getBoundingClientRect();
    const next = fitDiagramToContainer({ bbox, containerWidth: cw, containerHeight: ch, padding: 20 });
    setScale(next.scale);
    setTx(next.tx);
    setTy(next.ty);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      const normalized = normalizeMermaidCodeForRender(code);
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          ...getMermaidInitializeOptions()
        });
        const { svg: nextSvg } = await mermaid.render(`diagram-${id}`, normalized);
        if (!cancelled) {
          setSvgMarkup(nextSvg);
          setError("");
          setAttemptedCode("");
          setSearch("");
          setStatusLine("");
        }
      } catch (renderError) {
        if (!cancelled) {
          setSvgMarkup("");
          setAttemptedCode(normalized);
          setError(renderError instanceof Error ? renderError.message : "Mermaid render failed.");
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [code, id, themeRevision]);

  useLayoutEffect(() => {
    if (!svgMarkup || error) {
      setStructureItems([]);
      setStructureActiveKey(null);
      return;
    }
    const mount = mountRef.current;
    const svg = mount?.querySelector("svg");
    if (svg instanceof SVGSVGElement) {
      clearIsolation(svg);
      setStructureItems(buildDiagramNodeInventory(svg));
      setStructureActiveKey(null);
    } else {
      setStructureItems([]);
    }
    requestAnimationFrame(() => applyViewportFit());
  }, [svgMarkup, error, viewMode, applyViewportFit]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -0.12 : 0.12;
      const nextScale = clampDiagramScale(scale * (1 + delta));
      const pan = panAfterZoomAtPoint({
        pointerX: px,
        pointerY: py,
        tx,
        ty,
        scale,
        nextScale
      });
      setScale(nextScale);
      setTx(pan.tx);
      setTy(pan.ty);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [scale, tx, ty]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) {
      return;
    }
    const ro = new ResizeObserver(() => {
      if (isFullscreen) {
        applyViewportFit();
      }
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [isFullscreen, applyViewportFit]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") {
        return;
      }
      const mount = mountRef.current;
      const svg = mount?.querySelector("svg");
      if (svg instanceof SVGSVGElement) {
        clearIsolation(svg);
        clearSearchHighlights(svg);
      }
      setSearch("");
      setStatusLine("");
      setStructureActiveKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPointerDownPan = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = {
      active: true,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTx: tx,
      startTy: ty,
      moved: false
    };
  }, [tx, ty]);

  const onPointerMovePan = useCallback((e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p.active || e.pointerId !== p.pointerId) {
      return;
    }
    const dx = e.clientX - p.startClientX;
    const dy = e.clientY - p.startClientY;
    if (Math.hypot(dx, dy) > PAN_THRESHOLD_PX) {
      p.moved = true;
    }
    setTx(p.startTx + dx);
    setTy(p.startTy + dy);
  }, []);

  const onPointerUpPan = useCallback((e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p.active || e.pointerId !== p.pointerId) {
      return;
    }
    if (p.moved) {
      skipClickRef.current = true;
    }
    p.active = false;
    p.moved = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onClickViewport = useCallback(
    (e: React.MouseEvent) => {
      if (skipClickRef.current) {
        skipClickRef.current = false;
        return;
      }
      const mount = mountRef.current;
      const svg = mount?.querySelector("svg");
      if (!(svg instanceof SVGSVGElement)) {
        return;
      }
      const node = findNodeGroup(e.target);
      if (!node) {
        clearIsolation(svg);
        setStructureActiveKey(null);
        return;
      }
      const already = node.classList.contains("diagram-node--isolate");
      if (already) {
        clearIsolation(svg);
        setStructureActiveKey(null);
        return;
      }
      setIsolatedNode(svg, node);
      setStructureActiveKey(node.getAttribute("data-omni-diagram-key") || null);
    },
    []
  );

  const jumpToNodeKey = useCallback(
    (key: string) => {
      const mount = mountRef.current;
      const svg = mount?.querySelector("svg");
      if (!(svg instanceof SVGSVGElement)) {
        return;
      }
      const g = findDiagramNodeByKey(svg, key);
      if (!g) {
        return;
      }
      focusNode(svg, g, key);
    },
    [focusNode]
  );

  const jumpToLabel = useCallback(
    (label: string) => {
      const mount = mountRef.current;
      const svg = mount?.querySelector("svg");
      if (!(svg instanceof SVGSVGElement)) {
        setStatusLine(`${t("diagram.branchOpened")}: ${label}`);
        return;
      }
      const g = findDiagramNodeByLabel(svg, label);
      if (!g) {
        setStatusLine(`"${label}" ${t("diagram.noNodeFound").toLowerCase()}`);
        return;
      }
      focusNode(svg, g);
      setStatusLine(`${t("diagram.nodeOpened")}: ${label}`);
    },
    [focusNode, t]
  );

  const zoomBy = (factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const px = rect.width / 2;
    const py = rect.height / 2;
    const nextScale = clampDiagramScale(scale * factor);
    const pan = panAfterZoomAtPoint({
      pointerX: px,
      pointerY: py,
      tx,
      ty,
      scale,
      nextScale
    });
    setScale(nextScale);
    setTx(pan.tx);
    setTy(pan.ty);
  };

  const resetView = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  const runSearch = useCallback(() => {
    const mount = mountRef.current;
    const svg = mount?.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) {
      return;
    }
    const hits = applySearchHighlights(svg, search);
    setStatusLine(hits.length ? `${hits.length} ${t("diagram.items")} ${t("diagram.highlight").toLowerCase()}` : search.trim() ? t("diagram.noNodeFound") : "");
  }, [search, t]);

  useEffect(() => {
    if (!svgMarkup) {
      return;
    }
    const t = window.setTimeout(() => runSearch(), 120);
    return () => window.clearTimeout(t);
  }, [search, svgMarkup, runSearch]);

  useEffect(() => {
    if (isFullscreen) {
      requestAnimationFrame(() => applyViewportFit());
    }
  }, [isFullscreen, applyViewportFit]);

  const base = slugExportBase(exportBasename);

  const copySource = async () => {
    const ok = await copyToClipboard(normalizeMermaidCodeForRender(code));
    setStatusLine(ok ? t("diagram.copyOk") : t("diagram.copyFail"));
  };

  const downloadSvg = () => {
    const mount = mountRef.current;
    const svg = mount?.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) {
      return;
    }
    const xml = new XMLSerializer().serializeToString(svg);
    triggerDownload(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }), `${base}.svg`);
    setStatusLine(t("diagram.svgDownloaded"));
  };

  const downloadPng = async () => {
    const mount = mountRef.current;
    const svg = mount?.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) {
      return;
    }
    const png = await svgToPngBlob(svg);
    if (!png) {
      setStatusLine(t("diagram.pngFail"));
      return;
    }
    triggerDownload(png, `${base}.png`);
    setStatusLine(t("diagram.pngDownloaded"));
  };

  const toggleFullscreen = async () => {
    const el = shellRef.current;
    if (!el) {
      return;
    }
    if (!document.fullscreenElement) {
      await el.requestFullscreen().catch(() => {});
      requestAnimationFrame(() => applyViewportFit());
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  };

  if (error) {
    return (
      <div className="space-y-3">
        <Alert variant="destructive">
          <AlertTitle>{t("diagram.notRenderable")}</AlertTitle>
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
        <details className="rounded-lg border border-border/60 bg-muted/20 text-sm">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-muted-foreground">
            {t("diagram.debugCode")}
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all border-t border-border/40 p-3 text-xs">
            {attemptedCode || normalizeMermaidCodeForRender(code)}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div ref={shellRef} className={cn("overflow-hidden rounded-lg border border-border/60 bg-background", isFullscreen && "min-h-screen p-4")}>
      <div className="border-b border-border/60 bg-muted/20 p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Input
                type="search"
                placeholder={t("diagram.searchNodes")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 border-border/70 bg-background/85 pl-9 text-sm"
                aria-label={t("diagram.searchAria")}
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                ⌕
              </span>
              {viewMode === "canvas" && searchResults.length > 0 ? (
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-lg border border-border/70 bg-popover shadow-xl">
                  <div className="border-b border-border/50 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("diagram.results")}
                  </div>
                  <div className="max-h-72 overflow-y-auto p-1">
                    {searchResults.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs text-foreground hover:bg-muted/60"
                        onClick={() => jumpToNodeKey(item.key)}
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-primary/35 bg-primary/15 text-[10px] text-primary">
                          {item.order + 1}
                        </span>
                        <span className="line-clamp-2 min-w-0 flex-1">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : viewMode === "canvas" && search.trim() ? (
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-lg border border-border/70 bg-popover px-3 py-3 text-xs text-muted-foreground shadow-xl">
                  {t("diagram.noNodeFound")}
                </div>
              ) : null}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={runSearch} disabled={viewMode === "explore"}>
              {t("diagram.highlight")}
            </Button>
            <span className="min-h-5 text-xs text-muted-foreground" aria-live="polite">
              {statusLine || (viewMode === "explore" ? `${semanticTree.length} ${t("diagram.roots")}` : `${structureItems.length} ${t("diagram.nodesDetected")}`)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {semanticTree.length > 0 ? (
              <div className="flex rounded-md border border-border/70 bg-background/80 p-0.5">
                <Button
                  type="button"
                  variant={viewMode === "explore" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setViewMode("explore")}
                >
                  {t("diagram.explorer")}
                </Button>
                <Button
                  type="button"
                  variant={viewMode === "canvas" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => setViewMode("canvas")}
                >
                  {t("diagram.fullCanvas")}
                </Button>
              </div>
            ) : null}
            {viewMode === "canvas" ? (
              <>
            <div className="flex rounded-md border border-border/70 bg-background/80 p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0"
                onClick={() => zoomBy(0.9)}
                aria-label={t("diagram.zoomOut")}
                title={t("diagram.zoomOut")}
              >
                −
              </Button>
              <span className="flex h-8 min-w-14 items-center justify-center border-x border-border/60 px-2 text-xs font-medium tabular-nums text-muted-foreground">
                {Math.round(scale * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0"
                onClick={() => zoomBy(1.1)}
                aria-label={t("diagram.zoomIn")}
                title={t("diagram.zoomIn")}
              >
                +
              </Button>
            </div>
            <div className="flex rounded-md border border-border/70 bg-background/80 p-0.5">
              <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => applyViewportFit()}>
                {t("diagram.fitCanvas")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8" onClick={resetView}>
                1:1
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8" onClick={toggleFullscreen}>
                ⛶
              </Button>
            </div>
              </>
            ) : null}
            <div className="flex rounded-md border border-border/70 bg-background/80 p-0.5">
              <Button type="button" variant="ghost" size="sm" className="h-8" onClick={copySource}>
                {t("diagram.copy")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8" onClick={downloadSvg}>
                SVG
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => void downloadPng()}>
                PNG
              </Button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === "explore" && semanticTree.length > 0 ? (
        <DiagramExplorer
          tree={semanticTree}
          searchQuery={search}
          onSearchChange={setSearch}
          onSelectLabel={jumpToLabel}
        />
      ) : (
        <div
          className={cn(
            "grid min-h-0 bg-background lg:items-stretch",
            structureItems.length > 0 && "lg:grid-cols-[minmax(230px,300px)_1fr]"
          )}
        >
          <DiagramStructurePanel
            items={structureItems}
            semanticTree={semanticTree}
            searchQuery={search}
            activeKey={structureActiveKey}
            onSelectKey={jumpToNodeKey}
            onSelectLabel={jumpToLabel}
          />
          <div
            ref={viewportRef}
            className="diagram-viewport relative min-h-0 overflow-hidden bg-slate-50 touch-none dark:bg-[#0f1218]"
            style={{ minHeight: VIEWPORT_MIN_H }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.055)_1px,transparent_1px)] bg-[size:32px_32px] dark:bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)]" />
            <div
              ref={layerRef}
              role="application"
              aria-label="Area diagramma, trascina per spostare, rotella per zoom"
              className="absolute left-0 top-0 inline-block cursor-grab select-none active:cursor-grabbing"
              style={{
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                transformOrigin: "0 0"
              }}
              onPointerDown={onPointerDownPan}
              onPointerMove={onPointerMovePan}
              onPointerUp={onPointerUpPan}
              onPointerCancel={onPointerUpPan}
              onClick={onClickViewport}
            >
              <div
                ref={mountRef}
                className="inline-block [&_svg]:block [&_svg]:max-h-none [&_svg]:max-w-none [&_svg]:overflow-visible"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            </div>
            {!svgMarkup ? (
              <div className="absolute inset-0 grid place-items-center">
                <div className="rounded-md border border-border/60 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
                  {t("diagram.rendering")}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/15 px-4 py-2 text-[11px] text-muted-foreground">
        <span>{viewMode === "explore" ? t("diagram.progressiveHint") : t("diagram.canvasHint")}</span>
        <span className="tabular-nums">
          {scale <= DIAGRAM_SCALE_MIN + 0.01 ? t("diagram.minZoom") : ""}
          {scale >= DIAGRAM_SCALE_MAX - 0.01 ? t("diagram.maxZoom") : ""}
        </span>
      </div>
    </div>
  );
}
