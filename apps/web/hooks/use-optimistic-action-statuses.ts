"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisOutput } from "@omnivox/shared";

export type ActionStatus = NonNullable<AnalysisOutput["actions"][number]["status"]>;

type UseOptimisticActionStatusesInput = {
  actions: AnalysisOutput["actions"];
  jobId?: string | null;
  csrfReady: boolean;
  csrfToken?: string | null;
  messages: {
    sessionNotReady: string;
    statusNotSaved: string;
  };
};

const SYNC_RELEASE_DELAY_MS = 1500;

function actionId(action: AnalysisOutput["actions"][number], index: number) {
  return action.id ?? `action-${index}`;
}

export function useOptimisticActionStatuses({
  actions,
  jobId,
  csrfReady,
  csrfToken,
  messages,
}: UseOptimisticActionStatusesInput) {
  const [statusMap, setStatusMap] = useState<Record<string, ActionStatus>>({});
  const [syncingMap, setSyncingMap] = useState<Record<string, boolean>>({});
  const [syncError, setSyncError] = useState("");
  const statusMapRef = useRef<Record<string, ActionStatus>>({});
  const syncingMapRef = useRef<Record<string, boolean>>({});
  const requestSeqRef = useRef<Record<string, number>>({});
  const releaseTimersRef = useRef<Record<string, number>>({});

  const actionSignature = useMemo(() => actions.map(actionId).join("|"), [actions]);
  const backendStatusSignature = useMemo(
    () =>
      actions
        .map((action, index) => `${actionId(action, index)}:${action.status ?? "todo"}`)
        .join("|"),
    [actions],
  );

  useEffect(() => {
    const timers = releaseTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    mergeBackendStatuses(actions);
    setSyncError("");
  }, [actions, actionSignature, backendStatusSignature, jobId]);

  const setStatus = useCallback(
    (stableId: string, status: ActionStatus) => {
      const previous = statusMapRef.current[stableId] ?? "todo";
      const requestSeq = nextRequestSeq(stableId);

      clearReleaseTimer(stableId);
      applyStatus(stableId, status);
      setSyncing(stableId, true);
      setSyncError("");

      if (!jobId || !csrfReady || !csrfToken) {
        rollback(stableId, previous);
        setSyncError(messages.sessionNotReady);
        return;
      }

      void persistStatus({
        jobId,
        stableId,
        status,
        csrfToken,
      })
        .then(async (response) => {
          if (!isLatestRequest(stableId, requestSeq)) {
            return;
          }
          if (!response.ok) {
            rollbackRef.current(stableId, previous);
            const payload = await response.json().catch(() => null);
            setSyncError(payload?.message ?? messages.statusNotSaved);
            return;
          }
          releaseSyncAfterSuccessRef.current(stableId);
        })
        .catch(() => {
          if (!isLatestRequest(stableId, requestSeq)) {
            return;
          }
          rollbackRef.current(stableId, previous);
          setSyncError(messages.statusNotSaved);
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rollback and releaseSyncAfterSuccess are reached via stable refs (rollbackRef/releaseSyncAfterSuccessRef) to avoid re-creating this callback on every render.
    [csrfReady, csrfToken, jobId, messages.sessionNotReady, messages.statusNotSaved],
  );

  const statusFor = useCallback((id: string): ActionStatus => statusMap[id] ?? "todo", [statusMap]);

  // Stable refs to the functions defined below. These let `setStatus`'s
  // useCallback close over the latest implementation without invalidating its
  // identity on every render (the alternative — wrapping helpers in their own
  // useCallback — would force an artificial render-time split that doesn't fit
  // this hook's flow).
  const rollbackRef = useRef<(stableId: string, previous: ActionStatus) => void>(() => {});
  const releaseSyncAfterSuccessRef = useRef<(stableId: string) => void>(() => {});
  rollbackRef.current = rollback;
  releaseSyncAfterSuccessRef.current = releaseSyncAfterSuccess;

  return {
    statusMap,
    syncingMap,
    syncError,
    setStatus,
    statusFor,
  };

  function mergeBackendStatuses(nextActions: AnalysisOutput["actions"]) {
    const incoming = Object.fromEntries(
      nextActions.map((action, index) => [actionId(action, index), action.status ?? "todo"]),
    ) as Record<string, ActionStatus>;
    setStatusMap((current) => {
      const next = Object.fromEntries(
        nextActions.map((action, index) => {
          const id = actionId(action, index);
          const currentStatus = current[id];
          const isSyncing = syncingMapRef.current[id];
          return [id, isSyncing && currentStatus ? currentStatus : incoming[id]];
        }),
      ) as Record<string, ActionStatus>;
      statusMapRef.current = next;
      return next;
    });
    setSyncingMap((current) => {
      const next = Object.fromEntries(
        nextActions.map((action, index) => [
          actionId(action, index),
          current[actionId(action, index)] ?? false,
        ]),
      );
      syncingMapRef.current = next;
      return next;
    });
  }

  function applyStatus(stableId: string, status: ActionStatus) {
    setStatusMap((current) => {
      const next = { ...current, [stableId]: status };
      statusMapRef.current = next;
      return next;
    });
  }

  function rollback(stableId: string, previous: ActionStatus) {
    applyStatus(stableId, previous);
    setSyncing(stableId, false);
  }

  function setSyncing(stableId: string, syncing: boolean) {
    setSyncingMap((current) => {
      const next = { ...current, [stableId]: syncing };
      syncingMapRef.current = next;
      return next;
    });
  }

  function releaseSyncAfterSuccess(stableId: string) {
    releaseTimersRef.current[stableId] = window.setTimeout(() => {
      setSyncing(stableId, false);
      delete releaseTimersRef.current[stableId];
    }, SYNC_RELEASE_DELAY_MS);
  }

  function clearReleaseTimer(stableId: string) {
    const timer = releaseTimersRef.current[stableId];
    if (timer) {
      window.clearTimeout(timer);
      delete releaseTimersRef.current[stableId];
    }
  }

  function nextRequestSeq(stableId: string) {
    const seq = (requestSeqRef.current[stableId] ?? 0) + 1;
    requestSeqRef.current[stableId] = seq;
    return seq;
  }

  function isLatestRequest(stableId: string, seq: number) {
    return requestSeqRef.current[stableId] === seq;
  }
}

function persistStatus(input: {
  jobId: string;
  stableId: string;
  status: ActionStatus;
  csrfToken: string;
}) {
  return fetch(`/api/v1/pipeline/${input.jobId}/actions/${encodeURIComponent(input.stableId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-csrf-token": input.csrfToken },
    body: JSON.stringify({ status: input.status }),
  });
}
