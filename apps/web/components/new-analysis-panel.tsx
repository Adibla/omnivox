"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, FileAudio, Info, Play, Settings2, UploadCloud, X } from "lucide-react";
import {
  AUDIO_MAX_BYTES,
  SUPPORTED_AUDIO_ACCEPT,
  SUPPORTED_AUDIO_FORMATS,
  getDefaultContentTypeForAudioFormat,
  resolveSupportedAudioFormat,
  type MeetingTemplate,
  type OutputLanguage
} from "@omnivox/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/components/i18n-provider";
import type { PipelineJobResponse } from "@/hooks/use-pipeline-job";
import { useSessionCsrf } from "@/hooks/use-session-csrf";
import { parseFailedResponse } from "@/lib/parse-api-error";
import {
  type ClientUploadPhase,
  pipelineStateLabelForLocale,
  pipelineProgressPercent,
  uploadPhaseLabelForLocale
} from "@/lib/pipeline-ui";

const TEMPLATES: { value: MeetingTemplate; label: string }[] = [
  { value: "generic", label: "Riunione generica" },
  { value: "standup", label: "Daily / Stand-up" },
  { value: "board", label: "Board / Steering" },
  { value: "client", label: "Cliente" },
  { value: "retro", label: "Retrospettiva" }
];

const LANG_OPTIONS = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" }
];

const SUPPORTED_AUDIO_LABEL = SUPPORTED_AUDIO_FORMATS.map((format) => format.toUpperCase()).join(", ");
const AUDIO_MAX_MB = Math.floor(AUDIO_MAX_BYTES / (1024 * 1024));

function slugifyMeetingId(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80);
}

