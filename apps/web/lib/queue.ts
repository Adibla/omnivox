import { Queue } from "bullmq";
import IORedis from "ioredis";
import { getEnv } from "./env";

export type PipelineQueueJobName = "transcription" | "preprocess" | "reasoning" | "diagrams" | "actions";

let redisConnection: IORedis | null = null;
let pipelineQueue: Queue | null = null;
let deadLetterQueue: Queue | null = null;

function buildQueueJobId(parts: Array<string>) {
  return parts.join("__");
}

function getRedis() {
  if (redisConnection) {
    return redisConnection;
  }
  redisConnection = new IORedis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null
  });
  return redisConnection;
}

export function getPipelineQueue() {
  if (pipelineQueue) {
    return pipelineQueue;
  }
  pipelineQueue = new Queue("pipeline", {
    connection: getRedis()
  });
  return pipelineQueue;
}

export function getDeadLetterQueue() {
  if (deadLetterQueue) {
    return deadLetterQueue;
  }
  deadLetterQueue = new Queue("pipeline_dead_letter", {
    connection: getRedis()
  });
  return deadLetterQueue;
}

export async function enqueuePipelineStage(input: {
  name: PipelineQueueJobName;
  payload: Record<string, unknown>;
  jobId: string;
}) {
  const queueJobId =
    input.name === "diagrams" || input.name === "actions"
      ? buildQueueJobId([input.jobId, input.name, String(Date.now())])
      : buildQueueJobId([input.jobId, input.name]);
  await getPipelineQueue().add(input.name, input.payload, {
    jobId: queueJobId,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 500
    },
    removeOnComplete: true,
    removeOnFail: false
  });
}

export async function enqueueDeadLetter(input: {
  jobId: string;
  stage: PipelineQueueJobName;
  payload: Record<string, unknown>;
  error: string;
}) {
  await getDeadLetterQueue().add(
    "dead_letter",
    {
      ...input
    },
    {
      jobId: buildQueueJobId([input.jobId, input.stage, "dead"])
    }
  );
}
