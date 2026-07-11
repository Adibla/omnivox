"use client";

import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisOutput } from "@omnivox/shared";
import { AppShell } from "@/components/app-shell";
import { NewAnalysisPanel } from "@/components/new-analysis-panel";
import { OverviewPanel } from "@/components/overview-panel";
import { ResultsWorkspace } from "@/components/results-workspace";
import { DashboardSidebar, DashboardUserMenu } from "@/components/dashboard-sidebar";
import { useI18n } from "@/components/i18n-provider";
import { usePipelineJob } from "@/hooks/use-pipeline-job";
import { useSessionCsrf } from "@/hooks/use-session-csrf";
import {
  loadRecentMeetings,
  type RecentMeeting,
  removeRecentMeeting,
  upsertRecentMeeting
} from "@/lib/recent-meetings";

type DashboardView = "overview" | "new" | "results";

type ResultContext = {
  meetingId: string;
  title: string;
};

type AppDashboardProps = {
  initialView?: DashboardView;
  initialJobId?: string | null;
};

const STARTED_JOBS_SESSION_KEY = "omnivox:started-job-ids";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "omnivox:sidebar-collapsed";

function loadStartedJobIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.sessionStorage.getItem(STARTED_JOBS_SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function rememberStartedJob(jobId: string) {
  if (typeof window === "undefined") {
    return;
  }
  const ids = [jobId, ...[...loadStartedJobIds()].filter((id) => id !== jobId)].slice(0, 20);
  window.sessionStorage.setItem(STARTED_JOBS_SESSION_KEY, JSON.stringify(ids));
}

function forgetStartedJob(jobId: string) {
  if (typeof window === "undefined") {
    return;
  }
  const ids = [...loadStartedJobIds()].filter((id) => id !== jobId);
  window.sessionStorage.setItem(STARTED_JOBS_SESSION_KEY, JSON.stringify(ids));
}

function routeStateFromLocation(): { view: DashboardView; jobId: string | null } {
  const path = window.location.pathname;
  const executionMatch = path.match(/^\/executions\/([^/]+)$/);
  if (executionMatch?.[1]) {
    return { view: "results", jobId: decodeURIComponent(executionMatch[1]) };
  }
  if (path === "/new") {
    return { view: "new", jobId: null };
  }
  return { view: "overview", jobId: null };
}

export function AppDashboard({ initialView = "overview", initialJobId = null }: AppDashboardProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [view, setView] = useState<DashboardView>(initialView);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [recent, setRecent] = useState<RecentMeeting[]>([]);
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(initialJobId);
  const [result, setResult] = useState<AnalysisOutput | null>(null);
  const [resultContext, setResultContext] = useState<ResultContext | null>(null);
  const processedTerminalKeyRef = useRef<string | null>(null);
  const startedJobIdsRef = useRef<Set<string>>(new Set());
  const resultCacheRef = useRef<Map<string, AnalysisOutput>>(new Map());
  const { csrfToken, ready: sessionReady, authMode, authenticated, tenantId, user } = useSessionCsrf();

  const { job, pollError, isLoading: isJobLoading, isTerminal } = usePipelineJob(activeJobId, { enabled: Boolean(activeJobId) });

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true");
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    setView(initialView);
    setActiveJobId(initialJobId);
    setResult(null);
    if (initialView !== "results") {
      setResultContext(null);
    }
  }, [initialJobId, initialView]);

  useEffect(() => {
    const onPopState = () => {
      const next = routeStateFromLocation();
      setView(next.view);
      setActiveJobId(next.jobId);
      if (next.view !== "results") {
        setResultContext(null);
      }
      setMobileNavOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const refreshRecent = useCallback(() => {
    if (authMode === "keycloak") {
      return;
    }
    setRecent(loadRecentMeetings());
  }, [authMode]);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    if (authMode === "keycloak" && !authenticated) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/api/v1/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (authMode === "disabled") {
      refreshRecent();
    }
  }, [authMode, authenticated, refreshRecent, sessionReady]);

  useEffect(() => {
    if (authMode !== "keycloak" || !authenticated) {
      if (authMode === "keycloak") {
        setRecent([]);
      }
      return;
    }
    setRecent([]);
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/v1/executions");
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { items?: RecentMeeting[] };
      if (!cancelled && Array.isArray(payload.items)) {
        setRecent(payload.items);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authMode, authenticated]);

  useEffect(() => {
    processedTerminalKeyRef.current = null;
    setResult(activeJobId ? resultCacheRef.current.get(activeJobId) ?? null : null);
  }, [activeJobId]);

  useEffect(() => {
    if (!job) {
      return;
    }
    const meetingId = resultContext?.meetingId ?? job.meetingId ?? "";
    const title = resultContext?.title?.trim() || job.displayTitle?.trim() || meetingId || job.jobId;
    const terminalKey = `${job.jobId}:${job.state}`;
    const recentActiveItem = recent.find((item) => item.jobId === job.jobId);
    const shouldUpdateRecent =
      startedJobIdsRef.current.has(job.jobId) ||
      loadStartedJobIds().has(job.jobId) ||
      recentActiveItem?.status === "in_progress";

    if (!resultContext && (job.meetingId || job.jobId)) {
      setResultContext({
        meetingId: job.meetingId ?? job.jobId,
        title: job.displayTitle?.trim() || job.meetingId || job.jobId
      });
    }

    if (job.state === "completed" && job.result) {
      resultCacheRef.current.set(job.jobId, job.result);
      setResult(job.result);
      if (processedTerminalKeyRef.current === terminalKey) {
        return;
      }
      processedTerminalKeyRef.current = terminalKey;
      forgetStartedJob(job.jobId);
      if (shouldUpdateRecent && authMode === "disabled") {
        upsertRecentMeeting({
          jobId: job.jobId,
          meetingId: meetingId || job.jobId,
          title,
          status: "completed",
          updatedAt: new Date().toISOString(),
          actionCount: job.result.actions.length,
          diagramCount: job.result.artifacts.length
        });
        refreshRecent();
      } else if (shouldUpdateRecent) {
        setRecent((items) => [
          {
            jobId: job.jobId,
            meetingId: meetingId || job.jobId,
            title,
            status: "completed",
            updatedAt: new Date().toISOString(),
            actionCount: job.result?.actions.length,
            diagramCount: job.result?.artifacts.length
          },
          ...items.filter((item) => item.jobId !== job.jobId)
        ]);
      }
      setView("results");
      return;
    }

    if (job.state === "failed") {
      if (processedTerminalKeyRef.current === terminalKey) {
        return;
      }
      processedTerminalKeyRef.current = terminalKey;
      forgetStartedJob(job.jobId);
      if (shouldUpdateRecent && authMode === "disabled") {
        upsertRecentMeeting({
          jobId: job.jobId,
          meetingId: meetingId || job.jobId,
          title,
          status: "failed",
          updatedAt: new Date().toISOString()
        });
        refreshRecent();
      }
      setView("results");
    }
  }, [authMode, job, recent, resultContext, refreshRecent]);

  const handleJobStarted = useCallback((payload: { jobId: string; meetingId: string; title: string }) => {
    startedJobIdsRef.current.add(payload.jobId);
    rememberStartedJob(payload.jobId);
    setActiveJobId(payload.jobId);
    setResultContext({
      meetingId: payload.meetingId,
      title: payload.title
    });
    if (authMode === "disabled") {
      upsertRecentMeeting({
        jobId: payload.jobId,
        meetingId: payload.meetingId,
        title: payload.title || payload.meetingId,
        status: "in_progress",
        updatedAt: new Date().toISOString()
      });
      refreshRecent();
    }
    router.push(`/executions/${encodeURIComponent(payload.jobId)}`);
  }, [authMode, refreshRecent, router]);

  const openRecent = useCallback((item: RecentMeeting) => {
    if (item.jobId === activeJobId) {
      setView("results");
      setMobileNavOpen(false);
      return;
    }
    setResultContext({
      meetingId: item.meetingId,
      title: item.title
    });
    setActiveJobId(item.jobId);
    setView("results");
    setMobileNavOpen(false);
    window.history.pushState(null, "", `/executions/${encodeURIComponent(item.jobId)}`);
  }, [activeJobId]);


  const handleRemoveRecent = useCallback(
    (jobId: string, e: MouseEvent) => {
      e.stopPropagation();
      if (authMode === "keycloak" && authenticated && csrfToken) {
        void fetch(`/api/v1/executions/${jobId}`, {
          method: "DELETE",
          headers: { "x-csrf-token": csrfToken }
        });
        setRecent((items) => items.filter((item) => item.jobId !== jobId));
      } else {
        removeRecentMeeting(jobId);
        refreshRecent();
      }
      if (activeJobId === jobId) {
        setActiveJobId(null);
        setResult(null);
        setResultContext(null);
        router.push("/");
      }
    },
    [activeJobId, authMode, authenticated, csrfToken, refreshRecent, router]
  );

  const requestRemoveRecent = useCallback((jobId: string, e: MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteJobId((current) => (current === jobId ? null : jobId));
  }, []);


  const handleLogout = useCallback(async () => {
    const response = await fetch("/api/v1/auth/logout", { method: "POST" });
    const payload = response.ok ? ((await response.json()) as { logoutUrl?: string }) : {};
    setActiveJobId(null);
    setResult(null);
    setResultContext(null);
    window.location.replace(payload.logoutUrl ?? "/");
  }, []);

  const openNewAnalysis = useCallback(() => {
    setView("new");
    setActiveJobId(null);
    setResult(null);
    setResultContext(null);
    setMobileNavOpen(false);
    router.push("/new");
  }, [router]);

  const breadcrumb = useMemo(() => {
    if (view === "overview") {
      return t("breadcrumb.inbox");
    }
    if (view === "new") {
      return t("breadcrumb.new");
    }
    const title = resultContext?.title?.trim();
    return title ? `${t("breadcrumb.report")} · ${title}` : t("breadcrumb.report");
  }, [view, resultContext?.title, t]);

  const displayTitle = resultContext?.title?.trim() || resultContext?.meetingId || "";
  const displayMeetingId = resultContext?.meetingId || "";
  const topbarTitle = view === "results" ? displayTitle || t("breadcrumb.report") : breadcrumb;
  const topbarMeta =
    view === "results"
      ? displayMeetingId || activeJobId || ""
      : authMode === "keycloak" && authenticated
        ? user?.email || user?.name || ""
        : "";

  if (!sessionReady || (authMode === "keycloak" && !authenticated)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" aria-label="Loading" />
      </div>
    );
  }

  const sidebar = (
    <DashboardSidebar
      activeJobId={activeJobId}
      authMode={authMode}
      authenticated={authenticated}
      confirmDeleteJobId={confirmDeleteJobId}
      locale={locale}
      recent={recent}
      sidebarCollapsed={sidebarCollapsed}
      user={user}
      view={view}
      onCancelRemoveRecent={() => setConfirmDeleteJobId(null)}
      onCloseMobileNav={() => setMobileNavOpen(false)}
      onConfirmRemoveRecent={handleRemoveRecent}
      onLogout={handleLogout}
      onOpenNewAnalysis={openNewAnalysis}
      onOpenOverview={() => {
        setView("overview");
        setActiveJobId(null);
        setResult(null);
        setResultContext(null);
        setMobileNavOpen(false);
        router.push("/");
      }}
      onOpenRecent={openRecent}
      onRequestRemoveRecent={requestRemoveRecent}
      onToggleSidebarCollapsed={toggleSidebarCollapsed}
    />
  );

  return (
    <AppShell
      mobileNavOpen={mobileNavOpen}
      onOpenMobileNav={() => setMobileNavOpen(true)}
      mobileOverlay={
        mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-background/70 md:hidden"
            aria-label={t("sidebar.close")}
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null
      }
      sidebar={sidebar}
      sidebarCollapsed={sidebarCollapsed}
      topbarEnd={
        <DashboardUserMenu
          authMode={authMode}
          authenticated={authenticated}
          tenantId={tenantId}
          user={user}
          onLogout={handleLogout}
        />
      }
      header={
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{topbarTitle}</p>
          {topbarMeta ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{topbarMeta}</p> : null}
        </div>
      }
    >
      <div className="app-main-canvas">
        {view === "overview" && (authMode !== "keycloak" || authenticated) ? (
          <OverviewPanel recent={recent} onNewAnalysis={openNewAnalysis} authMode={authMode} />
        ) : null}
        {view === "new" && (authMode !== "keycloak" || authenticated) ? (
          <NewAnalysisPanel
            pipelineJob={job}
            pollError={pollError?.message ?? null}
            isTerminal={isTerminal}
            activeJobId={activeJobId}
            onJobStarted={handleJobStarted}
          />
        ) : null}
        {view === "results" && (authMode !== "keycloak" || authenticated) ? (
          <ResultsWorkspace
            jobId={activeJobId}
            meetingId={displayMeetingId}
            displayTitle={displayTitle}
            result={result}
            pipelineJob={job}
            pollError={pollError}
            isLoading={isJobLoading && !result}
            onGoHome={() => router.push("/")}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
