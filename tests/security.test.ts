import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { assertRateLimit, buildRateLimitKey, clearRateLimit, resetRateLimitsForTests } from "@/lib/rate-limit";
import { hashPassword, verifyPassword } from "@/lib/password";

function makeRequest(ip = "203.0.113.10") {
  return new Request("https://example.test/api/auth/login", {
    headers: {
      "x-forwarded-for": ip,
    },
  });
}

describe("password verification", () => {
  it("rejects malformed hashes instead of accepting plain text", () => {
    expect(verifyPassword("password123", "password123")).toBe(false);
    expect(verifyPassword("password123", hashPassword("password123"))).toBe(true);
  });
});

describe("rate limiting", () => {
  it("blocks requests after the configured attempt limit", () => {
    resetRateLimitsForTests();
    const key = buildRateLimitKey(makeRequest(), "login", "SA1001");

    assertRateLimit(key, { limit: 2, windowMs: 60_000, message: "Too many attempts." });
    assertRateLimit(key, { limit: 2, windowMs: 60_000, message: "Too many attempts." });

    expect(() => assertRateLimit(key, { limit: 2, windowMs: 60_000, message: "Too many attempts." })).toThrow(ApiError);
    clearRateLimit(key);
  });
});
