"use client";

import type { PipelineState } from "@omnivox/shared";
import { Brain, Check, ListOrdered, Loader2, Mic, ScrollText } from "lucide-react";
import {
  PIPELINE_PHASES,
  pipelinePhaseHintForLocale,
  pipelinePhaseStatus,
  pipelineStateLabelForLocale,
  type PipelinePhase,
} from "@/lib/pipeline-ui";
import { cn } from "@/lib/utils";

const PHASE_ICONS: Record<PipelinePhase, typeof Mic> = {
  queued: ListOrdered,
  transcribing: Mic,
  preprocessing: ScrollText,
  reasoning: Brain,
};

export function PipelineStepper({
  state,
  locale,
}: {
  state: PipelineState | string;
  locale: string;
}) {
  const activePhase = PIPELINE_PHASES.find(
    (phase) => pipelinePhaseStatus(phase, state) === "active",
  );
  return (
    <div className="space-y-3">
      <ol className="flex items-start gap-1 sm:gap-2">
        {PIPELINE_PHASES.map((phase, index) => {
          const status = pipelinePhaseStatus(phase, state);
          const Icon = PHASE_ICONS[phase];
          return (
            <li key={phase} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center">
                <div
                  aria-hidden="true"
                  className={cn(
                    "h-px flex-1",
                    index === 0
                      ? "bg-transparent"
                      : status === "upcoming"
                        ? "bg-border"
                        : "bg-primary/60",
                  )}
                />
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                    status === "done" && "border-primary/60 bg-primary text-primary-foreground",
                    status === "active" && "border-primary bg-primary/10 text-primary",
                    status === "upcoming" && "border-border bg-background text-muted-foreground",
                  )}
                >
                  {status === "done" ? (
                    <Check aria-hidden="true" className="h-4 w-4" />
                  ) : status === "active" ? (
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  )}
                </div>
                <div
                  aria-hidden="true"
                  className={cn(
                    "h-px flex-1",
                    index === PIPELINE_PHASES.length - 1
                      ? "bg-transparent"
                      : status === "done"
                        ? "bg-primary/60"
                        : "bg-border",
                  )}
                />
              </div>
              <span
                className={cn(
                  "max-w-full truncate px-1 text-center text-xs",
                  status === "active" ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {pipelineStateLabelForLocale(phase, locale)}
              </span>
            </li>
          );
        })}
      </ol>
      {activePhase ? (
        <p className="text-center text-xs text-muted-foreground">
          {pipelinePhaseHintForLocale(activePhase, locale)}
        </p>
      ) : null}
    </div>
  );
}
