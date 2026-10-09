import { NextResponse, type NextRequest } from "next/server";

/**
 * Response hardening that has to happen per-request.
 *
 * `next.config.ts` sets the site-wide security headers, but it cannot win
 * against `Cache-Control` on a dynamically rendered page: the framework sets
 * its own, and ours is overwritten. Dashboard pages carry customers' names,
 * addresses and telephone numbers, so "revalidate before reuse" is not good
 * enough — they must not be written to a disk cache at all, by the browser or
 * by anything between us and it. This runs around the route, so setting the
 * header here is what actually sticks.
 *
 * This is the `proxy` file convention; `middleware` is its deprecated name in
 * this version of the framework.
 *
 * It also removes the framework's own fingerprinting headers. Knowing the
 * exact version of the stack is the first step of a targeted attack, and it
 * is information nobody legitimate needs.
 */

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const path = request.nextUrl.pathname;

  if (path.startsWith("/admin") || path.startsWith("/api")) {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  if (path.startsWith("/admin")) {
    // The dashboard must never appear in a search index, whatever links to it.
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  }

  response.headers.delete("x-powered-by");
  response.headers.delete("x-nextjs-cache");

  return response;
}

export const config = {
  // Everything except the framework's own assets and static files, which are
  // meant to be cached and carry nothing sensitive.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|photos|logo.png).*)"],
};
