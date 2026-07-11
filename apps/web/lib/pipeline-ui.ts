import type { PipelineState } from "@omnivox/shared";

export type ClientUploadPhase =
  | "idle"
  | "hashing"
  | "uploading"
  | "verifying"
  | "starting"
  | "awaiting_pipeline";

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

export function uploadPhaseLabel(phase: ClientUploadPhase, locale: string): string {
  return uploadPhaseLabelForLocale(phase, locale);
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
