"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalysisOutput, OutputLanguage } from "@omnivox/shared";
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  FileDown,
  Link2,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { ActionBoard } from "@/components/action-board";
import { DiagramGallery } from "@/components/diagram-gallery";
import { ExecutiveBrief } from "@/components/executive-brief";
import { TranscriptWorkspace } from "@/components/transcript-workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  EmptyBlock,
  ExportCard,
  ExportMenuButton,
  InsightStrip,
  OnDemandBlock,
  StatChip,
  UnavailableReport,
  WorkspaceHeader,
  WorkspaceTile,
  sentimentLabel,
} from "@/components/results-workspace-panels";
import { useI18n } from "@/components/i18n-provider";
import { useSessionCsrf } from "@/hooks/use-session-csrf";
import type { PipelineJobResponse, PipelinePollError } from "@/hooks/use-pipeline-job";
import {
  useSmoothArtifactGeneration,
  type ArtifactKind,
} from "@/hooks/use-smooth-artifact-generation";
import { buildMeetingExportMarkdown, downloadTextFile } from "@/lib/export-markdown";
import { buildActionsIcs, buildSlackSummary, copyToClipboard } from "@/lib/integrations-export";
import { parseFailedResponse } from "@/lib/parse-api-error";
import { pipelineProgressPercent, pipelineStateLabelForLocale } from "@/lib/pipeline-ui";
import { cn } from "@/lib/utils";

export type ResultsWorkspaceProps = {
  jobId: string | null;
  meetingId: string;
  displayTitle: string;
  result: AnalysisOutput | null;
  pipelineJob: PipelineJobResponse | null;
  pollError: PipelinePollError | null;
  isLoading?: boolean;
  onGoHome?: () => void;
};

const WORKSPACE_VIEWS = [
  { id: "overview", labelKey: "label.overview" },
  { id: "diagrams", labelKey: "label.diagrams" },
  { id: "actions", labelKey: "label.actions" },
  { id: "transcript", labelKey: "label.transcript" },
  { id: "export", labelKey: "label.export" },
] as const;

type WorkspaceView = (typeof WORKSPACE_VIEWS)[number]["id"];
type TranslationLanguage = Exclude<OutputLanguage, "auto">;

const TRANSLATION_OPTIONS: { value: TranslationLanguage; label: string }[] = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
];

