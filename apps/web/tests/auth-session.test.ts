import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSession } from "../lib/auth";
import { decodeSession, encodeSession, validateCsrf } from "../lib/auth";
import { checkRateLimit } from "../lib/rate-limit";

// getEnv() is lazy and cached: these must be in place before the first call.
process.env.OPENAI_API_KEY ??= "test-openai-key-0123456789";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789";
process.env.API_RATE_LIMIT_PER_MINUTE ??= "5";

const baseSession: AppSession = {
  tenantId: "acme",
  csrfToken: "11111111-2222-3333-4444-555555555555",
  sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  issuedAt: 1_700_000_000_000,
};

describe("session cookie signing", () => {
  it("round-trips encode/decode", () => {
    const decoded = decodeSession(encodeSession(baseSession));
    expect(decoded).toEqual(baseSession);
  });

  it("rejects a tampered payload", () => {
    const cookie = encodeSession(baseSession);
    const [, signature] = cookie.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...baseSession, tenantId: "other-tenant" }),
    ).toString("base64url");
    expect(() => decodeSession(`${forged}.${signature}`)).toThrow(/signature/i);
  });

  it("rejects a tampered signature", () => {
    const cookie = encodeSession(baseSession);
    const flipped = cookie.slice(0, -1) + (cookie.endsWith("0") ? "1" : "0");
    expect(() => decodeSession(flipped)).toThrow(/signature/i);
  });

  it("rejects malformed cookie values", () => {
    expect(() => decodeSession("not-a-signed-cookie")).toThrow(/format/i);
    expect(() => decodeSession("")).toThrow();
  });
});

describe("validateCsrf", () => {
  const makeRequest = (token?: string) =>
    new Request("http://localhost/api/v1/test", {
      method: "POST",
      headers: token ? { "x-csrf-token": token } : {},
    });

  it("accepts a matching token", () => {
    expect(validateCsrf(makeRequest(baseSession.csrfToken), baseSession.csrfToken)).toBe(true);
  });

  it("rejects a missing header", () => {
    expect(validateCsrf(makeRequest(), baseSession.csrfToken)).toBe(false);
  });

  it("rejects a mismatched token", () => {
    expect(validateCsrf(makeRequest("wrong-token"), baseSession.csrfToken)).toBe(false);
  });
});

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks after the per-minute limit and resets on the next minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    const limit = Number(process.env.API_RATE_LIMIT_PER_MINUTE);
    const key = "test-tenant:rate-limit-window";

    for (let i = 0; i < limit; i += 1) {
      expect(checkRateLimit(key)).toBe(true);
    }
    expect(checkRateLimit(key)).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T10:01:00Z"));
    expect(checkRateLimit(key)).toBe(true);
  });

  it("tracks keys independently", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T11:00:00Z"));
    const limit = Number(process.env.API_RATE_LIMIT_PER_MINUTE);

    for (let i = 0; i < limit; i += 1) {
      expect(checkRateLimit("tenant-a:action")).toBe(true);
    }
    expect(checkRateLimit("tenant-a:action")).toBe(false);
    expect(checkRateLimit("tenant-b:action")).toBe(true);
  });
});
