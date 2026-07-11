"use client";

import { ArrowRight, Inbox, ListChecks, Plus, ShieldCheck } from "lucide-react";
import type { RecentMeeting } from "@/lib/recent-meetings";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/components/i18n-provider";

export type OverviewPanelProps = {
  recent: RecentMeeting[];
  onNewAnalysis: () => void;
  authMode?: "disabled" | "keycloak";
};

function startOfDayMs(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function OverviewPanel({
  recent,
  onNewAnalysis,
  authMode = "disabled",
}: OverviewPanelProps) {
  const { t } = useI18n();
  const now = new Date();
  const weekAgo = startOfDayMs(now) - 7 * 24 * 60 * 60 * 1000;

  const completedLast7 = recent.filter((r) => {
    if (r.status !== "completed") {
      return false;
    }
    const t = new Date(r.updatedAt).getTime();
    return !Number.isNaN(t) && t >= weekAgo;
  }).length;

  const totalActions = recent.reduce(
    (sum, r) => sum + (typeof r.actionCount === "number" ? r.actionCount : 0),
    0,
  );

  return (
    <div className="space-y-12">
      <header className="border-b border-border/50 pb-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="ui-overline text-primary">{t("breadcrumb.inbox")}</p>
            <h1 className="mt-3 text-display sm:text-4xl">{t("overview.title")}</h1>
            <p className="mt-4 max-w-xl text-body">{t("overview.copy")}</p>
          </div>
          <Button
            type="button"
            size="lg"
            className="h-12 px-5 text-base shadow-sm"
            onClick={onNewAnalysis}
          >
            <Plus aria-hidden="true" />
            {t("overview.new")}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </header>

      <section className="ui-section">
        <h2 className="ui-overline mb-4">{t("overview.activity")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="ui-panel flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Inbox aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium">{t("overview.completed")}</p>
              <p className="text-2xl font-semibold tracking-tight">{completedLast7}</p>
              <p className="text-xs text-muted-foreground">{t("overview.last7")}</p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="ui-panel flex cursor-help items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <ListChecks aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium">{t("overview.actions")}</p>
                  <p className="text-2xl font-semibold tracking-tight">{totalActions || "—"}</p>
                  <p className="text-xs text-muted-foreground">{t("overview.history")}</p>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              {t("overview.actionsHelp")}
            </TooltipContent>
          </Tooltip>
        </div>
      </section>

      <section className="ui-section">
        <details className="ui-panel-quiet group rounded-lg p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
            {t("overview.privacy")}
            <span className="ml-2 text-muted-foreground">▾</span>
          </summary>
          <p className="mt-3 text-sm text-muted-foreground">
            {authMode === "keycloak" ? (
              <>{t("overview.privacyProtected")}</>
            ) : (
              <>{t("overview.privacyLocal")}</>
            )}
          </p>
        </details>
      </section>
    </div>
  );
}
