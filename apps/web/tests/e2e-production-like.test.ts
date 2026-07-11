import { describe, expect, test } from "vitest";

const baseUrl = process.env.E2E_BASE_URL;

describe("production-like API smoke", () => {
  test.skipIf(!baseUrl)("creates session and returns csrf token", async () => {
    const base = baseUrl as string;
    const response = await fetch(`${base}/api/v1/auth/session`, {
      method: "POST",
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { csrfToken?: string };
    expect(typeof body.csrfToken).toBe("string");
  });

  test.skipIf(!baseUrl)("health endpoint is reachable", async () => {
    const base = (baseUrl as string).replace(":3000", ":4010");
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });
});
