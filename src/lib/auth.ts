import crypto from "node:crypto";
import { cookies } from "next/headers";

/**
 * Admin authentication.
 *
 * A single owner password, exchanged for a signed session cookie. This is the
 * smallest thing that is genuinely safe for a one-person business at zero
 * cost; Supabase Auth is the documented upgrade path once there is more than
 * one member of staff (see DECISIONS.md).
 *
 * Two failure modes are guarded against explicitly, because both are silent:
 *
 * **The development password reaching production.** `merry-admin` is written
 * in this file, and this file is in a public repository. If `ADMIN_PASSWORD`
 * is ever unset in production — a typo in the Vercel dashboard, a variable set
 * on preview but not production — the dashboard would be protected by a
 * password anyone can read. In production an unset password now locks the
 * dashboard instead of opening it.
 *
 * **A guessable session secret.** The old fallback derived the signing key
 * from the password, so with the default password the key was
 * `dev-secret-merry-admin` — public knowledge, and enough to forge a valid
 * admin cookie without ever seeing the login form. In production the session
 * secret must be set, or no session can be issued or accepted.
 */

export const ADMIN_COOKIE = "mc_admin_session";
const SESSION_DAYS = 7;

/** Development default, so the dashboard is reachable before any .env exists. */
const DEV_PASSWORD = "merry-admin";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || DEV_PASSWORD;
}

export function usingDefaultPassword(): boolean {
  return !process.env.ADMIN_PASSWORD;
}

/**
 * Whether sign-in is possible at all.
 *
 * In production both variables must be set. Neither has a safe default, so
 * rather than fall back to something guessable the dashboard closes and says
 * why. The deployment is broken either way; this way it is broken shut.
 */
export function authConfigurationProblem(): string | null {
  if (!isProduction()) return null;
  if (!process.env.ADMIN_PASSWORD) {
    return "ADMIN_PASSWORD is not set on this deployment, so the dashboard is locked. Set it in your hosting environment variables and redeploy.";
  }
  if (!process.env.ADMIN_SESSION_SECRET) {
    return "ADMIN_SESSION_SECRET is not set on this deployment, so sessions cannot be signed safely and the dashboard is locked. Set it in your hosting environment variables and redeploy.";
  }
  return null;
}

function secret(): string | null {
  const configured = process.env.ADMIN_SESSION_SECRET;
  if (configured) return configured;
  // Outside production a derived key keeps local development working. In
  // production there is no fallback: an unsigned session is no session.
  return isProduction() ? null : `dev-secret-${adminPassword()}`;
}

function sign(payload: string, key: string): string {
  return crypto.createHmac("sha256", key).update(payload).digest("hex");
}

export function createSessionToken(): string | null {
  const key = secret();
  if (!key || authConfigurationProblem()) return null;
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `admin.${expires}`;
  return `${payload}.${sign(payload, key)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  if (authConfigurationProblem()) return false;

  const key = secret();
  if (!key) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [scope, expires, signature] = parts;
  if (scope !== "admin") return false;

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = sign(`${scope}.${expires}`, key);
  // Both sides are fixed-length hex of the same HMAC, so a plain
  // constant-time compare is enough here.
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Checks the owner's password in constant time.
 *
 * Both sides are hashed first so that the comparison reveals nothing about
 * the password's length, which a raw length check would.
 */
export function checkPassword(attempt: string): boolean {
  if (authConfigurationProblem()) return false;
  const expected = adminPassword();
  const a = crypto.createHash("sha256").update(attempt ?? "", "utf8").digest();
  const b = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

/** For server components and layouts. */
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(ADMIN_COOKIE)?.value);
}

/** For route handlers: returns a 401 response when not signed in. */
export async function requireAdmin(): Promise<Response | null> {
  if (await isAdmin()) return null;
  return Response.json(
    { error: "Not authorised. Please sign in to the dashboard." },
    { status: 401 },
  );
}

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
