"use client";

import { useEffect, useMemo, useState } from "react";
import type { AnalysisOutput } from "@omnivox/shared";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { Input } from "@/components/ui/input";
import { useOptimisticActionStatuses, type ActionStatus } from "@/hooks/use-optimistic-action-statuses";
import { useSessionCsrf } from "@/hooks/use-session-csrf";
import {
  ActionDetail,
  ActionLane,
  Metric,
  dueState,
  type TaggedAction
} from "@/components/action-board-parts";

type ActionBoardProps = {
  actions: AnalysisOutput["actions"];
  jobId?: string | null;
};

type QuickFilter = "all" | "open" | "high" | "risk" | "due" | "unassigned-date";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function compareActions(a: TaggedAction, b: TaggedAction): number {
  const priority =
    PRIORITY_ORDER[a.action.priority as keyof typeof PRIORITY_ORDER] -
    PRIORITY_ORDER[b.action.priority as keyof typeof PRIORITY_ORDER];
  if (priority !== 0) {
    return priority;
  }
  const ad = a.action.dueDate ? new Date(a.action.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const bd = b.action.dueDate ? new Date(b.action.dueDate).getTime() : Number.POSITIVE_INFINITY;
  return ad - bd;
}

export function ActionBoard({ actions, jobId }: ActionBoardProps) {
  const { t, locale } = useI18n();
  const { csrfToken, ready: csrfReady } = useSessionCsrf();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QuickFilter>("all");
  const [selectedId, setSelectedId] = useState("action-0");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ActionStatus | null>(null);

  const tagged = useMemo(
    () =>
      actions.map((action, index) => ({
        action,
        stableId: action.id ?? `action-${index}`
      })),
    [actions]
  );

  const { syncingMap, syncError, setStatus, statusFor } = useOptimisticActionStatuses({
    actions,
    jobId,
    csrfReady,
    csrfToken,
    messages: {
      sessionNotReady: t("actions.sessionNotReady"),
      statusNotSaved: t("actions.statusNotSaved")
    }
  });

  useEffect(() => {
    setSelectedId((current) => (current && tagged.some((row) => row.stableId === current) ? current : tagged[0]?.stableId ?? "action-0"));
  }, [jobId, tagged]);

  const stats = useMemo(() => {
    const open = tagged.filter((row) => statusFor(row.stableId) !== "done");
    return {
      total: tagged.length,
      open: open.length,
      doing: tagged.filter((row) => statusFor(row.stableId) === "in_progress").length,
      blocked: tagged.filter((row) => statusFor(row.stableId) === "blocked").length,
      done: tagged.filter((row) => statusFor(row.stableId) === "done").length,
      high: open.filter((row) => row.action.priority === "high").length,
      risk: open.filter((row) => row.action.risk === "high").length,
      due: open.filter((row) => ["overdue", "soon"].includes(dueState(row.action.dueDate))).length
    };
  }, [tagged, statusFor]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tagged
      .filter((row) => {
        if (!q) {
          return true;
        }
        return `${row.action.title} ${row.action.owner}`.toLowerCase().includes(q);
      })
      .filter((row) => {
        const status = statusFor(row.stableId);
        if (filter === "open") {
          return status !== "done";
        }
        if (filter === "high") {
          return row.action.priority === "high" && status !== "done";
        }
        if (filter === "risk") {
          return row.action.risk === "high" && status !== "done";
        }
        if (filter === "due") {
          return ["overdue", "soon"].includes(dueState(row.action.dueDate)) && status !== "done";
        }
        if (filter === "unassigned-date") {
          return !row.action.dueDate && status !== "done";
        }
        return true;
      })
      .sort(compareActions);
  }, [tagged, query, filter, statusFor]);

  const lanes = useMemo(
    () =>
      (["todo", "in_progress", "blocked", "done"] as const).map((status) => ({
        status,
        rows: filtered.filter((row) => statusFor(row.stableId) === status)
      })),
    [filtered, statusFor]
  );

  const selected = filtered.find((row) => row.stableId === selectedId) ?? filtered[0] ?? tagged[0] ?? null;
  const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  if (tagged.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("actions.none")}</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
      <div className="border-b border-border/60 bg-muted/20 p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="ui-overline mb-2 text-[10px]">{t("actions.board")}</p>
            <h3 className="text-xl font-semibold leading-tight text-foreground">{t("actions.plan")}</h3>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {t("actions.planHelp")}
            </p>
          </div>
          <div className="grid min-w-[min(100%,520px)] grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label={t("actions.open")} value={stats.open} />
            <Metric label={t("actions.inProgress")} value={stats.doing} />
            <Metric label={t("actions.blocked")} value={stats.blocked} tone={stats.blocked > 0 ? "warn" : "normal"} />
            <Metric label={t("actions.highPriority")} value={stats.high} tone={stats.high > 0 ? "hot" : "normal"} />
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("actions.searchPlaceholder")}
            autoComplete="off"
            className="max-w-md bg-background/85"
          />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              ["all", t("actions.filterAll")],
              ["open", t("actions.filterOpen")],
              ["high", t("actions.filterHigh")],
              ["risk", t("actions.filterRisk")],
              ["due", t("actions.filterDue")],
              ["unassigned-date", t("actions.filterNoDue")]
            ].map(([id, label]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={filter === id ? "default" : "outline"}
                className="shrink-0"
                onClick={() => setFilter(id as QuickFilter)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        {syncError ? <p className="mt-3 text-xs text-destructive">{syncError}</p> : null}
      </div>

      <div>
        {selected ? (
          <div className="border-b border-border/60 bg-muted/10 p-3">
            <ActionDetail row={selected} status={statusFor(selected.stableId)} syncing={Boolean(syncingMap[selected.stableId])} onStatus={setStatus} compact />
          </div>
        ) : null}

        <div className="min-w-0 p-3">
          <div className="-mx-3 overflow-x-auto px-3 pb-2">
          <div className="flex min-w-max gap-3 xl:min-w-0">
            {lanes.map((lane) => (
              <ActionLane
                key={lane.status}
                dropTarget={dropTarget}
                lane={lane}
                selectedId={selected?.stableId ?? null}
                syncingMap={syncingMap}
                statusFor={statusFor}
                onDragOver={setDropTarget}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDropTarget(null);
                }}
                onDragStart={(id) => {
                  setDraggedId(id);
                  setSelectedId(id);
                }}
                onDrop={(status) => {
                  if (draggedId) {
                    setStatus(draggedId, status);
                    setSelectedId(draggedId);
                  }
                  setDraggedId(null);
                  setDropTarget(null);
                }}
                onSelect={setSelectedId}
                onStatus={setStatus}
              />
            ))}
          </div>
          </div>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("actions.noneFiltered")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
