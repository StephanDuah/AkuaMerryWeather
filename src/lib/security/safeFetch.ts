import dns from "node:dns/promises";
import net from "node:net";

/**
 * Outbound fetch guard, against server-side request forgery.
 *
 * The threat is specific and real rather than theoretical. Prospect websites
 * come from OpenStreetMap, which anybody in the world can edit. An attacker
 * can set a London estate agent's `website` tag to an address on our own
 * network and wait: the nightly run discovers the record, fetches that
 * address **from inside the server**, and the response is parsed and shown on
 * the prospect's page in the dashboard. That is a read of internal services
 * with the answer delivered to a screen.
 *
 * Anything reachable only from the server is a target: cloud instance
 * metadata (169.254.169.254), a database admin port on localhost, another
 * service on the private network. So every outbound request to an address we
 * did not choose ourselves goes through here.
 *
 * What is enforced:
 *   - http and https only; no file:, gopher:, ftp: or data:
 *   - ports 80 and 443 only
 *   - the hostname must resolve to a public address, checked against every
 *     record returned, not just the first
 *   - redirects are followed by hand, with the same checks at every hop,
 *     because a public URL redirecting to 127.0.0.1 is the standard bypass
 *
 * Residual risk, stated honestly: between our DNS check and the connection,
 * a hostile resolver could return a different address (DNS rebinding). Fully
 * closing that needs connecting to the validated IP directly while preserving
 * TLS and the Host header, which Node's fetch does not expose. The window is
 * small and the attacker must control authoritative DNS; the checks below
 * stop every straightforward version of the attack.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_PORTS = new Set(["", "80", "443"]);
const MAX_REDIRECTS = 3;

/** Hostnames that never belong to a real prospect. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // Unparseable: refuse rather than guess.
  }
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const address = ip.toLowerCase().split("%")[0];
  if (address === "::1" || address === "::") return true;

  // IPv4 written inside IPv6 (::ffff:127.0.0.1) must be judged as IPv4.
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);

  const head = address.split(":")[0];
  if (head.startsWith("fc") || head.startsWith("fd")) return true; // unique local
  if (head.startsWith("fe8") || head.startsWith("fe9")) return true; // link-local
  if (head.startsWith("fea") || head.startsWith("feb")) return true; // link-local
  if (address.startsWith("2001:db8")) return true; // documentation
  return false;
}

/** True when an address belongs to a range that is not the public internet. */
export function isPrivateAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return ipv4IsPrivate(ip);
  if (version === 6) return ipv6IsPrivate(ip);
  return true; // Not an IP at all: refuse.
}

export interface UrlCheck {
  ok: boolean;
  /** Why it was refused, in words that can be shown to the owner. */
  reason: string | null;
  url: URL | null;
}

/**
 * Decides whether a URL may be fetched from the server.
 *
 * Does the DNS lookup itself, so a hostname pointing at a private address is
 * caught before any connection is made.
 */
export async function checkPublicUrl(raw: string): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: "Not a valid web address", url: null };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return {
      ok: false,
      reason: `Refused: ${url.protocol} is not a web address we will fetch`,
      url: null,
    };
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    return {
      ok: false,
      reason: `Refused: port ${url.port} is not a normal web port`,
      url: null,
    };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Refused: the address carries credentials", url: null };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "Refused: that address is on our own network", url: null };
  }

  // A literal IP needs no lookup, just judging.
  if (net.isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, reason: "Refused: that address is on a private network", url: null }
      : { ok: true, reason: null, url };
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: "That web address does not resolve", url: null };
  }
  if (addresses.length === 0) {
    return { ok: false, reason: "That web address does not resolve", url: null };
  }
  // Every answer must be public. One private record is enough to refuse,
  // because we cannot control which one the connection would use.
  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) {
      return {
        ok: false,
        reason: "Refused: that name points at an address on a private network",
        url: null,
      };
    }
  }

  return { ok: true, reason: null, url };
}

export interface SafeFetchResult {
  ok: boolean;
  /** Set when the request was refused before or during the fetch. */
  refused: string | null;
  response: Response | null;
  /** The address actually fetched, after any redirects. */
  finalUrl: string | null;
}

/**
 * Fetches a URL we did not choose, with every hop checked.
 *
 * Redirects are followed manually: `redirect: "follow"` would let a public
 * address hand us straight to a private one, which is the usual way this
 * protection is bypassed.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  options: { maxRedirects?: number } = {},
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  let target = raw;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const check = await checkPublicUrl(target);
    if (!check.ok || !check.url) {
      return { ok: false, refused: check.reason, response: null, finalUrl: null };
    }

    const response = await fetch(check.url.toString(), {
      ...init,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          ok: true,
          refused: null,
          response,
          finalUrl: check.url.toString(),
        };
      }
      // Resolve relative redirects against the hop we just made, then check
      // the result exactly as if it had been given to us from the start.
      target = new URL(location, check.url).toString();
      continue;
    }

    return { ok: true, refused: null, response, finalUrl: check.url.toString() };
  }

  return {
    ok: false,
    refused: `Refused: more than ${maxRedirects} redirects`,
    response: null,
    finalUrl: null,
  };
}
