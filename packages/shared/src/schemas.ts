import { z } from "zod";
import {
  AUDIO_MAX_BYTES,
  SUPPORTED_AUDIO_FORMATS,
  getAudioFormatFromContentType,
  isAudioFormatCompatibleWithContentType
} from "./audio";

export const SupportedAudioFormatSchema = z.enum(SUPPORTED_AUDIO_FORMATS);

export const PresignRequestBaseSchema = z.object({
  tenantId: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/),
  meetingId: z.string().min(3).max(96).regex(/^[a-zA-Z0-9-_]+$/),
  contentType: z.string().refine((value) => getAudioFormatFromContentType(value) !== null, {
    message: "Unsupported audio content type."
  }),
  audioFormat: SupportedAudioFormatSchema,
  contentLength: z.number().int().positive().max(AUDIO_MAX_BYTES),
  sha256: z.string().length(64).regex(/^[a-f0-9]+$/),
  retentionClass: z.enum(["standard", "compliance", "legal-hold"])
});

export const PresignRequestSchema = PresignRequestBaseSchema.superRefine((value, ctx) => {
  if (!isAudioFormatCompatibleWithContentType(value.audioFormat, value.contentType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["audioFormat"],
      message: "audioFormat is not compatible with contentType."
    });
  }
});

export const PresignResponseSchema = z.object({
  uploadUrl: z.string().url(),
  objectKey: z.string().min(1),
  expiresAt: z.string().datetime(),
  requiredHeaders: z.record(z.string(), z.string())
});

export const CompleteUploadRequestSchema = z.object({
  meetingId: z.string().min(3).max(96),
  objectKey: z.string().min(1),
  etag: z.string().min(8).max(128),
  localSha256: z.string().length(64).regex(/^[a-f0-9]+$/)
});

export const PipelineStateSchema = z.enum([
  "queued",
  "transcribing",
  "preprocessing",
  "reasoning",
  "completed",
  "failed"
]);

export const ActionItemSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(3),
  owner: z.string().min(1),
  dueDate: z.string().datetime().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]),
  risk: z.enum(["low", "medium", "high"]).default("medium"),
  actionType: z.enum(["task", "decision", "risk", "follow_up"]).default("task"),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).default("todo")
});

export const MermaidArtifactSchema = z.object({
  title: z.string().min(3),
  diagramType: z.enum(["mindmap", "flowchart"]),
  mermaidCode: z.string().min(20).max(8000)
});

export const TranscriptSegmentSchema = z.object({
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  text: z.string().min(1)
});

export const ArtifactGenerationStatusSchema = z.object({
  state: z.enum(["pending", "generating", "completed", "failed"]).default("pending"),
  error: z.string().optional(),
  updatedAt: z.string().datetime().optional()
});

export const AnalysisOutputSchema = z.object({
  executiveBriefMarkdown: z.string().min(40),
  artifacts: z.array(MermaidArtifactSchema).max(4).default([]),
  actions: z.array(ActionItemSchema).max(30).default([]),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  artifactStatus: z.object({
    diagrams: ArtifactGenerationStatusSchema.default({ state: "pending" }),
    actions: ArtifactGenerationStatusSchema.default({ state: "pending" })
  }).default({
    diagrams: { state: "pending" },
    actions: { state: "pending" }
  }),
  /** Post-preprocess transcript. Absent in legacy stored jobs. */
  normalizedTranscript: z.string().min(40).optional(),
  participants: z.array(z.string().min(1)).optional(),
  /** From speech-to-text; empty when the user pasted a transcript instead of uploading audio. */
  transcriptSegments: z.array(TranscriptSegmentSchema).optional()
});

export const MeetingTemplateSchema = z.enum(["generic", "standup", "board", "client", "retro"]);
export const OutputLanguageSchema = z.enum(["auto", "it", "en"]);

export const PipelineStartRequestSchema = z.object({
  meetingId: z.string().min(3).max(96),
  displayTitle: z.string().trim().min(3).max(160).optional(),
  objectKey: z.string().min(1),
  languageHint: z.string().min(2).max(8).default("it"),
  transcriptText: z.string().min(40).optional(),
  meetingTemplate: MeetingTemplateSchema.default("generic"),
  outputLanguage: OutputLanguageSchema.default("auto")
});

export const TranslateReportRequestSchema = z.object({
  targetLanguage: OutputLanguageSchema.exclude(["auto"])
});

export const UpdateActionStatusRequestSchema = z.object({
  status: z.enum(["todo", "in_progress", "blocked", "done"])
});

export type PresignRequest = z.infer<typeof PresignRequestSchema>;
export type PresignResponse = z.infer<typeof PresignResponseSchema>;
export type CompleteUploadRequest = z.infer<typeof CompleteUploadRequestSchema>;
export type PipelineState = z.infer<typeof PipelineStateSchema>;
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type PipelineStartRequest = z.infer<typeof PipelineStartRequestSchema>;
export type MeetingTemplate = z.infer<typeof MeetingTemplateSchema>;
export type OutputLanguage = z.infer<typeof OutputLanguageSchema>;
export type TranslateReportRequest = z.infer<typeof TranslateReportRequestSchema>;
export type UpdateActionStatusRequest = z.infer<typeof UpdateActionStatusRequestSchema>;
