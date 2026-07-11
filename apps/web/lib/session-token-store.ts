import IORedis from "ioredis";
import { getEnv } from "./env";
import type { AuthIdentity } from "./auth";

let redis: IORedis | null = null;

function getRedis() {
  if (redis) {
    return redis;
  }
  redis = new IORedis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null
  });
  return redis;
}

export type StoredAuthSession = {
  identity: AuthIdentity;
  idToken: string;
  refreshToken?: string;
  refreshExpiresAt?: number;
};

function sessionKey(sessionId: string) {
  return `omnivox:session:${sessionId}`;
}

export async function storeAuthSession(input: { sessionId: string; session: StoredAuthSession }) {
  const expiresAt = input.session.refreshExpiresAt ?? input.session.identity.expiresAt;
  const ttlSeconds = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000));
  await getRedis().set(sessionKey(input.sessionId), JSON.stringify(input.session), "EX", ttlSeconds);
}

export async function getAuthSession(sessionId: string): Promise<StoredAuthSession | null> {
  const raw = await getRedis().get(sessionKey(sessionId));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as StoredAuthSession;
}

export async function clearAuthSession(sessionId: string) {
  await getRedis().del(sessionKey(sessionId));
}
