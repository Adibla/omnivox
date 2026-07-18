"use client";

import { type MouseEvent } from "react";
import {
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Copy,
  FileText,
  Inbox,
  LogOut,
  Plus,
  RotateCcw,
  Trash2,
  UserCircle,
  X,
} from "lucide-react";
import type { RecentMeeting } from "@/lib/recent-meetings";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/components/i18n-provider";
import { copyToClipboard } from "@/lib/integrations-export";
import { cn } from "@/lib/utils";

type DashboardView = "overview" | "new" | "results";
type AuthMode = "disabled" | "keycloak";
type SessionUser = { subject: string; tenantId?: string; email?: string; name?: string } | null;

type DashboardSidebarProps = {
  activeJobId: string | null;
  authMode: AuthMode;
  authenticated: boolean;
  confirmDeleteJobId: string | null;
  locale: string;
  recent: RecentMeeting[];
  sidebarCollapsed: boolean;
  user: SessionUser;
  view: DashboardView;
  onCancelRemoveRecent: () => void;
  onCloseMobileNav: () => void;
  onConfirmRemoveRecent: (jobId: string, event: MouseEvent) => void;
  onLogout: () => void;
  onOpenNewAnalysis: () => void;
  onOpenOverview: () => void;
  onOpenRecent: (item: RecentMeeting) => void;
  onRequestRemoveRecent: (jobId: string, event: MouseEvent) => void;
  onRetryRecent: (jobId: string, event: MouseEvent) => void;
  onToggleSidebarCollapsed: () => void;
};

type DashboardUserMenuProps = {
  authMode: AuthMode;
  authenticated: boolean;
  tenantId: string;
  user: SessionUser;
  onLogout: () => void;
};

