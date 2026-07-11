"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ArtifactKind = "diagrams" | "actions";

export type PendingArtifact = {
  active: boolean;
  progress: number;
  startedAt: number;
  timedOut: boolean;
};

type UseSmoothArtifactGenerationInput = {
  ready: Record<ArtifactKind, boolean>;
  failed: Record<ArtifactKind, boolean>;
  onTimeout: (kind: ArtifactKind) => void;
  minDurationMs?: number;
  timeoutMs?: number;
};

const ARTIFACT_KINDS = ["diagrams", "actions"] as const;
const DEFAULT_MIN_DURATION_MS = 1600;
const DEFAULT_TIMEOUT_MS = 60000;

function emptyPendingArtifact(): PendingArtifact {
  return {
    active: false,
    progress: 0,
    startedAt: 0,
    timedOut: false
  };
}

function emptyPendingState(): Record<ArtifactKind, PendingArtifact> {
  return {
    diagrams: emptyPendingArtifact(),
    actions: emptyPendingArtifact()
  };
}

function progressFor(elapsed: number, timeoutMs: number, current: number) {
  const ratio = Math.min(1, elapsed / timeoutMs);
  const eased = 1 - Math.pow(1 - ratio, 2.8);
  return Math.min(94, Math.max(current, 8 + Math.round(86 * eased)));
}

export function useSmoothArtifactGeneration({
  ready,
  failed,
  onTimeout,
  minDurationMs = DEFAULT_MIN_DURATION_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS
}: UseSmoothArtifactGenerationInput) {
  const [pendingArtifacts, setPendingArtifacts] = useState<Record<ArtifactKind, PendingArtifact>>(emptyPendingState);
  const pendingRef = useRef<Record<ArtifactKind, PendingArtifact>>(emptyPendingState());
  const readyRef = useRef(ready);
  const failedRef = useRef(failed);
  const onTimeoutRef = useRef(onTimeout);
  const completionTimersRef = useRef<Record<ArtifactKind, number | null>>({
    diagrams: null,
    actions: null
  });

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    failedRef.current = failed;
  }, [failed]);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const setPending = useCallback((updater: (current: Record<ArtifactKind, PendingArtifact>) => Record<ArtifactKind, PendingArtifact>) => {
    setPendingArtifacts((current) => {
      const next = updater(current);
      pendingRef.current = next;
      return next;
    });
  }, []);

  const clearCompletionTimer = useCallback((kind: ArtifactKind) => {
    const timer = completionTimersRef.current[kind];
    if (timer) {
      window.clearTimeout(timer);
      completionTimersRef.current[kind] = null;
    }
  }, []);

  const stop = useCallback(
    (kind: ArtifactKind) => {
      clearCompletionTimer(kind);
      setPending((current) => ({
        ...current,
        [kind]: emptyPendingArtifact()
      }));
    },
    [clearCompletionTimer, setPending]
  );

  const start = useCallback(
    (kind: ArtifactKind) => {
      clearCompletionTimer(kind);
      setPending((current) => ({
        ...current,
        [kind]: {
          active: true,
          progress: 4,
          startedAt: Date.now(),
          timedOut: false
        }
      }));
    },
    [clearCompletionTimer, setPending]
  );

  const reset = useCallback(() => {
    ARTIFACT_KINDS.forEach(clearCompletionTimer);
    setPending(() => emptyPendingState());
  }, [clearCompletionTimer, setPending]);

  useEffect(() => reset, [reset]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      ARTIFACT_KINDS.forEach((kind) => {
        const pending = pendingRef.current[kind];
        if (!pending.active) {
          return;
        }

        const elapsed = now - pending.startedAt;
        if (readyRef.current[kind]) {
          setPending((current) => ({
            ...current,
            [kind]: {
              ...current[kind],
              progress: 100
            }
          }));
          if (!completionTimersRef.current[kind]) {
            const remaining = Math.max(300, minDurationMs - elapsed);
            completionTimersRef.current[kind] = window.setTimeout(() => stop(kind), remaining);
          }
          return;
        }

        if (failedRef.current[kind]) {
          stop(kind);
          return;
        }

        if (elapsed >= timeoutMs) {
          setPending((current) => ({
            ...current,
            [kind]: {
              ...current[kind],
              active: false,
              progress: 0,
              timedOut: true
            }
          }));
          onTimeoutRef.current(kind);
          return;
        }

        setPending((current) => ({
          ...current,
          [kind]: {
            ...current[kind],
            progress: progressFor(elapsed, timeoutMs, pending.progress)
          }
        }));
      });
    }, 180);
    return () => window.clearInterval(interval);
  }, [minDurationMs, setPending, stop, timeoutMs]);

  return {
    pendingArtifacts,
    start,
    stop,
    reset
  };
}