export function ResultsWorkspace({
  jobId,
  meetingId,
  displayTitle,
  result,
  pipelineJob,
  pollError,
  isLoading = false,
  onGoHome,
}: ResultsWorkspaceProps) {
  const { t, locale } = useI18n();
  const { csrfToken, ready: csrfReady } = useSessionCsrf();
  const [copiedHint, setCopiedHint] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceView>("overview");
  const [translatedResult, setTranslatedResult] = useState<AnalysisOutput | null>(null);
  const [translationLanguage, setTranslationLanguage] = useState<TranslationLanguage>("en");
  const [translationError, setTranslationError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    setTranslatedResult(null);
    setTranslationError("");
    setOperationError("");
  }, [jobId]);

  useEffect(() => {
    setTranslatedResult(null);
    setTranslationError("");
  }, [result]);

  const visibleResult = translatedResult ?? result;
  const isTranslatedView = Boolean(translatedResult);

  const onArtifactTimeout = useCallback(() => {
    setOperationError(t("result.generationTimeout"));
  }, [t]);

  const {
    pendingArtifacts,
    start: startPendingArtifact,
    stop: stopPendingArtifact,
    reset: resetPendingArtifacts,
  } = useSmoothArtifactGeneration({
    ready: {
      diagrams: Boolean(result?.artifacts.length),
      actions: Boolean(result?.actions.length),
    },
    failed: {
      diagrams: result?.artifactStatus?.diagrams?.state === "failed",
      actions: result?.artifactStatus?.actions?.state === "failed",
    },
    onTimeout: onArtifactTimeout,
  });

  useEffect(() => {
    resetPendingArtifacts();
  }, [jobId, resetPendingArtifacts]);

  const flashCopied = useCallback((label: string) => {
    setCopiedHint(label);
    window.setTimeout(() => setCopiedHint(null), 2200);
  }, []);

  const exportTitle = displayTitle.trim() || meetingId;

  const onCopyBrief = async () => {
    if (!visibleResult) {
      return;
    }
    const ok = await copyToClipboard(visibleResult.executiveBriefMarkdown);
    flashCopied(ok ? t("result.copyBriefOk") : t("result.copyFail"));
  };

  const onCopySlack = async () => {
    if (!visibleResult) {
      return;
    }
    const text = buildSlackSummary({ title: exportTitle, result: visibleResult });
    const ok = await copyToClipboard(text);
    flashCopied(ok ? t("result.copySlackOk") : t("result.copyFail"));
  };

  const onDownloadMd = () => {
    if (!visibleResult) {
      return;
    }
    const md = buildMeetingExportMarkdown({ meetingId: exportTitle, result: visibleResult });
    const safeName = exportTitle.replace(/[^\w\-]+/g, "_").slice(0, 80);
    downloadTextFile(`omnivox_${safeName}.md`, md);
    flashCopied(t("result.downloadReportOk"));
  };

  const onDownloadIcs = () => {
    if (!visibleResult) {
      return;
    }
    const ics = buildActionsIcs({ title: exportTitle, result: visibleResult });
    const safeName = exportTitle.replace(/[^\w\-]+/g, "_").slice(0, 80);
    downloadTextFile(`omnivox_actions_${safeName}.ics`, ics, "text/calendar;charset=utf-8");
    flashCopied(t("result.downloadIcsOk"));
  };

  const onCopyJobId = async () => {
    if (!jobId) {
      return;
    }
    const ok = await copyToClipboard(jobId);
    flashCopied(ok ? t("result.copyJobOk") : t("result.copyFail"));
  };

  const onCopyReportLink = async () => {
    if (!jobId) {
      return;
    }
    const href = `${window.location.origin}/executions/${encodeURIComponent(jobId)}`;
    const ok = await copyToClipboard(href);
    flashCopied(ok ? t("result.copyLinkOk") : t("result.copyFail"));
  };

  const onTranslateReport = async () => {
    if (!jobId || !result || !csrfReady || !csrfToken) {
      return;
    }
    setIsTranslating(true);
    setTranslationError("");
    try {
      const response = await fetch(`/api/v1/pipeline/${jobId}/translate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ targetLanguage: translationLanguage }),
      });
      if (!response.ok) {
        throw new Error(await parseFailedResponse(response));
      }
      const payload = (await response.json()) as { result: AnalysisOutput };
      setTranslatedResult(payload.result);
      flashCopied(t("result.translatedOk"));
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : t("result.translationFail"));
    } finally {
      setIsTranslating(false);
    }
  };

  const requestArtifact = useCallback(
    async (artifact: ArtifactKind) => {
      if (!jobId || !result || !csrfReady || !csrfToken || translatedResult) {
        return;
      }
      const state = result.artifactStatus?.[artifact]?.state;
      const alreadyReady =
        artifact === "diagrams" ? result.artifacts.length > 0 : result.actions.length > 0;
      if (alreadyReady) {
        return;
      }
      if (state === "generating") {
        setOperationError("");
        startPendingArtifact(artifact);
        window.dispatchEvent(new CustomEvent("omni-pipeline-watch", { detail: { jobId } }));
        return;
      }
      setOperationError("");
      startPendingArtifact(artifact);
      window.dispatchEvent(new CustomEvent("omni-pipeline-watch", { detail: { jobId } }));
      try {
        const response = await fetch(`/api/v1/pipeline/${jobId}/${artifact}/generate`, {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
        });
        if (!response.ok) {
          setOperationError(await parseFailedResponse(response));
          stopPendingArtifact(artifact);
          return;
        }
        window.dispatchEvent(new CustomEvent("omni-pipeline-watch", { detail: { jobId } }));
      } catch (error) {
        setOperationError(error instanceof Error ? error.message : t("result.genericError"));
        stopPendingArtifact(artifact);
      }
    },
    [
      csrfReady,
      csrfToken,
      jobId,
      result,
      startPendingArtifact,
      stopPendingArtifact,
      t,
      translatedResult,
    ],
  );

  const jobStateLine = pipelineJob ? pipelineStateLabelForLocale(pipelineJob.state, locale) : "";

  const showProgress = Boolean(
    jobId && pipelineJob && pipelineJob.state !== "completed" && pipelineJob.state !== "failed",
  );

  const priorityInsight = useMemo(() => {
    if (!visibleResult?.actions.length) {
      return { high: 0, medium: 0, low: 0 };
    }
    return visibleResult.actions.reduce(
      (acc, a) => {
        const k = a.priority as keyof typeof acc;
        if (k in acc) {
          acc[k] += 1;
        }
        return acc;
      },
      { high: 0, medium: 0, low: 0 },
    );
  }, [visibleResult]);

  const riskInsight = useMemo(() => {
    if (!visibleResult?.actions.length) {
      return { high: 0, medium: 0, low: 0 };
    }
    return visibleResult.actions.reduce(
      (acc, a) => {
        const k = a.risk as keyof typeof acc;
        if (k in acc) {
          acc[k] += 1;
        }
        return acc;
      },
      { high: 0, medium: 0, low: 0 },
    );
  }, [visibleResult]);

  const heading = displayTitle.trim() || meetingId || "Meeting";
  const unavailable =
    pollError && !pipelineJob && (pollError.status === 403 || pollError.status === 404);
  const diagramState = pendingArtifacts.diagrams.active
    ? "generating"
    : (visibleResult?.artifactStatus?.diagrams?.state ??
      (visibleResult?.artifacts.length ? "completed" : "pending"));
  const actionState = pendingArtifacts.actions.active
    ? "generating"
    : (visibleResult?.artifactStatus?.actions?.state ??
      (visibleResult?.actions.length ? "completed" : "pending"));
  const urgentActions = useMemo(() => {
    if (!visibleResult) {
      return [];
    }
    return [...visibleResult.actions]
      .sort((a, b) => {
        const priority =
          (a.priority === "high" ? 0 : a.priority === "medium" ? 1 : 2) -
          (b.priority === "high" ? 0 : b.priority === "medium" ? 1 : 2);
        if (priority !== 0) {
          return priority;
        }
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        return ad - bd;
      })
      .slice(0, 4);
  }, [visibleResult]);

  const body = unavailable ? (
    <UnavailableReport
      title={
        pollError.status === 403
          ? t("result.unavailableForbiddenTitle")
          : t("result.unavailableMissingTitle")
      }
      description={
        pollError.status === 403
          ? t("result.unavailableForbiddenDesc")
          : t("result.unavailableMissingDesc")
      }
      detail={pollError.message}
      backLabel={t("result.backOverview")}
      onGoHome={onGoHome}
    />
  ) : (
    <>
      <header className="border-b border-border/50 pb-10">
        <p className="ui-overline text-primary">{t("result.report")}</p>
        <h1 className="mt-3 text-display sm:text-4xl">{heading}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {meetingId ? <span className="font-mono text-xs">{meetingId}</span> : null}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <StatChip
            label={t("label.sentiment")}
            value={sentimentLabel(visibleResult?.sentiment, t)}
          />
          <StatChip label={t("label.actions")} value={visibleResult?.actions.length ?? "—"} />
          <StatChip label={t("label.diagrams")} value={visibleResult?.artifacts.length ?? "—"} />
          {jobId ? <StatChip label={t("label.status")} value={jobStateLine || "—"} /> : null}
          {isTranslatedView ? (
            <StatChip label={t("label.language")} value={translationLanguage.toUpperCase()} />
          ) : null}
        </div>

        <div className="mt-8 flex flex-col gap-3 rounded-lg border border-border/60 bg-background/80 p-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              className="w-full gap-2 sm:w-auto"
              onClick={onDownloadMd}
              disabled={!visibleResult}
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              {t("result.download")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 sm:w-auto"
              onClick={() => void onCopyReportLink()}
              disabled={!jobId}
            >
              <Link2 aria-hidden="true" className="h-4 w-4" />
              {t("result.copyLink")}
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center rounded-md border border-border/70 bg-muted/20 p-1">
              <span className="flex h-9 items-center px-2 text-muted-foreground">
                <Sparkles aria-hidden="true" className="h-4 w-4" />
              </span>
              <select
                className="h-9 min-w-32 flex-1 rounded-md border-0 bg-transparent px-1 text-sm text-foreground focus-visible:outline-none"
                value={translationLanguage}
                onChange={(event) =>
                  setTranslationLanguage(event.target.value as TranslationLanguage)
                }
                disabled={!result || isTranslating}
                aria-label={t("result.translation")}
              >
                {TRANSLATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-2"
                onClick={() => void onTranslateReport()}
                disabled={!result || !jobId || !csrfReady || isTranslating}
              >
                {isTranslating ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : null}
                {isTranslating ? t("result.translating") : t("result.translate")}
              </Button>
              {isTranslatedView ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-2"
                  onClick={() => setTranslatedResult(null)}
                >
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                  {t("result.original")}
                </Button>
              ) : null}
            </div>

            <div className="relative">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between gap-2 sm:w-auto"
                onClick={() => setExportMenuOpen((open) => !open)}
                aria-expanded={exportMenuOpen}
              >
                <FileDown aria-hidden="true" className="h-4 w-4" />
                {t("result.moreExports")}
                <ChevronDown
                  aria-hidden="true"
                  className={cn("h-4 w-4 transition-transform", exportMenuOpen && "rotate-180")}
                />
              </Button>
              {exportMenuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-full min-w-64 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg sm:w-72">
                  <ExportMenuButton
                    icon={ClipboardList}
                    label={t("result.copyBrief")}
                    onClick={() => void onCopyBrief()}
                    disabled={!visibleResult}
                  />
                  <ExportMenuButton
                    icon={MessageSquareText}
                    label={t("result.copySlack")}
                    onClick={() => void onCopySlack()}
                    disabled={!visibleResult}
                  />
                  <ExportMenuButton
                    icon={CalendarDays}
                    label={t("result.downloadIcs")}
                    onClick={onDownloadIcs}
                    disabled={!visibleResult}
                  />
                  <ExportMenuButton
                    icon={Copy}
                    label={t("result.copyAnalysisLink")}
                    onClick={() => void onCopyReportLink()}
                    disabled={!jobId}
                  />
                  <ExportMenuButton
                    icon={MoreHorizontal}
                    label={t("result.copyJob")}
                    onClick={() => void onCopyJobId()}
                    disabled={!jobId}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {pollError ? (
        <Alert variant="destructive" className="mt-8">
          <AlertTitle>{t("result.updateFailed")}</AlertTitle>
          <AlertDescription>{pollError.message}</AlertDescription>
        </Alert>
      ) : null}

      {translationError ? (
        <Alert variant="destructive" className="mt-8">
          <AlertTitle>{t("result.translation")}</AlertTitle>
          <AlertDescription>{translationError}</AlertDescription>
        </Alert>
      ) : null}

      {operationError ? (
        <Alert variant="destructive" className="mt-8">
          <AlertTitle>{t("result.operationFailed")}</AlertTitle>
          <AlertDescription>{operationError}</AlertDescription>
        </Alert>
      ) : null}

      {showProgress ? (
        <div className="ui-panel-quiet mt-8 space-y-3 p-5" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{t("result.processing")}</span>
            <Badge variant="secondary">{jobStateLine}</Badge>
          </div>
          <Progress value={pipelineJob ? pipelineProgressPercent(pipelineJob.state) : 12} />
        </div>
      ) : null}

      {isLoading ? (
        <div className="ui-panel-quiet mt-8 space-y-3 p-5" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{t("result.loading")}</span>
            <Badge variant="secondary">{t("result.report")}</Badge>
          </div>
          <Progress value={38} />
          <p className="text-xs text-muted-foreground">{t("result.loadingDesc")}</p>
        </div>
      ) : null}

      {pipelineJob?.state === "failed" ? (
        <Alert variant="destructive" className="mt-8">
          <AlertTitle>{t("result.failed")}</AlertTitle>
          <AlertDescription>{pipelineJob.error ?? t("result.genericError")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-8 overflow-hidden rounded-lg border border-border/60 bg-background">
        <div className="flex gap-1 overflow-x-auto border-b border-border/60 bg-muted/20 p-2">
          {WORKSPACE_VIEWS.map((view) => (
            <Button
              key={view.id}
              type="button"
              size="sm"
              variant={activeView === view.id ? "default" : "ghost"}
              className="shrink-0"
              onClick={() => setActiveView(view.id)}
            >
              {t(view.labelKey)}
            </Button>
          ))}
        </div>

        <div className="min-h-[560px] p-4 sm:p-6">
          {activeView === "overview" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 space-y-6">
                <section>
                  <p className="ui-overline mb-3 text-[10px] text-primary">
                    {t("result.executive")}
                  </p>
                  <div className="ui-prose-width">
                    {visibleResult ? (
                      <ExecutiveBrief markdown={visibleResult.executiveBriefMarkdown} />
                    ) : (
                      <EmptyBlock>{t("result.awaiting")}</EmptyBlock>
                    )}
                  </div>
                </section>
                <section className="grid gap-3 sm:grid-cols-3">
                  <WorkspaceTile
                    label={t("label.diagrams")}
                    value={visibleResult?.artifacts.length ?? 0}
                    onClick={() => setActiveView("diagrams")}
                  />
                  <WorkspaceTile
                    label={t("label.actions")}
                    value={visibleResult?.actions.length ?? 0}
                    onClick={() => setActiveView("actions")}
                  />
                  <WorkspaceTile
                    label={t("label.segments")}
                    value={visibleResult?.transcriptSegments?.length ?? 0}
                    onClick={() => setActiveView("transcript")}
                  />
                </section>
              </div>
              <aside className="space-y-4">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <p className="ui-overline mb-3 text-[10px]">{t("result.lookNow")}</p>
                  <div className="space-y-2">
                    {urgentActions.length > 0 ? (
                      urgentActions.map((action, index) => (
                        <button
                          key={`${action.title}-${index}`}
                          type="button"
                          className="w-full rounded-md border border-border/55 bg-background/65 px-3 py-2 text-left text-sm hover:border-primary/45"
                          onClick={() => setActiveView("actions")}
                        >
                          <span className="line-clamp-2 font-medium text-foreground">
                            {action.title}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {action.owner} · {action.priority}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("result.noPriority")}</p>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <p className="ui-overline mb-3 text-[10px]">{t("result.distribution")}</p>
                  <InsightStrip
                    result={result}
                    priorityInsight={priorityInsight}
                    riskInsight={riskInsight}
                  />
                </div>
              </aside>
            </div>
          ) : null}

          {activeView === "diagrams" ? (
            <div className="space-y-4">
              <WorkspaceHeader
                eyebrow={t("result.visualWorkspace")}
                title={t("label.diagrams")}
                description={t("result.diagramsDesc")}
              />
              {visibleResult?.artifacts.length && !pendingArtifacts.diagrams.active ? (
                <DiagramGallery artifacts={visibleResult.artifacts} />
              ) : (
                <OnDemandBlock
                  title={
                    diagramState === "generating"
                      ? t("result.generatingDiagrams")
                      : t("result.generateDiagrams")
                  }
                  description={t("result.diagramsEmpty")}
                  action={t("result.generateDiagrams")}
                  loading={diagramState === "generating"}
                  progress={pendingArtifacts.diagrams.progress}
                  timedOut={pendingArtifacts.diagrams.timedOut}
                  retryLabel={t("result.retry")}
                  onClick={() => void requestArtifact("diagrams")}
                  disabled={!visibleResult || Boolean(translatedResult)}
                />
              )}
            </div>
          ) : null}

          {activeView === "actions" ? (
            <div className="space-y-4">
              <WorkspaceHeader
                eyebrow={t("result.executionWorkspace")}
                title={t("label.actions")}
                description={t("result.actionsDesc")}
              />
              {visibleResult?.actions.length && !pendingArtifacts.actions.active ? (
                <ActionBoard actions={visibleResult.actions} jobId={jobId} />
              ) : (
                <OnDemandBlock
                  title={
                    actionState === "generating"
                      ? t("result.generatingActions")
                      : t("result.generateActions")
                  }
                  description={t("result.actionsEmpty")}
                  action={t("result.generateActions")}
                  loading={actionState === "generating"}
                  progress={pendingArtifacts.actions.progress}
                  timedOut={pendingArtifacts.actions.timedOut}
                  retryLabel={t("result.retry")}
                  onClick={() => void requestArtifact("actions")}
                  disabled={!visibleResult || Boolean(translatedResult)}
                />
              )}
            </div>
          ) : null}

          {activeView === "transcript" ? (
            <div className="space-y-4">
              <WorkspaceHeader
                eyebrow={t("result.sourceWorkspace")}
                title={t("label.transcript")}
                description={t("result.transcriptDesc")}
              />
              {visibleResult ? (
                <TranscriptWorkspace
                  jobId={jobId}
                  result={visibleResult}
                  csrfToken={csrfToken}
                  csrfReady={csrfReady}
                  onToast={flashCopied}
                />
              ) : (
                <EmptyBlock>{t("result.transcriptUnavailable")}</EmptyBlock>
              )}
            </div>
          ) : null}

          {activeView === "export" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ExportCard
                title="Report Markdown"
                description={t("result.exportMdDesc")}
                action={t("result.download")}
                onClick={onDownloadMd}
                disabled={!visibleResult}
              />
              <ExportCard
                title="Brief"
                description={t("result.briefDesc")}
                action={t("result.copyBrief")}
                onClick={() => void onCopyBrief()}
                disabled={!visibleResult}
              />
              <ExportCard
                title="Slack / Teams"
                description={t("result.slackDesc")}
                action={t("result.copySlack")}
                onClick={() => void onCopySlack()}
                disabled={!visibleResult}
              />
              <ExportCard
                title={t("result.calendar")}
                description={t("result.calendarDesc")}
                action={t("result.downloadIcs")}
                onClick={onDownloadIcs}
                disabled={!visibleResult}
              />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );

  return (
    <article className="pb-8">
      {copiedHint ? (
        <div
          role="status"
          className="animate-fade-in fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border border-border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-md"
        >
          {copiedHint}
        </div>
      ) : null}

      <div className="min-w-0">{body}</div>
    </article>
  );
}
