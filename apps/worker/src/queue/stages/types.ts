import type { Queue } from "bullmq";
import type OpenAI from "openai";
import type { PipelineMessage } from "@omnivox/shared";
import type { WorkerEnv } from "@/lib/env";

export type StageContext = {
  openai: OpenAI;
  pipelineQueue: Queue;
  workerEnv: WorkerEnv;
};

export type StageHandler = (payload: PipelineMessage, context: StageContext) => Promise<void>;
