"use client";

import type { AnalysisOutput } from "@omnivox/shared";
import { useEffect, useMemo, useState } from "react";
import { MermaidView } from "@/components/mermaid-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

type DiagramGalleryProps = {
  artifacts: AnalysisOutput["artifacts"];
};

function lineCount(mermaidCode: string): number {
  return mermaidCode.split("\n").filter((l) => l.trim().length > 0).length;
}

function relationCount(mermaidCode: string): number {
  return mermaidCode
    .split("\n")
    .filter((line) => /-->|---|==>|-\.-|:::/.test(line) && !line.trim().startsWith("%%")).length;
}

export function DiagramGallery({ artifacts }: DiagramGalleryProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState("0");
  const signature = useMemo(
    () => artifacts.map((a, i) => `${i}:${a.title}`).join("|"),
    [artifacts],
  );
  const activeIndex = Math.min(Number(tab) || 0, artifacts.length - 1);
  const activeArtifact = artifacts[activeIndex];
  const totalLines = useMemo(
    () => artifacts.reduce((sum, artifact) => sum + lineCount(artifact.mermaidCode), 0),
    [artifacts],
  );
  const totalRelations = useMemo(
    () => artifacts.reduce((sum, artifact) => sum + relationCount(artifact.mermaidCode), 0),
    [artifacts],
  );

  useEffect(() => {
    setTab("0");
  }, [signature]);

  if (artifacts.length === 0) {
    return null;
  }
  const typeLabel = (type: AnalysisOutput["artifacts"][number]["diagramType"]) =>
    type === "mindmap" ? t("diagram.mindmap") : t("diagram.flowchart");

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-h-[190px] overflow-hidden border-b border-border/60 bg-muted/10 p-5 sm:p-6 lg:border-b-0 lg:border-r">
              <div className="flex h-full flex-col justify-between gap-8">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="bg-primary/20 text-primary">
                    {artifacts.length} {t("diagram.views")}
                  </Badge>
                  <Badge variant="outline">
                    {totalRelations} {t("diagram.relations")}
                  </Badge>
                  <Badge variant="outline">
                    {totalLines} {t("diagram.mermaidLines")}
                  </Badge>
                </div>
                <div className="max-w-2xl">
                  <p className="ui-overline mb-2 text-[10px]">{t("diagram.activeView")}</p>
                  <h3 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">
                    {activeArtifact.title}
                  </h3>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-md border border-border/60 bg-muted/35 px-2.5 py-1">
                      {typeLabel(activeArtifact.diagramType)}
                    </span>
                    <span className="rounded-md border border-border/60 bg-muted/35 px-2.5 py-1">
                      {lineCount(activeArtifact.mermaidCode)} {t("diagram.lines")}
                    </span>
                    <span className="rounded-md border border-border/60 bg-muted/35 px-2.5 py-1">
                      {activeIndex + 1} / {artifacts.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-muted/20 p-4">
              <p className="ui-overline mb-3 text-[10px]">{t("diagram.collection")}</p>
              <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0">
                {artifacts.map((artifact, index) => {
                  const id = String(index);
                  const lines = lineCount(artifact.mermaidCode);
                  const relations = relationCount(artifact.mermaidCode);
                  const active = tab === id;
                  return (
                    <TabsTrigger
                      key={`${artifact.title}-${index}`}
                      value={id}
                      title={artifact.title}
                      className={cn(
                        "group h-auto w-full items-stretch justify-start rounded-lg border border-border/50 bg-background/55 p-0 text-left transition-colors hover:border-primary/35 hover:bg-background/80 data-[state=active]:border-primary/60 data-[state=active]:bg-background data-[state=active]:shadow-[0_0_0_1px_rgba(59,125,240,0.18)]",
                      )}
                    >
                      <span className="flex w-full gap-3 p-3">
                        <span
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-semibold tabular-nums",
                            active
                              ? "border-primary/45 bg-primary/15 text-primary"
                              : "border-border/60 bg-muted/35 text-muted-foreground",
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
                            {artifact.title}
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="capitalize">{typeLabel(artifact.diagramType)}</span>
                            <span aria-hidden="true">/</span>
                            <span className="tabular-nums">
                              {lines} {t("diagram.lines")}
                            </span>
                            <span aria-hidden="true">/</span>
                            <span className="tabular-nums">
                              {relations} {t("diagram.links")}
                            </span>
                          </span>
                        </span>
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {artifacts.map((artifact, index) => (
            <Button
              key={`${artifact.title}-mobile-${index}`}
              type="button"
              variant={tab === String(index) ? "default" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => setTab(String(index))}
            >
              {index + 1}
            </Button>
          ))}
        </div>

        {artifacts.map((artifact, index) => (
          <TabsContent
            key={`${artifact.title}-${index}`}
            value={String(index)}
            className="mt-5 focus-visible:outline-none"
          >
            <MermaidView code={artifact.mermaidCode} exportBasename={artifact.title} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
