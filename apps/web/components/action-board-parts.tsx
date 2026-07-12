"use client";

import type { AnalysisOutput } from "@omnivox/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import type { ActionStatus } from "@/hooks/use-optimistic-action-statuses";
import { cn } from "@/lib/utils";

export type TaggedAction = {
  action: AnalysisOutput["actions"][number];
  stableId: string;
};

type Translate = ReturnType<typeof useI18n>["t"];

function priorityVariant(p: string): "destructive" | "default" | "secondary" {
  if (p === "high") {
    return "destructive";
  }
  if (p === "medium") {
    return "default";
  }
  return "secondary";
}

function riskVariant(r: string): "outline" | "secondary" | "success" {
  if (r === "high") {
    return "outline";
  }
  if (r === "medium") {
    return "secondary";
  }
  return "success";
}

export function statusLabel(status: ActionStatus, t: Translate): string {
  const labels: Record<ActionStatus, string> = {
    todo: t("actions.statusTodo"),
    in_progress: t("actions.statusInProgress"),
    blocked: t("actions.statusBlocked"),
    done: t("actions.statusDone"),
  };
  return labels[status];
}

function actionTypeLabel(
  type: AnalysisOutput["actions"][number]["actionType"],
  t: Translate,
): string {
  const labels: Record<AnalysisOutput["actions"][number]["actionType"], string> = {
    task: t("actions.typeTask"),
    decision: t("actions.typeDecision"),
    risk: t("actions.typeRisk"),
    follow_up: t("actions.typeFollowUp"),
  };
  return labels[type];
}

export function priorityLabel(priority: string, t: Translate): string {
  if (priority === "high") return t("priority.high");
  if (priority === "medium") return t("priority.medium");
  if (priority === "low") return t("priority.low");
  return priority;
}

export function riskLabel(risk: string, t: Translate): string {
  if (risk === "high") return t("risk.high");
  if (risk === "medium") return t("risk.medium");
  if (risk === "low") return t("risk.low");
  return risk;
}

