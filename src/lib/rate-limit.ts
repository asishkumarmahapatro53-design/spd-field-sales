import { ApiError } from "@/lib/api";

interface RateLimitOptions {
  limit: number;
  windowMs: number;
  message: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();
let lastCleanupAt = 0;

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < 60_000) {
    return;
  }

  lastCleanupAt = now;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function getClientFingerprint(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();

  return forwardedFor || realIp || cloudflareIp || "unknown-client";
}

function normalizeKeyPart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.:@-]/g, "_").slice(0, 120) || "unknown";
}

export function buildRateLimitKey(request: Request, scope: string, subject = "global") {
  return [normalizeKeyPart(scope), normalizeKeyPart(getClientFingerprint(request)), normalizeKeyPart(subject)].join(":");
}

export function assertRateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return;
  }

  if (bucket.count >= options.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new ApiError(429, `${options.message} Try again after ${retryAfterSeconds} seconds.`);
  }

  bucket.count += 1;
}

export function clearRateLimit(key: string) {
  buckets.delete(key);
}

export function resetRateLimitsForTests() {
  buckets.clear();
  lastCleanupAt = 0;
}
