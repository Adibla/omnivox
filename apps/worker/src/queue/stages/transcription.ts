import {
  getAudioFormatFromContentType,
  getAudioFormatFromFileName,
  type PipelineMessage,
  type TranscriptSegment,
} from "@omnivox/shared";
import { createPresignedReadUrl } from "../s3";
import { updateJobState, writeAudit } from "../db";
import { buildQueueJobId } from "../job-ids";
import type { StageContext } from "./types";

async function transcribeFromStorage(
  objectKey: string,
  languageHint: string | undefined,
  context: StageContext,
): Promise<{ text: string; segments: TranscriptSegment[] }> {
  const sourceUrl = await createPresignedReadUrl(objectKey);
  const audioResponse = await fetch(sourceUrl);
  if (!audioResponse.ok) {
    throw new Error(`Unable to fetch audio source (${audioResponse.status}).`);
  }
  const bytes = await audioResponse.arrayBuffer();
  const contentType = audioResponse.headers.get("content-type") ?? "audio/ogg";
  const extension =
    getAudioFormatFromFileName(objectKey) ?? getAudioFormatFromContentType(contentType) ?? "ogg";
  const file = new File([bytes], `meeting-audio.${extension}`, { type: contentType });
  const lang = languageHint?.trim().slice(0, 2).toLowerCase();
  const transcription = await context.openai.audio.transcriptions.create({
    model: context.workerEnv.MODEL_TRANSCRIPTION,
    file,
    response_format: "verbose_json",
    ...(lang && /^[a-z]{2}$/.test(lang) ? { language: lang } : {}),
  });
  const verbose = transcription as {
    text: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };
  const segments = (verbose.segments ?? [])
    .map((s) => ({
      startSec: s.start,
      endSec: s.end,
      text: s.text.trim(),
    }))
    .filter((s) => s.text.length > 0);
  return { text: verbose.text, segments };
}

export async function processTranscription(payload: PipelineMessage, context: StageContext) {
  await updateJobState(payload.jobId, "transcribing");
  let transcript: string;
  let transcriptSegments: TranscriptSegment[] = [];
  if (payload.transcriptText && payload.transcriptText.length > 40) {
    transcript = payload.transcriptText;
  } else {
    const fromAudio = await transcribeFromStorage(payload.objectKey, payload.languageHint, context);
    transcript = fromAudio.text;
    transcriptSegments = fromAudio.segments;
  }
  await writeAudit(payload.jobId, "pipeline-step", { state: "transcribing" });
  await context.pipelineQueue.add(
    "preprocess",
    {
      ...payload,
      transcript,
      transcriptSegments,
    },
    {
      jobId: buildQueueJobId([payload.jobId, "preprocess"]),
      attempts: 3,
      backoff: { type: "exponential", delay: 500 },
    },
  );
}
