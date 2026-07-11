"use client";

import { useEffect, useState } from "react";
import type { AnalysisOutput } from "@omnivox/shared";
import { parseFailedResponseMeta } from "@/lib/parse-api-error";

export type PipelineJobResponse = {
  jobId: string;
  meetingId?: string;
  displayTitle?: string | null;
  state: string;
  result?: AnalysisOutput;
  error?: string;
};

export type PipelinePollError = {
  status?: number;
  code?: string;
  message: string;
};

function hasGeneratingArtifacts(job: PipelineJobResponse): boolean {
  const status = job.result?.artifactStatus;
  return status?.actions?.state === "generating" || status?.diagrams?.state === "generating";
}

function isTerminalState(job: PipelineJobResponse): boolean {
  if (job.state === "failed") {
    return true;
  }
  return job.state === "completed" && !hasGeneratingArtifacts(job);
}

export function usePipelineJob(
  jobId: string | null,
  options?: { pollMs?: number; enabled?: boolean },
) {
  const [job, setJob] = useState<PipelineJobResponse | null>(null);
  const [pollError, setPollError] = useState<PipelinePollError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const enabled = options?.enabled !== false && Boolean(jobId);
  const pollMs = options?.pollMs ?? 1500;

  useEffect(() => {
    if (!enabled || !jobId) {
      setJob(null);
      setPollError(null);
      setIsLoading(false);
      return;
    }

    setJob(null);
    setPollError(null);
    setIsLoading(true);

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const tick = async (): Promise<PipelineJobResponse | null> => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return null;
      }
      try {
        const response = await fetch(`/api/v1/pipeline/${jobId}`);
        if (!response.ok) {
          const meta = await parseFailedResponseMeta(response);
          if (!cancelled) {
            setPollError({ status: meta.status, code: meta.code, message: meta.message });
            setIsLoading(false);
          }
          return null;
        }
        const payload = (await response.json()) as PipelineJobResponse;
        if (!cancelled) {
          setPollError(null);
          setJob(payload);
          setIsLoading(false);
          if (isTerminalState(payload)) {
            stopPolling();
          }
        }
        return payload;
      } catch (e) {
        if (!cancelled) {
          setPollError({
            message: e instanceof Error ? e.message : "Network error while polling.",
          });
          setIsLoading(false);
        }
        return null;
      }
    };

    const startPolling = () => {
      stopPolling();
      void (async () => {
        const first = await tick();
        if (cancelled || !first || isTerminalState(first)) {
          return;
        }
        intervalId = setInterval(() => {
          void tick();
        }, pollMs);
      })();
    };

    const onWatchRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ jobId?: string }>).detail;
      if (detail?.jobId && detail.jobId !== jobId) {
        return;
      }
      startPolling();
    };

    startPolling();
    window.addEventListener("omni-pipeline-watch", onWatchRequest);

    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener("omni-pipeline-watch", onWatchRequest);
    };
  }, [enabled, jobId, pollMs]);

  const isTerminal = job ? isTerminalState(job) : false;

  return { job, pollError, isLoading, isTerminal };
}
