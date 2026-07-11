import { z } from "zod";
import { MeetingTemplateSchema, OutputLanguageSchema, TranscriptSegmentSchema } from "./schemas";

export const PipelineStageSchema = z.enum(["transcription", "preprocess", "reasoning", "actions", "diagrams"]);

export const PipelineMessageSchema = z.object({
  jobId: z.string().uuid(),
  meetingId: z.string().min(3),
  objectKey: z.string().min(1),
  transcriptText: z.string().min(40).optional().nullable(),
  transcript: z.string().optional(),
  transcriptSegments: z.array(TranscriptSegmentSchema).optional(),
  participants: z.array(z.string().min(1)).optional(),
  meetingTemplate: MeetingTemplateSchema.optional(),
  outputLanguage: OutputLanguageSchema.optional(),
  languageHint: z.string().min(2).max(8).optional()
});

export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type PipelineMessage = z.infer<typeof PipelineMessageSchema>;
