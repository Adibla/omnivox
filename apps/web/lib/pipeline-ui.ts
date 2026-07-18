import type { PipelineState } from "@omnivox/shared";

export type ClientUploadPhase =
  "idle" | "hashing" | "uploading" | "verifying" | "starting" | "awaiting_pipeline";

export const PIPELINE_STATE_LABELS_IT: Record<PipelineState, string> = {
  queued: "Preparazione",
  transcribing: "Trascrizione audio",
  preprocessing: "Organizzazione contenuto",
  reasoning: "Creazione report",
  completed: "Analisi pronta",
  failed: "Analisi non riuscita",
};

export const PIPELINE_STATE_LABELS_EN: Record<PipelineState, string> = {
  queued: "Preparing",
  transcribing: "Transcribing audio",
  preprocessing: "Organizing content",
  reasoning: "Creating report",
  completed: "Analysis ready",
  failed: "Analysis failed",
};

const ORDER: PipelineState[] = [
  "queued",
  "transcribing",
  "preprocessing",
  "reasoning",
  "completed",
];

export const PIPELINE_PHASES = ["queued", "transcribing", "preprocessing", "reasoning"] as const;

export type PipelinePhase = (typeof PIPELINE_PHASES)[number];
export type PipelinePhaseStatus = "done" | "active" | "upcoming";

export function pipelinePhaseStatus(
  phase: PipelinePhase,
  currentState: PipelineState | string,
): PipelinePhaseStatus {
  if (currentState === "completed") {
    return "done";
  }
  const currentIdx = ORDER.indexOf(currentState as PipelineState);
  const phaseIdx = ORDER.indexOf(phase);
  if (currentIdx < 0) {
    return phase === "queued" ? "active" : "upcoming";
  }
  if (phaseIdx < currentIdx) {
    return "done";
  }
  return phaseIdx === currentIdx ? "active" : "upcoming";
}

const PIPELINE_PHASE_HINTS_IT: Record<PipelinePhase, string> = {
  queued: "L'analisi è in coda e parte a momenti.",
  transcribing: "L'audio viene trascritto: di solito è la fase più lunga.",
  preprocessing: "La trascrizione viene ripulita e organizzata.",
  reasoning: "Il report viene generato: brief, sentiment e partecipanti.",
};

const PIPELINE_PHASE_HINTS_EN: Record<PipelinePhase, string> = {
  queued: "The analysis is queued and starts shortly.",
  transcribing: "The audio is being transcribed: usually the longest phase.",
  preprocessing: "The transcript is being cleaned up and organized.",
  reasoning: "The report is being generated: brief, sentiment, and participants.",
};

export function pipelinePhaseHintForLocale(phase: PipelinePhase, locale: string): string {
  const hints = locale === "en" ? PIPELINE_PHASE_HINTS_EN : PIPELINE_PHASE_HINTS_IT;
  return hints[phase];
}

export function pipelineProgressPercent(state: PipelineState | string): number {
  if (state === "failed") {
    return 100;
  }
  const idx = ORDER.indexOf(state as PipelineState);
  if (idx < 0) {
    return 8;
  }
  return Math.round(((idx + 1) / ORDER.length) * 100);
}

export function pipelineStateLabelForLocale(state: PipelineState | string, locale: string): string {
  const labels = locale === "en" ? PIPELINE_STATE_LABELS_EN : PIPELINE_STATE_LABELS_IT;
  return labels[state as PipelineState] ?? state;
}

export function uploadPhaseLabelForLocale(phase: ClientUploadPhase, locale: string): string {
  if (locale === "en") {
    switch (phase) {
      case "hashing":
        return "Preparing file";
      case "uploading":
        return "Uploading audio";
      case "verifying":
        return "Checking upload";
      case "starting":
        return "Starting analysis";
      case "awaiting_pipeline":
        return "Analysis queued";
      default:
        return "";
    }
  }
  switch (phase) {
    case "hashing":
      return "Preparazione file";
    case "uploading":
      return "Caricamento audio";
    case "verifying":
      return "Controllo caricamento";
    case "starting":
      return "Avvio analisi";
    case "awaiting_pipeline":
      return "Analisi in coda";
    default:
      return "";
  }
}
