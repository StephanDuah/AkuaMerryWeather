/**
 * Rate limiting for public endpoints.
 *
 * Why this matters here specifically: /api/chat costs real money per call
 * once an AI key is configured. Without a limit, anyone with the URL could
 * run up the bill, and there is no spending cap at the application layer.
 *
 * This is an in-memory fixed-window counter. It is deliberately simple and
 * has one honest limitation: on a serverless host each instance keeps its
 * own counter, so a determined attacker spread across instances gets a
 * higher effective ceiling. It stops casual abuse and accidental loops,
 * which is the realistic threat at this scale.
 *
 * PRODUCTION UPGRADE: move the counter to shared storage (Vercel KV or
 * Upstash Redis, both have free tiers) and the same interface applies. See
 * SECURITY.md.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Stops the map growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (windows.size < 5000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const LIMITS = {
  /** Costs money per call once a model is connected. */
  chat: { limit: 20, windowMs: 60_000 },
  /** Cheap, but writes to the database. */
  quote: { limit: 30, windowMs: 60_000 },
  /** Creates records; tighter to discourage junk leads. */
  lead: { limit: 10, windowMs: 60_000 },
  booking: { limit: 10, windowMs: 60_000 },
  /** Read-only. */
  read: { limit: 60, windowMs: 60_000 },
  /**
   * Sign-in attempts. Much tighter than anything else here: this is the one
   * endpoint where an attacker is guessing a secret rather than consuming a
   * resource, and there is exactly one password to guess. Ten tries every
   * fifteen minutes leaves an owner who has mistyped their password room to
   * try again, while making an online guessing attack useless.
   */
  login: { limit: 10, windowMs: 15 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Identifies the caller. Behind Vercel the client IP arrives in
 * x-forwarded-for; the first entry is the original client.
 */
export function clientKey(request: Request, bucket: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const real = request.headers.get("x-real-ip");
  const ip =
    forwarded?.split(",")[0]?.trim() || real?.trim() || "unknown";
  return `${bucket}:${ip}`;
}

export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: rule.limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/**
 * Guards a route. Returns a 429 Response when the caller has had enough,
 * otherwise null so the handler continues.
 */
export function rateLimit(
  request: Request,
  bucket: keyof typeof LIMITS,
  message = "Too many requests. Please wait a moment and try again.",
): Response | null {
  const result = checkRateLimit(clientKey(request, bucket), LIMITS[bucket]);
  if (result.allowed) return null;

  return Response.json(
    { ok: false, message },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

/**
 * The same limiter for server actions, which receive form data rather than a
 * Request and so cannot use `rateLimit` above.
 *
 * The caller passes the forwarded-for header it read from `headers()`.
 */
export function checkActionRateLimit(
  forwardedFor: string | null,
  bucket: keyof typeof LIMITS,
): RateLimitResult {
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
  return checkRateLimit(`${bucket}:${ip}`, LIMITS[bucket]);
}