function buildMeetingId(value: string): string {
  const slug = slugifyMeetingId(value);
  const prefix = slug || "meeting";
  return `${prefix}-${Date.now()}`.slice(0, 96);
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function validateAudioFile(nextFile: File | null, locale: string): string {
  if (!nextFile) {
    return "";
  }
  const audioFormat = resolveSupportedAudioFormat({ fileName: nextFile.name, contentType: nextFile.type });
  if (!audioFormat) {
    return locale === "en"
      ? `Unsupported format. Use: ${SUPPORTED_AUDIO_LABEL}.`
      : `Formato non supportato. Usa: ${SUPPORTED_AUDIO_LABEL}.`;
  }
  if (nextFile.size > AUDIO_MAX_BYTES) {
    return locale === "en"
      ? `File too large. Current limit: ${AUDIO_MAX_MB} MB.`
      : `File troppo grande. Limite attuale: ${AUDIO_MAX_MB} MB.`;
  }
  return "";
}

async function sha256Hex(buffer: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export type NewAnalysisPanelProps = {
  pipelineJob: PipelineJobResponse | null;
  pollError: string | null;
  isTerminal: boolean;
  activeJobId: string | null;
  onJobStarted: (payload: { jobId: string; meetingId: string; title: string }) => void;
};

export function NewAnalysisPanel({
  pipelineJob,
  pollError,
  isTerminal,
  activeJobId,
  onJobStarted
}: NewAnalysisPanelProps) {
  const { t, locale } = useI18n();
  const { csrfToken, ready: csrfReady } = useSessionCsrf();
  const [wizardStep, setWizardStep] = useState(0);
  const [analysisName, setAnalysisName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [meetingTemplate, setMeetingTemplate] = useState<MeetingTemplate>("generic");
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>("auto");
  const [languageHint, setLanguageHint] = useState("it");
  const [transcriptText, setTranscriptText] = useState("");
  const [uploadPhase, setUploadPhase] = useState<ClientUploadPhase>("idle");
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (pipelineJob?.state === "completed" || pipelineJob?.state === "failed") {
      setIsRunning(false);
      setUploadPhase("idle");
    }
  }, [pipelineJob?.state]);

  const progressValue = useMemo(() => {
    if (activeJobId && pipelineJob && pipelineJob.state !== "failed") {
      return pipelineProgressPercent(pipelineJob.state);
    }
    switch (uploadPhase) {
      case "hashing":
        return 8;
      case "uploading":
        return 22;
      case "verifying":
        return 35;
      case "starting":
        return 48;
      case "awaiting_pipeline":
        return 55;
      default:
        return 0;
    }
  }, [activeJobId, pipelineJob, uploadPhase]);

  const statusLine = useMemo(() => {
    if (activeJobId && pipelineJob) {
      return pipelineStateLabelForLocale(pipelineJob.state, locale);
    }
    return uploadPhaseLabelForLocale(uploadPhase, locale);
  }, [activeJobId, locale, pipelineJob, uploadPhase]);

  const selectFile = (nextFile: File | null) => {
    setFile(nextFile);
    setFileError(validateAudioFile(nextFile, locale));
    if (nextFile) {
      setError("");
    }
  };

  const runPipeline = async () => {
    if (!file) {
      setError("Seleziona un file audio.");
      return;
    }
    const audioFormat = resolveSupportedAudioFormat({ fileName: file.name, contentType: file.type });
    if (!audioFormat) {
      setError(
        locale === "en"
          ? `Unsupported format. Use: ${SUPPORTED_AUDIO_LABEL}.`
          : `Formato non supportato. Usa: ${SUPPORTED_AUDIO_LABEL}.`
      );
      return;
    }
    if (file.size > AUDIO_MAX_BYTES) {
      setError(
        locale === "en"
          ? `File too large. Current limit: ${AUDIO_MAX_MB} MB.`
          : `File troppo grande. Limite attuale: ${AUDIO_MAX_MB} MB.`
      );
      return;
    }
    if (!csrfReady || !csrfToken) {
      setError("Inizializzazione sessione in corso… riprova tra un attimo.");
      return;
    }
    const displayTitle = analysisName.trim();
    const safeMeetingId = buildMeetingId(displayTitle);
    setError("");
    setIsRunning(true);
    try {
      setUploadPhase("hashing");
      const arrayBuffer = await file.arrayBuffer();
      const localSha256 = await sha256Hex(arrayBuffer);

      const presignResponse = await fetch("/api/v1/storage/presign", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          meetingId: safeMeetingId,
          contentType: file.type || getDefaultContentTypeForAudioFormat(audioFormat),
          audioFormat,
          contentLength: file.size,
          sha256: localSha256,
          retentionClass: "standard"
        })
      });
      if (!presignResponse.ok) {
        throw new Error(await parseFailedResponse(presignResponse));
      }

      const presignPayload = (await presignResponse.json()) as {
        uploadUrl: string;
        objectKey: string;
        requiredHeaders: Record<string, string>;
      };

      setUploadPhase("uploading");
      const putResponse = await fetch(presignPayload.uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": file.type || getDefaultContentTypeForAudioFormat(audioFormat),
          ...presignPayload.requiredHeaders
        },
        body: file
      });
      if (!putResponse.ok) {
        throw new Error(
          locale === "en"
            ? `Audio upload failed (HTTP ${putResponse.status}).`
            : `Upload audio non riuscito (HTTP ${putResponse.status}).`
        );
      }
      const etag = putResponse.headers.get("etag") ?? "missing-etag";

      setUploadPhase("verifying");
      const completeResponse = await fetch("/api/v1/storage/complete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          meetingId: safeMeetingId,
          objectKey: presignPayload.objectKey,
          etag,
          localSha256
        })
      });
      if (!completeResponse.ok) {
        throw new Error(await parseFailedResponse(completeResponse));
      }

      setUploadPhase("starting");
      const startResponse = await fetch("/api/v1/pipeline/start", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          meetingId: safeMeetingId,
          displayTitle,
          objectKey: presignPayload.objectKey,
          transcriptText: transcriptText.trim().length >= 40 ? transcriptText.trim() : undefined,
          meetingTemplate,
          outputLanguage,
          languageHint
        })
      });
      if (!startResponse.ok) {
        throw new Error(await parseFailedResponse(startResponse));
      }
      const started = (await startResponse.json()) as { jobId: string };
      setUploadPhase("awaiting_pipeline");
      onJobStarted({
        jobId: started.jobId,
        meetingId: safeMeetingId,
        title: displayTitle
      });
    } catch (runError) {
      setUploadPhase("idle");
      setIsRunning(false);
      setError(runError instanceof Error ? runError.message : t("new.unexpectedError"));
    }
  };

  const canProceedStep0 = analysisName.trim().length >= 3;
  const canProceedStep1 = Boolean(file) && !fileError;
  const showPipelineProgress = isRunning || (Boolean(activeJobId) && !isTerminal);
  const outputLangOptions: { value: OutputLanguage; label: string; hint: string }[] = [
    {
      value: "auto",
      label: locale === "en" ? "Automatic" : "Automatico",
      hint: locale === "en" ? "Follows the content language" : "Segue la lingua del contenuto"
    },
    {
      value: "it",
      label: "Italiano",
      hint: locale === "en" ? "Brief, actions and diagrams in Italian" : "Brief, azioni e diagrammi in italiano"
    },
    {
      value: "en",
      label: "English",
      hint: locale === "en" ? "Brief, actions and diagrams in English" : "Brief, azioni e diagrammi in inglese"
    }
  ];

  return (
    <div className="space-y-10">
      <header className="border-b border-border/50 pb-8">
        <p className="ui-overline text-primary">{t("new.flow")}</p>
        <h1 className="mt-3 text-display sm:text-4xl">{t("new.title")}</h1>
        <p className="mt-4 max-w-2xl text-body">
          {t("new.copy")}
        </p>
      </header>

      <div className="ui-panel space-y-6 p-6 sm:p-8">
        <details className="ui-panel-quiet rounded-md">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
            <Settings2 aria-hidden="true" className="h-3.5 w-3.5" />
            {t("new.technical")}
          </summary>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
            <Badge variant="outline">{locale === "en" ? "Direct upload" : "Caricamento diretto"}</Badge>
            <span>{t("new.technicalCopy")}</span>
          </div>
        </details>

        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { label: t("new.step.detail"), icon: CheckCircle2 },
            { label: t("new.step.audio"), icon: FileAudio },
            { label: t("new.step.start"), icon: Play }
          ].map((item, step) => (
            <Button
              key={step}
              type="button"
              variant={wizardStep === step ? "default" : "outline"}
              size="sm"
              className="justify-start"
              onClick={() => setWizardStep(step)}
              disabled={isRunning}
            >
              <item.icon aria-hidden="true" />
              <span className="text-xs">{step + 1}. {item.label}</span>
            </Button>
          ))}
        </div>

        {wizardStep === 0 ? (
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="analysis-name">{t("new.meetingId")}</Label>
              <Input
                id="analysis-name"
                value={analysisName}
                onChange={(e) => setAnalysisName(e.target.value)}
                placeholder={t("new.titlePlaceholder")}
                disabled={isRunning}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{t("new.meetingIdHelp")}</p>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setWizardStep(1)} disabled={!canProceedStep0 || isRunning}>
                {t("new.next")}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}

        {wizardStep === 1 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="audio">{t("new.file")}</Label>
              <label
                htmlFor="audio"
                className="group flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/25 p-6 text-center transition-colors hover:border-primary/60 hover:bg-muted/45"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  selectFile(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-secondary-foreground transition-transform group-hover:scale-105">
                  <UploadCloud aria-hidden="true" />
                </span>
                <span className="mt-3 text-sm font-medium">{file ? file.name : t("new.fileDrop")}</span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {file ? `${formatBytes(file.size)} · ${resolveSupportedAudioFormat({ fileName: file.name, contentType: file.type })?.toUpperCase() ?? "Audio"}` : `Max ${AUDIO_MAX_MB} MB`}
                </span>
              </label>
              <Input
                id="audio"
                type="file"
                accept={SUPPORTED_AUDIO_ACCEPT}
                disabled={isRunning}
                className="sr-only"
                onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/35 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => selectFile(null)} disabled={isRunning} aria-label={t("new.removeFile")}>
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
              {fileError ? (
                <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {fileError}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {t("new.formats")}: {SUPPORTED_AUDIO_LABEL} · max {AUDIO_MAX_MB} MB.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template">{t("new.template")}</Label>
              <select
                id="template"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={meetingTemplate}
                onChange={(e) => setMeetingTemplate(e.target.value as MeetingTemplate)}
                disabled={isRunning}
              >
                {TEMPLATES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="out-lang">{t("new.outputLanguage")}</Label>
              <select
                id="out-lang"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={outputLanguage}
                onChange={(e) => setOutputLanguage(e.target.value as OutputLanguage)}
                disabled={isRunning}
              >
                {outputLangOptions.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {outputLangOptions.find((l) => l.value === outputLanguage)?.hint}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="audio-lang">{t("new.audioLanguage")}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-xs text-muted-foreground underline decoration-dotted" aria-label={t("new.audioLanguageHelp")}>
                      <Info aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {t("new.audioLanguageHelp")}
                  </TooltipContent>
                </Tooltip>
              </div>
              <select
                id="audio-lang"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={languageHint}
                onChange={(e) => setLanguageHint(e.target.value)}
                disabled={isRunning}
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setWizardStep(0)} disabled={isRunning}>
                <ArrowLeft aria-hidden="true" />
                {t("new.back")}
              </Button>
              <Button type="button" onClick={() => setWizardStep(2)} disabled={!canProceedStep1 || isRunning}>
                {t("new.next")}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}

        {wizardStep === 2 ? (
          <div className="space-y-4">
            <details className="ui-panel-quiet p-4">
              <summary className="cursor-pointer text-sm font-medium">{t("new.advanced")}</summary>
              <div className="mt-3 space-y-2">
                <Label htmlFor="seed">{t("new.transcriptSeed")}</Label>
                <Textarea
                  id="seed"
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  placeholder={t("new.transcriptPlaceholder")}
                  disabled={isRunning}
                />
              </div>
            </details>
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setWizardStep(1)} disabled={isRunning}>
                <ArrowLeft aria-hidden="true" />
                {t("new.back")}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button type="button" size="lg" className="h-12 px-5 text-base shadow-sm" onClick={() => void runPipeline()} disabled={!csrfReady || isRunning || !file || Boolean(fileError)}>
                      <Play aria-hidden="true" />
                      {isRunning ? t("new.running") : t("new.run")}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!csrfReady ? <TooltipContent>{locale === "en" ? "Waiting for the session token..." : "Attendere il token di sessione..."}</TooltipContent> : null}
              </Tooltip>
            </div>
          </div>
        ) : null}

        <div className="min-h-[104px] rounded-lg border border-border/50 bg-muted/20 p-4" aria-live="polite">
          {showPipelineProgress ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-foreground">{statusLine || t("new.progress")}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{progressValue}%</span>
              </div>
              <Progress value={progressValue} />
              <p className="text-xs text-muted-foreground">{t("new.progressHelp")}</p>
            </div>
          ) : (
            <div className="flex h-full min-h-[72px] items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">{t("new.readyTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("new.readyCopy")}</p>
              </div>
              <Badge variant="outline">Max {AUDIO_MAX_MB} MB</Badge>
            </div>
          )}
        </div>

        {pollError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("result.updateFailed")}</AlertTitle>
            <AlertDescription>{pollError}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t("new.failure")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
            <div className="mt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setError("")}>
                {t("new.retry")}
              </Button>
            </div>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
