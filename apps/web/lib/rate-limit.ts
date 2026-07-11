import { getEnv } from "./env";

type RateState = {
  minute: number;
  count: number;
};

const memoryRateStore = new Map<string, RateState>();

export function checkRateLimit(key: string) {
  const nowMinute = Math.floor(Date.now() / 60000);
  const current = memoryRateStore.get(key);
  if (!current || current.minute !== nowMinute) {
    memoryRateStore.set(key, {
      minute: nowMinute,
      count: 1,
    });
    return true;
  }
  if (current.count >= getEnv().API_RATE_LIMIT_PER_MINUTE) {
    return false;
  }
  current.count += 1;
  memoryRateStore.set(key, current);
  return true;
}
