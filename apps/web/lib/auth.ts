import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "./env";
import { refreshOidcIdentity } from "./oidc";
import { clearAuthSession, getAuthSession, storeAuthSession } from "./session-token-store";

const SESSION_COOKIE = "omni_session";
export const OIDC_STATE_COOKIE = "omni_oidc_state";

export type AuthIdentity = {
  issuer: string;
  subject: string;
  tenantId: string;
  email?: string;
  name?: string;
  expiresAt: number;
};

export type AppSession = {
  tenantId: string;
  csrfToken: string;
  sessionId: string;
  issuedAt: number;
  auth?: AuthIdentity;
};

type AppSessionCookie = {
  tenantId: string;
  csrfToken: string;
  sessionId: string;
  issuedAt: number;
  auth?: AuthIdentity;
};

export async function ensureSessionCookie() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  if (existing) {
    const decoded = decodeSession(existing);
    return hydrateSessionAuth(decoded);
  }
  const session: AppSession = {
    tenantId: getEnv().DEFAULT_TENANT_ID,
    sessionId: randomUUID(),
    csrfToken: randomUUID(),
    issuedAt: Date.now()
  };
  cookieStore.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions());
  return session;
}

export async function setAuthenticatedSession(
  identity: AuthIdentity,
  options: { idToken: string; refreshToken?: string; refreshExpiresAt?: number }
) {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  const base = existing ? decodeSession(existing) : await ensureSessionCookie();
  const session: AppSession = { ...base, auth: identity };
  await storeAuthSession({
    sessionId: session.sessionId,
    session: {
      identity,
      idToken: options.idToken,
      refreshToken: options.refreshToken,
      refreshExpiresAt: options.refreshExpiresAt
    }
  });
  cookieStore.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions());
  return session;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  if (existing) {
    await clearAuthSession(decodeSession(existing).sessionId);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export function isAuthRequired() {
  return getEnv().AUTH_MODE === "keycloak";
}

export function requireAuthenticatedSession(session: AppSession) {
  if (!isAuthRequired()) {
    return;
  }
  if (!session.auth) {
    throw new Error("Authentication required.");
  }
}

export function getOwnerFromSession(session: AppSession) {
  if (!isAuthRequired()) {
    return { ownerIssuer: null, ownerSubject: null };
  }
  requireAuthenticatedSession(session);
  return {
    ownerIssuer: session.auth?.issuer ?? null,
    ownerSubject: session.auth?.subject ?? null
  };
}

export function resolveSessionTenantId(session: AppSession) {
  return isAuthRequired() && session.auth ? session.auth.tenantId : session.tenantId;
}

export function canAccessOwnedResource(
  session: AppSession,
  resource: { ownerIssuer?: string | null; ownerSubject?: string | null; tenantId?: string | null; objectKey?: string | null }
) {
  const tenantId = resolveSessionTenantId(session);
  if (!isAuthRequired()) {
    return !resource.objectKey || resource.objectKey.startsWith(`${tenantId}/`);
  }
  if (!session.auth) {
    return false;
  }
  return (
    resource.tenantId === tenantId &&
    resource.ownerIssuer === session.auth.issuer &&
    resource.ownerSubject === session.auth.subject
  );
}

export function createOidcState() {
  return {
    state: randomUUID(),
    nonce: randomUUID()
  };
}

export async function setOidcStateCookie(value: { state: string; nonce: string; returnTo?: string }) {
  const cookieStore = await cookies();
  cookieStore.set(OIDC_STATE_COOKIE, encodeSigned(value), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60
  });
}

export async function consumeOidcStateCookie() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(OIDC_STATE_COOKIE)?.value;
  cookieStore.delete(OIDC_STATE_COOKIE);
  if (!raw) {
    return null;
  }
  return decodeSigned<{ state: string; nonce: string; returnTo?: string }>(raw);
}

export function validateCsrf(request: Request, csrfToken: string) {
  const header = request.headers.get("x-csrf-token");
  return Boolean(header && header === csrfToken);
}

export function decodeSession(value: string): AppSession {
  const decoded = decodeSigned<Partial<AppSessionCookie>>(value);
  if (!decoded.tenantId || !decoded.csrfToken || !decoded.issuedAt) {
    throw new Error("Invalid session cookie payload.");
  }
  return {
    tenantId: decoded.tenantId,
    csrfToken: decoded.csrfToken,
    sessionId: decoded.sessionId ?? randomUUID(),
    issuedAt: decoded.issuedAt
  };
}

function encodeSession(input: AppSession) {
  return encodeSigned({
    tenantId: input.tenantId,
    csrfToken: input.csrfToken,
    sessionId: input.sessionId,
    issuedAt: input.issuedAt
  } satisfies AppSessionCookie);
}

function encodeSigned(input: unknown) {
  const encoded = Buffer.from(JSON.stringify(input)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function decodeSigned<T>(value: string): T {
  const [data, signature] = value.split(".");
  if (!data || !signature) {
    throw new Error("Invalid signed cookie format.");
  }
  const expected = sign(data);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    throw new Error("Invalid signed cookie signature.");
  }
  return JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T;
}

function sign(value: string) {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(value).digest("hex");
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90
  };
}

async function hydrateSessionAuth(session: AppSession): Promise<AppSession> {
  if (!isAuthRequired()) {
    return session;
  }
  const stored = await getAuthSession(session.sessionId);
  if (!stored) {
    return session;
  }
  if (stored.identity.expiresAt > Date.now() + 30_000) {
    return { ...session, auth: stored.identity };
  }
  if (!stored.refreshToken) {
    await clearAuthSession(session.sessionId);
    return session;
  }
  try {
    const refreshed = await refreshOidcIdentity({ refreshToken: stored.refreshToken });
    await storeAuthSession({
      sessionId: session.sessionId,
      session: {
        identity: refreshed.identity,
        idToken: refreshed.idToken,
        refreshToken: refreshed.refreshToken,
        refreshExpiresAt: refreshed.refreshExpiresAt
      }
    });
    return { ...session, auth: refreshed.identity };
  } catch {
    await clearAuthSession(session.sessionId);
    return session;
  }
}
