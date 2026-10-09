import crypto from "node:crypto";

/**
 * Signed conversation tokens.
 *
 * The chat used to trust a `leadId` sent by the browser. Whatever identifier
 * arrived was the customer the assistant answered as, which meant anyone who
 * came by a lead id — a guessed one, one left in a shared link, one from a
 * forwarded message — could send it to `/api/chat` and read back that
 * person's name, postcode, quote and booking dates. That is somebody else's
 * personal data, handed over on request.
 *
 * So the browser no longer chooses. The server issues a token that says which
 * lead a conversation belongs to, signs it, and only accepts its own
 * signature back. A raw or guessed identifier is now simply rejected, and a
 * token cannot be edited to point at a different customer without breaking
 * the signature.
 *
 * Tokens expire after a day, which is longer than any real conversation and
 * short enough that one copied out of a browser does not work for ever.
 *
 * The signing key is `ADMIN_SESSION_SECRET`, which production must set
 * anyway. Outside production a derived key keeps local development working.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function signingKey(): string {
  const configured = process.env.ADMIN_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return "";
  return `dev-lead-token-${process.env.ADMIN_PASSWORD ?? "merry-admin"}`;
}

function sign(payload: string, key: string): string {
  return crypto.createHmac("sha256", key).update(payload).digest("hex");
}

/** Issues a token for a lead. Returns null if signing is not possible. */
export function issueLeadToken(leadId: string): string | null {
  const key = signingKey();
  if (!key || !leadId) return null;
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = `${leadId}.${expires}`;
  return `${payload}.${sign(payload, key)}`;
}

/**
 * Returns the lead id a token vouches for, or null.
 *
 * Null for anything unsigned, expired, altered, or simply made up — which
 * includes a bare lead id, the exact thing this replaces.
 */
export function readLeadToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const key = signingKey();
  if (!key) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [leadId, expires, signature] = parts;
  if (!leadId) return null;

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  const expected = sign(`${leadId}.${expires}`, key);
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? leadId : null;
}
