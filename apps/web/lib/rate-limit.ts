import { getEnv } from "./env";
import { logError } from "./logger";
import { getRedis } from "./redis";

export async function checkRateLimit(key: string): Promise<boolean> {
  const minuteBucket = Math.floor(Date.now() / 60000);
  const redisKey = `omnivox:rate:${key}:${minuteBucket}`;
  try {
    const redis = getRedis();
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, 90);
    }
    return count <= getEnv().API_RATE_LIMIT_PER_MINUTE;
  } catch (error) {
    // Fail open: a Redis blip must not take the whole API down.
    logError({
      event: "rate_limit.check_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}
