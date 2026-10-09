import crypto from "node:crypto";

/**
 * Shared-secret checks for machine-to-machine endpoints.
 *
 * Two rules, both learned the hard way in other people's incident reports.
 *
 * **Fail closed in production.** The obvious way to write these checks is
 * "if no secret is configured, allow the request", so the thing works on a
 * laptop. That is fine until the environment variable is missing in
 * production — a typo in the Vercel dashboard, a variable set on preview but
 * not production, a project restored from a template — and then the endpoint
 * is simply open to the internet, silently, with nothing in the logs to say
 * so. Here, a missing secret is permissive only outside production. In
 * production it refuses.
 *
 * **Compare in constant time.** `a === b` on a secret returns as soon as it
 * finds a difference, so how long it takes reveals how much of the prefix was
 * right. Over enough requests that is a working attack. Both sides are hashed
 * to a fixed length first, so even the length of the guess leaks nothing.
 */

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Constant-time comparison that does not leak the length of either side. */
export function secretsMatch(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

export interface SecretCheck {
  ok: boolean;
  /** What to log. Never sent to the caller. */
  reason: string;
}

/**
 * Checks a shared secret supplied as a Bearer token, an `x-webhook-secret`
 * header, or a `secret` query parameter.
 *
 * @param envName which environment variable holds the expected value
 */
export function checkSharedSecret(
  request: Request,
  envName: "CRON_SECRET" | "EMAIL_WEBHOOK_SECRET",
): SecretCheck {
  const expected = process.env[envName];

  if (!expected) {
    if (isProduction()) {
      // Refusing is the safe failure. An endpoint that quietly serves the
      // world because a variable is unset is worse than one that is down.
      return {
        ok: false,
        reason: `${envName} is not set. Refusing in production rather than running unauthenticated.`,
      };
    }
    return { ok: true, reason: `${envName} not set; permitted outside production` };
  }

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const webhook = request.headers.get("x-webhook-secret") ?? "";

  let query = "";
  try {
    query = new URL(request.url).searchParams.get("secret") ?? "";
  } catch {
    query = "";
  }

  for (const candidate of [bearer, webhook, query]) {
    if (candidate && secretsMatch(candidate, expected)) {
      return { ok: true, reason: "secret accepted" };
    }
  }

  return { ok: false, reason: "no valid secret supplied" };
}

/**
 * The standard refusal. Deliberately says nothing about why, so it cannot be
 * used to work out whether a secret is configured at all.
 */
export function refuse(): Response {
  return Response.json({ error: "Not authorised." }, { status: 401 });
}

/**
 * Whether an internal error's text may be shown to the caller.
 *
 * In production it may not: a database error carries table and column names,
 * a fetch error carries internal hostnames. Those go to the logs instead.
 */
export function safeErrorMessage(error: unknown): string {
  if (isProduction()) {
    return "Something went wrong. It has been logged.";
  }
  return error instanceof Error ? error.message : String(error);
}
