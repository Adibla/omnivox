"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import type { DiagramNodeInventoryItem } from "@/lib/diagram-node-inventory";
import type { DiagramSemanticNode } from "@/lib/diagram-semantic-tree";
import { cn } from "@/lib/utils";

export type DiagramStructurePanelProps = {
  items: DiagramNodeInventoryItem[];
  semanticTree: DiagramSemanticNode[];
  searchQuery: string;
  activeKey: string | null;
  onSelectKey: (key: string) => void;
  onSelectLabel: (label: string) => void;
};

export function DiagramStructurePanel({
  items,
  semanticTree,
  searchQuery,
  activeKey,
  onSelectKey,
  onSelectLabel
}: DiagramStructurePanelProps) {
  const { t } = useI18n();
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(["mind-0"]));
  const q = searchQuery.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
  const hasSemanticTree = semanticTree.length > 0;
  const visibleTree = useMemo(() => {
    if (!q) {
      return semanticTree;
    }
    const includeMatches = (node: DiagramSemanticNode): DiagramSemanticNode | null => {
      const children = node.children.map(includeMatches).filter((n): n is DiagramSemanticNode => Boolean(n));
      if (node.label.toLowerCase().includes(q) || children.length > 0) {
        return { ...node, children };
      }
      return null;
    };
    return semanticTree.map(includeMatches).filter((n): n is DiagramSemanticNode => Boolean(n));
  }, [q, semanticTree]);

  const toggleNode = (node: DiagramSemanticNode) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
    onSelectLabel(node.label);
  };

  const renderTree = (nodes: DiagramSemanticNode[], depth = 0) => (
    <ul className={cn("space-y-1", depth > 0 && "mt-1")}>
      {nodes.map((node) => {
        const isOpen = q || openKeys.has(node.id);
        const hasChildren = node.children.length > 0;
        return (
          <li key={`${node.id}-${node.label}`}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto min-h-9 w-full justify-start gap-2 whitespace-normal rounded-md px-2 py-1.5 text-left text-xs font-normal leading-snug text-foreground hover:bg-background/70"
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              onClick={() => (hasChildren ? toggleNode(node) : onSelectLabel(node.label))}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px]",
                  hasChildren ? "border-primary/35 bg-primary/15 text-primary" : "border-border/60 bg-background/60 text-muted-foreground"
                )}
              >
                {hasChildren ? (isOpen ? "−" : "+") : "•"}
              </span>
              <span className="min-w-0 flex-1">{node.label}</span>
            </Button>
            {hasChildren && isOpen ? renderTree(node.children, depth + 1) : null}
          </li>
        );
      })}
    </ul>
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <aside className="flex max-h-[min(74vh,640px)] min-h-[220px] flex-col border-b border-border/60 bg-muted/20 lg:min-h-0 lg:border-b-0 lg:border-r">
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <p className="ui-overline mb-0.5">{t("diagram.structure")}</p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {filtered.length} {t("diagram.of")} {items.length} {t("diagram.items")}
          {q ? ` · ${t("diagram.filtered")}` : ""}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {hasSemanticTree ? (
          <div className="mb-3 rounded-lg border border-border/50 bg-background/45 p-2">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-[11px] font-medium text-foreground">{t("diagram.interactiveMap")}</p>
              <span className="text-[10px] text-muted-foreground">{t("diagram.clickToOpen")}</span>
            </div>
            {visibleTree.length > 0 ? renderTree(visibleTree) : (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">{t("diagram.noBranch")}</div>
            )}
          </div>
        ) : null}
        <ul className="space-y-1.5">
          {filtered.map((item, index) => (
            <li key={item.key}>
              <Button
                type="button"
                variant={activeKey === item.key ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-auto min-h-10 w-full justify-start gap-2 whitespace-normal rounded-md px-2.5 py-2 text-left text-xs font-normal leading-snug",
                  activeKey === item.key
                    ? "border-primary/30 bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                )}
                onClick={() => onSelectKey(item.key)}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] tabular-nums",
                    activeKey === item.key
                      ? "border-primary/35 bg-primary/15 text-primary"
                      : "border-border/60 bg-background/60 text-muted-foreground"
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">{item.label}</span>
              </Button>
            </li>
          ))}
        </ul>
        {filtered.length === 0 ? (
          <div className="rounded-md border border-border/50 bg-background/45 px-3 py-4 text-center text-xs text-muted-foreground">
            {t("diagram.noNode")}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
