"use client";

import type { AnalysisOutput } from "@omnivox/shared";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export function sentimentLabel(s: AnalysisOutput["sentiment"] | undefined, t: ReturnType<typeof useI18n>["t"]): string {
  if (!s) {
    return "-";
  }
  if (s === "positive") {
    return t("sentiment.positive");
  }
  if (s === "negative") {
    return t("sentiment.negative");
  }
  return t("sentiment.neutral");
}

export function StatChip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function InsightStrip({
  result,
  priorityInsight,
  riskInsight
}: {
  result: AnalysisOutput | null;
  priorityInsight: { high: number; medium: number; low: number };
  riskInsight: { high: number; medium: number; low: number };
}) {
  const { t } = useI18n();
  if (!result) {
    return <p className="text-sm text-muted-foreground">{t("result.availableWhenComplete")}</p>;
  }
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
      <div>
        <p className="ui-overline mb-2 text-[10px]">{t("label.priority")}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{t("priority.high")} {priorityInsight.high}</Badge>
          <Badge variant="outline">{t("priority.medium")} {priorityInsight.medium}</Badge>
          <Badge variant="outline">{t("priority.low")} {priorityInsight.low}</Badge>
        </div>
      </div>
      <div>
        <p className="ui-overline mb-2 text-[10px]">{t("label.risk")}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{t("risk.high")} {riskInsight.high}</Badge>
          <Badge variant="outline">{t("risk.medium")} {riskInsight.medium}</Badge>
          <Badge variant="outline">{t("risk.low")} {riskInsight.low}</Badge>
        </div>
      </div>
    </div>
  );
}

export function EmptyBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 px-6 py-14 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function WorkspaceHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header>
      <p className="ui-overline text-[10px]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
    </header>
  );
}

export function WorkspaceTile({ label, value, onClick }: { label: string; value: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="rounded-lg border border-border/60 bg-muted/20 p-4 text-left hover:border-primary/45 hover:bg-muted/30" onClick={onClick}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground tabular-nums">{value}</p>
    </button>
  );
}

export function ExportMenuButton({
  icon: Icon,
  label,
  disabled,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

export function OnDemandBlock({
  title,
  description,
  action,
  loading,
  progress = 0,
  timedOut,
  retryLabel,
  disabled,
  onClick
}: {
  title: string;
  description: string;
  action: string;
  loading?: boolean;
  progress?: number;
  timedOut?: boolean;
  retryLabel?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-6 py-14 text-center">
      <div className="mx-auto max-w-md">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {loading ? (
          <div className="mx-auto mt-6 max-w-xs space-y-3" aria-hidden="true">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="h-14 animate-pulse rounded-md border border-border/45 bg-background/70" />
              <span className="h-14 animate-pulse rounded-md border border-border/45 bg-background/70 [animation-delay:120ms]" />
              <span className="h-14 animate-pulse rounded-md border border-border/45 bg-background/70 [animation-delay:240ms]" />
            </div>
          </div>
        ) : null}
        {timedOut ? <p className="mt-4 text-xs text-warning">{description}</p> : null}
        <Button type="button" className="mt-5 gap-2" onClick={onClick} disabled={disabled || loading}>
          {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {loading ? title : timedOut && retryLabel ? retryLabel : action}
        </Button>
      </div>
    </div>
  );
}

export function UnavailableReport({
  title,
  description,
  detail,
  backLabel,
  onGoHome
}: {
  title: string;
  description: string;
  detail: string;
  backLabel: string;
  onGoHome?: () => void;
}) {
  return (
    <div className="grid min-h-[520px] place-items-center">
      <div className="max-w-lg rounded-lg border border-border/60 bg-background p-8 text-center shadow-sm">
        <p className="ui-overline text-primary">Report</p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <p className="mt-4 rounded-md border border-border/50 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">{detail}</p>
        <div className="mt-6 flex justify-center">
          <Button type="button" onClick={onGoHome}>
            {backLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ExportCard({
  title,
  description,
  action,
  disabled,
  onClick
}: {
  title: string;
  description: string;
  action: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-5">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 min-h-12 text-sm text-muted-foreground">{description}</p>
      <Button type="button" className="mt-5 w-full" variant="secondary" onClick={onClick} disabled={disabled}>
        {action}
      </Button>
    </div>
  );
}