export function formatDue(iso: string | null | undefined, locale: string, t: Translate): string {
  if (!iso) {
    return t("actions.noDue");
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return t("actions.invalidDue");
  }
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function dueState(iso: string | null | undefined): "overdue" | "soon" | "later" | "none" {
  if (!iso) {
    return "none";
  }
  const due = new Date(iso).getTime();
  if (Number.isNaN(due)) {
    return "none";
  }
  const now = Date.now();
  if (due < now) {
    return "overdue";
  }
  if (due - now <= 1000 * 60 * 60 * 24 * 7) {
    return "soon";
  }
  return "later";
}

function dueTone(iso: string | null | undefined): string {
  const state = dueState(iso);
  if (state === "overdue") {
    return "border-destructive/45 bg-destructive/15 text-destructive";
  }
  if (state === "soon") {
    return "border-warning/45 bg-warning/15 text-warning";
  }
  return "border-border/60 bg-muted/25 text-muted-foreground";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) {
    return "?";
  }
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function Metric({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: number;
  tone?: "normal" | "hot" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        tone === "hot"
          ? "border-destructive/45 bg-destructive/10"
          : tone === "warn"
            ? "border-warning/45 bg-warning/10"
            : "border-border/60 bg-background/70",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export function ActionLane({
  dropTarget,
  lane,
  selectedId,
  syncingMap,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onSelect,
  onStatus,
  statusFor,
}: {
  dropTarget: ActionStatus | null;
  lane: { status: ActionStatus; rows: TaggedAction[] };
  selectedId: string | null;
  syncingMap: Record<string, boolean>;
  onDragEnd: () => void;
  onDragOver: (status: ActionStatus | null) => void;
  onDragStart: (id: string) => void;
  onDrop: (status: ActionStatus, draggedId: string | null) => void;
  onSelect: (id: string) => void;
  onStatus: (id: string, status: ActionStatus) => void;
  statusFor: (id: string) => ActionStatus;
}) {
  const { t } = useI18n();

  return (
    <section
      className={cn(
        "min-h-[420px] w-[360px] shrink-0 rounded-lg border bg-muted/15 transition-colors xl:flex-1",
        dropTarget === lane.status ? "border-primary/70 bg-primary/10" : "border-border/55",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver(lane.status);
      }}
      onDragLeave={(event) => {
        // dragleave also fires when crossing into a child of the lane; only
        // clear the highlight when the pointer actually leaves the lane.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onDragOver(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(lane.status, event.dataTransfer.getData("text/plain") || null);
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{statusLabel(lane.status, t)}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {lane.rows.length} {t("actions.count")}
          </p>
        </div>
        <Badge
          variant={
            lane.status === "done"
              ? "success"
              : lane.status === "in_progress"
                ? "default"
                : "outline"
          }
        >
          {statusLabel(lane.status, t)}
        </Badge>
      </div>
      <div className="space-y-2 p-2">
        {lane.rows.map((row) => (
          <ActionCard
            key={row.stableId}
            row={row}
            selected={selectedId === row.stableId}
            status={statusFor(row.stableId)}
            syncing={Boolean(syncingMap[row.stableId])}
            onSelect={() => onSelect(row.stableId)}
            onStatus={onStatus}
            onDragStart={() => onDragStart(row.stableId)}
            onDragEnd={onDragEnd}
          />
        ))}
        {lane.rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 px-3 py-10 text-center text-xs text-muted-foreground">
            {t("actions.dropHere")}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ActionCard({
  row,
  selected,
  status,
  syncing,
  onSelect,
  onStatus,
  onDragStart,
  onDragEnd,
}: {
  row: TaggedAction;
  selected: boolean;
  status: ActionStatus;
  syncing: boolean;
  onSelect: () => void;
  onStatus: (id: string, status: ActionStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { t, locale } = useI18n();
  const item = row.action;
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      className={cn(
        "w-full cursor-grab rounded-lg border bg-background/80 p-3 text-left shadow-sm transition-colors active:cursor-grabbing hover:border-primary/40 hover:bg-background",
        selected ? "border-primary/60 ring-1 ring-primary/30" : "border-border/55",
        status === "done" && "opacity-70",
        syncing && "ring-1 ring-primary/20",
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", row.stableId);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/35 bg-primary/15 text-[10px] font-semibold text-primary">
          {initials(item.owner)}
        </span>
        <span className="min-w-0 flex-1">
          <span
            title={item.title}
            className={cn(
              "line-clamp-3 text-sm font-semibold leading-snug text-foreground",
              status === "done" && "line-through",
            )}
          >
            {item.title}
          </span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            {syncing ? (
              <Badge variant="secondary" className="text-[10px]">
                {t("actions.saving")}
              </Badge>
            ) : null}
            <Badge variant={priorityVariant(item.priority)} className="text-[10px] capitalize">
              {priorityLabel(item.priority, t)}
            </Badge>
            <Badge variant={riskVariant(item.risk)} className="text-[10px]">
              {t("label.risk")} {riskLabel(item.risk, t)}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {actionTypeLabel(item.actionType, t)}
            </Badge>
          </span>
          <span
            className={cn(
              "mt-2 inline-flex rounded-md border px-2 py-1 text-[10px]",
              dueTone(item.dueDate),
            )}
          >
            {formatDue(item.dueDate, locale, t)}
          </span>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {(["todo", "in_progress", "blocked", "done"] as const).map((nextStatus) => (
          <button
            key={nextStatus}
            type="button"
            className={cn(
              "rounded-md border px-2 py-1.5 text-[10px] transition-colors",
              status === nextStatus
                ? "border-primary/45 bg-primary/15 text-primary"
                : "border-border/55 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onStatus(row.stableId, nextStatus);
            }}
          >
            {statusLabel(nextStatus, t)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ActionDetail({
  row,
  status,
  syncing,
  onStatus,
  compact = false,
}: {
  row: TaggedAction;
  status: ActionStatus;
  syncing: boolean;
  onStatus: (id: string, status: ActionStatus) => void;
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const item = row.action;
  return (
    <div
      className={cn(
        "rounded-lg border border-border/55 bg-background/75 p-3",
        !compact && "sticky top-24",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="ui-overline mb-2 text-[10px]">
            {syncing ? t("actions.saving") : t("actions.selected")}
          </p>
          <h4 className="text-base font-semibold leading-tight text-foreground lg:text-lg">
            {item.title}
          </h4>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {(["todo", "in_progress", "blocked", "done"] as const).map((nextStatus) => (
            <Button
              key={nextStatus}
              type="button"
              variant={status === nextStatus ? "default" : "outline"}
              size="sm"
              onClick={() => onStatus(row.stableId, nextStatus)}
            >
              {statusLabel(nextStatus, t)}
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <DetailRow label={t("actions.owner")} value={item.owner} />
        <DetailRow label={t("actions.due")} value={formatDue(item.dueDate, locale, t)} />
        <DetailRow label={t("label.priority")} value={priorityLabel(item.priority, t)} />
        <DetailRow label={t("label.risk")} value={riskLabel(item.risk, t)} />
        <DetailRow label={t("actions.type")} value={actionTypeLabel(item.actionType, t)} />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/55 bg-background/65 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-foreground">{value}</p>
    </div>
  );
}
