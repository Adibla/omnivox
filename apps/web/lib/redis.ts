import IORedis from "ioredis";
import { getEnv } from "./env";

let redis: IORedis | null = null;

export function getRedis() {
  if (redis) {
    return redis;
  }
  redis = new IORedis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  return redis;
}
