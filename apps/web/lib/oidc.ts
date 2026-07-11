import { createPublicKey, createVerify } from "node:crypto";
import { getEnv } from "./env";
import type { AuthIdentity } from "./auth";

const TENANT_ID_RE = /^[a-z0-9-]{3,64}$/;

type DiscoveryDocument = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  issuer: string;
};

type Jwk = {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
};

type JwtHeader = {
  alg: string;
  kid?: string;
  typ?: string;
};

type IdTokenClaims = {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  tenant_id?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
};

let discoveryCache: DiscoveryDocument | null = null;
let jwksCache: { keys: Jwk[] } | null = null;

export async function getOidcDiscovery() {
  if (discoveryCache) {
    return discoveryCache;
  }
  const env = getEnv();
  if (!env.KEYCLOAK_ISSUER_URL) {
    throw new Error("KEYCLOAK_ISSUER_URL is required.");
  }
  const issuer = env.KEYCLOAK_ISSUER_URL.replace(/\/$/, "");
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`OIDC discovery failed with HTTP ${response.status}.`);
  }
  discoveryCache = (await response.json()) as DiscoveryDocument;
  return discoveryCache;
}

export async function buildAuthorizationUrl(input: { state: string; nonce: string }) {
  const env = getEnv();
  const discovery = await getOidcDiscovery();
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", env.KEYCLOAK_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  return url;
}

export async function exchangeCodeForIdentity(input: {
  code: string;
  expectedNonce: string;
}): Promise<{
  identity: AuthIdentity;
  idToken: string;
  refreshToken?: string;
  refreshExpiresAt?: number;
}> {
  const env = getEnv();
  const discovery = await getOidcDiscovery();
  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: env.KEYCLOAK_CLIENT_ID ?? "",
      client_secret: env.KEYCLOAK_CLIENT_SECRET ?? "",
      redirect_uri: callbackUrl(),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OIDC token exchange failed with HTTP ${response.status}: ${detail.slice(0, 300)}`,
    );
  }
  const token = (await response.json()) as {
    id_token?: string;
    refresh_token?: string;
    refresh_expires_in?: number;
  };
  if (!token.id_token) {
    throw new Error("OIDC provider did not return an id_token.");
  }
  const claims = await verifyIdToken(token.id_token, input.expectedNonce);
  const tenantId = claims.tenant_id;
  if (!tenantId || !TENANT_ID_RE.test(tenantId)) {
    throw new Error("OIDC id_token is missing a valid tenant_id claim.");
  }
  return {
    idToken: token.id_token,
    refreshToken: token.refresh_token,
    refreshExpiresAt: token.refresh_expires_in
      ? Date.now() + token.refresh_expires_in * 1000
      : undefined,
    identity: {
      issuer: claims.iss,
      subject: claims.sub,
      tenantId,
      email: claims.email,
      name: claims.name ?? claims.preferred_username,
      expiresAt: claims.exp * 1000,
    },
  };
}

export async function refreshOidcIdentity(input: { refreshToken: string }): Promise<{
  identity: AuthIdentity;
  idToken: string;
  refreshToken?: string;
  refreshExpiresAt?: number;
}> {
  const env = getEnv();
  const discovery = await getOidcDiscovery();
  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: env.KEYCLOAK_CLIENT_ID ?? "",
      client_secret: env.KEYCLOAK_CLIENT_SECRET ?? "",
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OIDC refresh failed with HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  const token = (await response.json()) as {
    id_token?: string;
    refresh_token?: string;
    refresh_expires_in?: number;
  };
  if (!token.id_token) {
    throw new Error("OIDC provider did not return an id_token during refresh.");
  }
  const claims = await verifyIdToken(token.id_token);
  const tenantId = claims.tenant_id;
  if (!tenantId || !TENANT_ID_RE.test(tenantId)) {
    throw new Error("Refreshed OIDC id_token is missing a valid tenant_id claim.");
  }
  return {
    idToken: token.id_token,
    refreshToken: token.refresh_token ?? input.refreshToken,
    refreshExpiresAt: token.refresh_expires_in
      ? Date.now() + token.refresh_expires_in * 1000
      : undefined,
    identity: {
      issuer: claims.iss,
      subject: claims.sub,
      tenantId,
      email: claims.email,
      name: claims.name ?? claims.preferred_username,
      expiresAt: claims.exp * 1000,
    },
  };
}

export async function buildLogoutUrl(input?: { idToken?: string }) {
  const discovery = await getOidcDiscovery();
  if (!discovery.end_session_endpoint) {
    return null;
  }
  const url = new URL(discovery.end_session_endpoint);
  if (input?.idToken) {
    url.searchParams.set("id_token_hint", input.idToken);
  }
  url.searchParams.set("client_id", getEnv().KEYCLOAK_CLIENT_ID ?? "");
  url.searchParams.set("post_logout_redirect_uri", getEnv().APP_BASE_URL);
  return url;
}

async function verifyIdToken(idToken: string, expectedNonce?: string): Promise<IdTokenClaims> {
  const [rawHeader, rawPayload, rawSignature] = idToken.split(".");
  if (!rawHeader || !rawPayload || !rawSignature) {
    throw new Error("Invalid id_token format.");
  }
  const header = decodeJwtPart<JwtHeader>(rawHeader);
  const claims = decodeJwtPart<IdTokenClaims>(rawPayload);
  if (header.alg !== "RS256") {
    throw new Error(`Unsupported id_token alg: ${header.alg}`);
  }
  const discovery = await getOidcDiscovery();
  const env = getEnv();
  const issuer = env.KEYCLOAK_ISSUER_URL?.replace(/\/$/, "");
  if (claims.iss !== discovery.issuer || claims.iss !== issuer) {
    throw new Error("Invalid id_token issuer.");
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(env.KEYCLOAK_CLIENT_ID ?? "")) {
    throw new Error("Invalid id_token audience.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    throw new Error("Expired id_token.");
  }
  if (claims.iat > now + 60) {
    throw new Error("Invalid id_token iat.");
  }
  if (expectedNonce && claims.nonce !== expectedNonce) {
    throw new Error("Invalid id_token nonce.");
  }
  const jwk = await findSigningKey(header.kid);
  const verify = createVerify("RSA-SHA256");
  verify.update(`${rawHeader}.${rawPayload}`);
  verify.end();
  const ok = verify.verify(
    createPublicKey({ key: jwk, format: "jwk" }),
    base64urlToBuffer(rawSignature),
  );
  if (!ok) {
    throw new Error("Invalid id_token signature.");
  }
  return claims;
}

async function findSigningKey(kid?: string) {
  if (!jwksCache) {
    const discovery = await getOidcDiscovery();
    const response = await fetch(discovery.jwks_uri, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`JWKS fetch failed with HTTP ${response.status}.`);
    }
    jwksCache = (await response.json()) as { keys: Jwk[] };
  }
  const key = jwksCache.keys.find(
    (candidate) => candidate.kty === "RSA" && (!kid || candidate.kid === kid),
  );
  if (!key) {
    throw new Error("OIDC signing key not found.");
  }
  return key;
}

function callbackUrl() {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/api/v1/auth/callback`;
}

function decodeJwtPart<T>(value: string): T {
  return JSON.parse(base64urlToBuffer(value).toString("utf8")) as T;
}

function base64urlToBuffer(value: string) {
  return Buffer.from(value, "base64url");
}
