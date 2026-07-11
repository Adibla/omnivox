import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { PipelineMessageSchema, PipelineStageSchema, type PipelineMessage } from "@omnivox/shared";
import OpenAI from "openai";
import { getWorkerEnv } from "@/lib/env";
import { getJob, updateJobState, writeAudit } from "./db";
import { buildQueueJobId } from "./job-ids";
import { processActions } from "./stages/actions";
import { processDiagrams } from "./stages/diagrams";
import { processPreprocess } from "./stages/preprocess";
import { processReasoning } from "./stages/reasoning";
import { processTranscription } from "./stages/transcription";
import type { StageContext, StageHandler } from "./stages/types";

const workerEnv = getWorkerEnv();

const redis = new IORedis(workerEnv.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const pipelineQueue = new Queue("pipeline", { connection: redis });
const deadLetterQueue = new Queue("pipeline_dead_letter", { connection: redis });

const openai = new OpenAI({
  apiKey: workerEnv.OPENAI_API_KEY,
  baseURL: workerEnv.OPENAI_BASE_URL,
  defaultHeaders: {
    [workerEnv.OPENAI_ZDR_HEADER]: workerEnv.OPENAI_ZDR_VALUE,
  },
});

const stageHandlers = {
  transcription: processTranscription,
  preprocess: processPreprocess,
  reasoning: processReasoning,
  actions: processActions,
  diagrams: processDiagrams,
} satisfies Record<string, StageHandler>;

const stageContext: StageContext = {
  openai,
  pipelineQueue,
  workerEnv,
};

async function processStage(stage: string, payload: PipelineMessage) {
  const parsedStage = PipelineStageSchema.parse(stage);
  const existing = await getJob(payload.jobId);
  if (!existing) {
    throw new Error(`Unknown job ${payload.jobId}.`);
  }
  await stageHandlers[parsedStage](payload, stageContext);
}

export function startPipelineWorker() {
  const worker = new Worker(
    "pipeline",
    async (job) => {
      const payload = PipelineMessageSchema.parse(job.data);
      await processStage(job.name, payload);
    },
    {
      connection: redis,
      concurrency: 4,
    },
  );

  worker.on("failed", async (job, error) => {
    if (!job) {
      return;
    }
    const payload = PipelineMessageSchema.safeParse(job.data);
    if (!payload.success) {
      return;
    }
    await updateJobState(payload.data.jobId, "failed", error.message);
    await deadLetterQueue.add(
      "dead_letter",
      {
        jobId: payload.data.jobId,
        stage: job.name,
        payload: payload.data,
        error: error.message,
      },
      {
        jobId: buildQueueJobId([payload.data.jobId, job.name, "dead"]),
      },
    );
    await writeAudit(payload.data.jobId, "pipeline-failed", {
      stage: job.name,
      error: error.message,
    });
  });

  return worker;
}
