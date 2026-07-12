import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ??= "test-openai-key-0123456789";
process.env.API_RATE_LIMIT_PER_MINUTE ??= "5";

// Integration test against the local Redis from the compose stack; CI has no
// Redis service, so it runs only locally.
describe.skipIf(Boolean(process.env.CI))("checkRateLimit (Redis)", () => {
  it("allows up to the per-minute limit, then blocks, and tracks keys independently", async () => {
    const { checkRateLimit } = await import("../lib/rate-limit");
    const limit = Number(process.env.API_RATE_LIMIT_PER_MINUTE);
    const key = `test:${randomUUID()}`;
    const other = `test:${randomUUID()}`;

    for (let i = 0; i < limit; i += 1) {
      expect(await checkRateLimit(key)).toBe(true);
    }
    expect(await checkRateLimit(key)).toBe(false);
    expect(await checkRateLimit(other)).toBe(true);
  });
});
