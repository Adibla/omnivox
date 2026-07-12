"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisOutput } from "@omnivox/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/i18n-provider";
import { copyToClipboard } from "@/lib/integrations-export";
import { parseFailedResponse } from "@/lib/parse-api-error";

function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type TranscriptWorkspaceProps = {
  jobId: string | null;
  result: AnalysisOutput;
  csrfToken: string;
  csrfReady: boolean;
  onToast: (message: string) => void;
};

export function TranscriptWorkspace({
  jobId,
  result,
  csrfToken,
  csrfReady,
  onToast,
}: TranscriptWorkspaceProps) {
  const { t, locale } = useI18n();
  const transcript = result.normalizedTranscript?.trim() ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- segments is a stable read from `result` props; tracking it is the intended closure.
  const segments = result.transcriptSegments ?? [];
  const participants = result.participants ?? [];
  const originalTranscript = useMemo(
    () =>
      segments
        .map((s) => s.text)
        .join("\n")
        .trim(),
    [segments],
  );

  const [search, setSearch] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [activeSegIndex, setActiveSegIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [transcriptView, setTranscriptView] = useState<"original" | "normalized">("normalized");

  useEffect(() => {
    if (transcriptView === "original" && segments.length === 0) {
      setTranscriptView("normalized");
    }
  }, [transcriptView, segments.length]);

  const filteredSegments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return segments.map((s, i) => ({ ...s, index: i }));
    }
    return segments
      .map((s, i) => ({ ...s, index: i }))
      .filter((s) => s.text.toLowerCase().includes(q));
  }, [segments, search]);

  const loadAudioUrl = useCallback(async () => {
    if (!jobId || !csrfReady || !csrfToken) {
      return;
    }
    setAudioLoading(true);
    setAudioError(null);
    try {
      const response = await fetch(`/api/v1/pipeline/${jobId}/read-audio`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!response.ok) {
        throw new Error(await parseFailedResponse(response, locale));
      }
      const data = (await response.json()) as { url?: string };
      if (!data.url) {
        throw new Error(t("transcript.audioMissingUrl"));
      }
      setAudioUrl(data.url);
    } catch (e) {
      setAudioError(e instanceof Error ? e.message : t("transcript.audioError"));
    } finally {
      setAudioLoading(false);
    }
  }, [jobId, csrfReady, csrfToken, t, locale]);

  useEffect(() => {
    if (
      segments.length > 0 &&
      jobId &&
      csrfReady &&
      csrfToken &&
      !audioUrl &&
      !audioLoading &&
      !audioError
    ) {
      void loadAudioUrl();
    }
  }, [
    segments.length,
    jobId,
    csrfReady,
    csrfToken,
    audioUrl,
    audioLoading,
    audioError,
    loadAudioUrl,
  ]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || segments.length === 0) {
      return;
    }
    const onTime = () => {
      const t = el.currentTime;
      let idx: number | null = null;
      for (let i = 0; i < segments.length; i++) {
        if (t >= segments[i].startSec && t < segments[i].endSec + 0.01) {
          idx = i;
          break;
        }
      }
      setActiveSegIndex(idx);
    };
    el.addEventListener("timeupdate", onTime);
    return () => el.removeEventListener("timeupdate", onTime);
  }, [segments, audioUrl]);

  const seekTo = (startSec: number, index: number) => {
    const el = audioRef.current;
    if (el) {
      el.currentTime = startSec;
      void el.play().catch(() => {});
    }
    setActiveSegIndex(index);
  };

  const onCopyTranscript = async () => {
    if (!transcript) {
      return;
    }
    const ok = await copyToClipboard(transcript);
    onToast(ok ? t("transcript.copyOk") : t("result.copyFail"));
  };

  const onDownloadTxt = () => {
    if (!transcript) {
      return;
    }
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcript.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onAsk = async () => {
    const q = question.trim();
    if (!jobId || q.length < 3 || !csrfReady || !csrfToken) {
      return;
    }
    setAskLoading(true);
    setAskError(null);
    setAnswer(null);
    try {
      const response = await fetch(`/api/v1/pipeline/${jobId}/ask`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ question: q }),
      });
      if (!response.ok) {
        throw new Error(await parseFailedResponse(response, locale));
      }
      const data = (await response.json()) as { answer?: string };
      setAnswer(data.answer ?? "");
    } catch (e) {
      setAskError(e instanceof Error ? e.message : t("transcript.requestError"));
    } finally {
      setAskLoading(false);
    }
  };

  if (!transcript) {
    return (
      <Alert>
        <AlertTitle>{t("transcript.unavailableTitle")}</AlertTitle>
        <AlertDescription>{t("transcript.unavailableDesc")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {participants.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" aria-label={t("transcript.participants")}>
            {participants.map((p) => (
              <Badge key={p} variant="secondary" className="font-normal">
                {p}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => void onCopyTranscript()}>
          {t("transcript.copy")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDownloadTxt}>
          {t("transcript.download")}
        </Button>
        {jobId && segments.length === 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadAudioUrl()}
            disabled={audioLoading || !csrfReady}
          >
            {audioLoading ? t("transcript.audioLoading") : t("transcript.audioLoad")}
          </Button>
        ) : null}
      </div>

      {audioError ? (
        <Alert variant="destructive">
          <AlertTitle>Audio</AlertTitle>
          <AlertDescription>{audioError}</AlertDescription>
        </Alert>
      ) : null}

      {audioUrl ? (
        <div className="ui-panel-quiet p-3">
          <audio ref={audioRef} controls className="w-full" src={audioUrl} preload="metadata">
            <track kind="captions" />
          </audio>
          <p className="mt-2 text-xs text-muted-foreground">{t("transcript.audioHint")}</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="transcript-search">{t("transcript.searchLabel")}</Label>
          <Input
            id="transcript-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("transcript.searchPlaceholder")}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("transcript.textVersion")}</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={transcriptView === "original" ? "default" : "outline"}
              onClick={() => setTranscriptView("original")}
              disabled={segments.length === 0}
            >
              {t("transcript.showOriginal")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={transcriptView === "normalized" ? "default" : "outline"}
              onClick={() => setTranscriptView("normalized")}
            >
              {t("transcript.showNormalized")}
            </Button>
          </div>
        </div>
      </div>

      {segments.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("transcript.originalSegments")}
            </p>
            <Badge variant="outline" className="text-[10px]">
              {t("transcript.audioSource")}
            </Badge>
          </div>
          <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-lg border border-border/40 bg-muted/15 p-2">
            {filteredSegments.map((s) => (
              <div
                key={`${s.index}-${s.startSec}`}
                className={`flex gap-2 rounded-md px-2 py-1.5 text-sm ${
                  activeSegIndex === s.index
                    ? "bg-primary/15 ring-1 ring-primary/40"
                    : "hover:bg-muted/40"
                }`}
              >
                <button
                  type="button"
                  className="shrink-0 font-mono text-xs text-primary underline-offset-2 hover:underline disabled:opacity-40"
                  disabled={!audioUrl}
                  onClick={() => seekTo(s.startSec, s.index)}
                >
                  {formatTimestamp(s.startSec)}
                </button>
                <p className="min-w-0 flex-1 leading-relaxed text-foreground/95">{s.text}</p>
              </div>
            ))}
            {filteredSegments.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {t("transcript.noSegments")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {transcriptView === "original" ? t("transcript.original") : t("transcript.normalized")}
          </p>
          <Badge variant="outline" className="text-[10px]">
            {transcriptView === "original" ? "Raw" : t("transcript.cleaned")}
          </Badge>
        </div>
        <div
          className="max-h-[320px] overflow-y-auto rounded-lg border border-border/40 bg-background/40 p-4 text-sm leading-relaxed text-foreground/95 whitespace-pre-wrap"
          aria-label={t("transcript.fullAria")}
        >
          {transcriptView === "original" ? originalTranscript || transcript : transcript}
        </div>
      </div>

      <div className="ui-panel space-y-3 p-4">
        <h3 className="text-sm font-semibold">{t("transcript.askTitle")}</h3>
        <p className="text-xs text-muted-foreground">{t("transcript.askHelp")}</p>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("transcript.askPlaceholder")}
          rows={3}
          disabled={askLoading || !jobId}
        />
        <Button
          type="button"
          onClick={() => void onAsk()}
          disabled={askLoading || question.trim().length < 3 || !jobId || !csrfReady}
        >
          {askLoading ? t("transcript.askLoading") : t("transcript.ask")}
        </Button>
        {askError ? (
          <Alert variant="destructive">
            <AlertDescription>{askError}</AlertDescription>
          </Alert>
        ) : null}
        {answer ? (
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {answer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