function formatRecentTime(iso: string, locale: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function recentStatusTone(status: RecentMeeting["status"]) {
  if (status === "completed") {
    return "border-success/35 bg-success/10 text-success";
  }
  if (status === "failed") {
    return "border-destructive/35 bg-destructive/10 text-destructive";
  }
  return "border-warning/35 bg-warning/10 text-warning";
}

function login() {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/api/v1/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function DashboardSidebar({
  activeJobId,
  authMode,
  authenticated,
  confirmDeleteJobId,
  locale,
  recent,
  sidebarCollapsed,
  user,
  view,
  onCancelRemoveRecent,
  onCloseMobileNav,
  onConfirmRemoveRecent,
  onLogout,
  onOpenNewAnalysis,
  onOpenOverview,
  onOpenRecent,
  onRequestRemoveRecent,
  onRetryRecent,
  onToggleSidebarCollapsed,
}: DashboardSidebarProps) {
  const { t } = useI18n();

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm">
            <img src="/omnivox_logo.png" alt="" className="h-full w-full object-cover" />
          </span>
          <div className={cn("min-w-0", sidebarCollapsed && "md:hidden")}>
            <p className="truncate text-[15px] font-semibold tracking-tight">OmniVox</p>
            <p className="ui-overline mt-0.5 truncate text-[10px] text-muted-foreground">
              {t("shell.dashboard")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:hidden"
          onClick={onCloseMobileNav}
          aria-label={t("sidebar.close")}
        >
          <X aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden h-8 w-8 md:inline-flex"
          onClick={onToggleSidebarCollapsed}
          aria-label={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          title={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
        >
          {sidebarCollapsed ? (
            <ChevronsRight aria-hidden="true" />
          ) : (
            <ChevronsLeft aria-hidden="true" />
          )}
        </Button>
      </div>

      <nav className="px-3 pb-3" aria-label={t("shell.nav")}>
        <div className="space-y-1 rounded-lg border border-border/50 bg-muted/20 p-1">
          <button
            type="button"
            className={cn(
              "flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium transition-colors",
              view === "overview"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
            )}
            aria-label={t("sidebar.inbox")}
            title={t("sidebar.inbox")}
            onClick={onOpenOverview}
          >
            <Inbox aria-hidden="true" className="h-4 w-4" />
            <span className={cn(sidebarCollapsed && "md:hidden")}>{t("sidebar.inbox")}</span>
          </button>
          <button
            type="button"
            className={cn(
              "flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold transition-colors",
              view === "new"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-background text-foreground shadow-sm hover:border-primary/35 hover:bg-background/85",
            )}
            aria-label={t("sidebar.new")}
            title={t("sidebar.new")}
            onClick={onOpenNewAnalysis}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span className={cn(sidebarCollapsed && "md:hidden")}>{t("sidebar.new")}</span>
          </button>
        </div>
      </nav>

      <Separator className="mx-4 w-auto" />

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col px-3 pb-4 pt-4",
          sidebarCollapsed && "md:hidden",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <p className="ui-overline text-[10px]">{t("sidebar.recent")}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-xs text-muted-foreground underline decoration-dotted">
                ?
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              {authMode === "keycloak"
                ? t("sidebar.recentHelp.protected")
                : t("sidebar.recentHelp.local")}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ul className="space-y-1" role="list">
            {recent.length === 0 ? (
              <li className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-5 text-center text-xs text-muted-foreground">
                {t("sidebar.noRecent")}
              </li>
            ) : (
              recent.map((item) => (
                <RecentExecutionItem
                  key={item.jobId}
                  activeJobId={activeJobId}
                  confirmDeleteJobId={confirmDeleteJobId}
                  item={item}
                  locale={locale}
                  onCancelRemoveRecent={onCancelRemoveRecent}
                  onConfirmRemoveRecent={onConfirmRemoveRecent}
                  onOpenRecent={onOpenRecent}
                  onRequestRemoveRecent={onRequestRemoveRecent}
                  onRetryRecent={onRetryRecent}
                />
              ))
            )}
          </ul>
        </div>
      </div>

      {authMode === "keycloak" ? (
        <div className="border-t border-border/60 px-3 py-3 lg:hidden">
          {authenticated ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <UserCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
                <UserIdentity user={user} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 h-8 w-full"
                onClick={onLogout}
              >
                <LogOut aria-hidden="true" />
                {t("sidebar.logout")}
              </Button>
            </div>
          ) : (
            <Button type="button" className="w-full" onClick={login}>
              {t("sidebar.login")}
            </Button>
          )}
        </div>
      ) : null}
    </>
  );
}

function RecentExecutionItem({
  activeJobId,
  confirmDeleteJobId,
  item,
  locale,
  onCancelRemoveRecent,
  onConfirmRemoveRecent,
  onOpenRecent,
  onRequestRemoveRecent,
  onRetryRecent,
}: Pick<
  DashboardSidebarProps,
  | "activeJobId"
  | "confirmDeleteJobId"
  | "locale"
  | "onCancelRemoveRecent"
  | "onConfirmRemoveRecent"
  | "onOpenRecent"
  | "onRequestRemoveRecent"
  | "onRetryRecent"
> & { item: RecentMeeting }) {
  const { t } = useI18n();
  const active = item.jobId === activeJobId;

  return (
    <li>
      <div
        className={cn(
          "group relative grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border p-2 transition-colors",
          active
            ? "border-primary/45 bg-primary/10 shadow-sm"
            : "border-transparent hover:border-border/70 hover:bg-muted/35",
        )}
      >
        {active ? (
          <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r bg-primary" />
        ) : null}
        <button
          type="button"
          className="flex min-w-0 gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onOpenRecent(item)}
          aria-label={`Apri ${item.title}`}
          aria-current={active ? "page" : undefined}
        >
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            <FileText aria-hidden="true" className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[13px] font-medium leading-snug">
              {item.title || item.meetingId}
            </span>
            <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <Clock3 aria-hidden="true" className="h-3 w-3" />
              <span>{formatRecentTime(item.updatedAt, locale)}</span>
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {active ? (
                <span className="inline-flex rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {t("sidebar.open")}
                </span>
              ) : null}
              <span
                className={cn(
                  "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium",
                  recentStatusTone(item.status),
                )}
              >
                {item.status === "completed"
                  ? t("status.completed")
                  : item.status === "failed"
                    ? t("status.failed")
                    : t("status.running")}
              </span>
            </span>
          </span>
        </button>
        <div className="flex w-8 shrink-0 flex-col items-center gap-1 opacity-100 transition-opacity md:opacity-65 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          {item.status === "failed" ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary"
              onClick={(event) => void onRetryRecent(item.jobId, event)}
              aria-label={t("result.retry")}
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={(event) => onRequestRemoveRecent(item.jobId, event)}
            aria-label={t("sidebar.removeRecent")}
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary"
            onClick={(event) => void copyRecentLink(item, event)}
            aria-label={t("result.copyAnalysisLink")}
          >
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>
        {confirmDeleteJobId === item.jobId ? (
          <div className="col-span-2 mt-1 rounded-md border border-destructive/25 bg-destructive/10 p-2">
            <p className="text-xs font-medium text-foreground">{t("sidebar.deleteConfirm")}</p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-7 px-2 text-xs"
                onClick={(event) => onConfirmRemoveRecent(item.jobId, event)}
              >
                {t("sidebar.delete")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  onCancelRemoveRecent();
                }}
              >
                {t("sidebar.cancel")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function DashboardUserMenu({
  authMode,
  authenticated,
  tenantId,
  user,
  onLogout,
}: DashboardUserMenuProps) {
  const { t } = useI18n();

  if (authMode !== "keycloak") {
    return (
      <div className="hidden items-center gap-2 rounded-lg border border-border/60 bg-muted/25 px-2.5 py-1.5 text-xs text-muted-foreground lg:flex">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />
        Locale
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Button type="button" size="sm" onClick={login}>
        {t("sidebar.login")}
      </Button>
    );
  }

  return (
    <details className="relative hidden lg:block [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border/60 bg-muted/25 px-2.5 py-1.5 transition-colors hover:bg-muted/40">
        <UserCircle aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <UserIdentity user={user} compact />
      </summary>
      <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
        <div className="border-b border-border/60 px-3 py-3">
          <UserIdentity user={user} />
          <p className="mt-2 inline-flex rounded border border-border/60 bg-muted/35 px-2 py-0.5 text-[11px] text-muted-foreground">
            Organizzazione {tenantId}
          </p>
          <p className="mt-1 inline-flex rounded border border-border/60 bg-muted/35 px-2 py-0.5 text-[11px] text-muted-foreground">
            {t("sidebar.protected")}
          </p>
        </div>
        <div className="p-1.5">
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-destructive hover:bg-destructive/10"
            onClick={onLogout}
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            {t("sidebar.logout")}
          </button>
        </div>
      </div>
    </details>
  );
}

function UserIdentity({ compact = false, user }: { compact?: boolean; user: SessionUser }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "truncate font-medium",
          compact ? "max-w-40 text-xs text-foreground" : "text-sm",
        )}
      >
        {user?.name || user?.email || t("sidebar.defaultUser")}
      </p>
      <p
        className={cn(
          "truncate text-muted-foreground",
          compact ? "max-w-40 text-[10px]" : "mt-0.5 text-xs",
        )}
      >
        {user?.email || t("sidebar.activeSession")}
      </p>
    </div>
  );
}

async function copyRecentLink(item: RecentMeeting, event: MouseEvent) {
  event.stopPropagation();
  const href = `${window.location.origin}/executions/${encodeURIComponent(item.jobId)}`;
  await copyToClipboard(href);
}
