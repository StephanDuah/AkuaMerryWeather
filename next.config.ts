import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The site had none, which meant the browser was given no instructions about
 * what it was allowed to do with the page. These close the gaps that do not
 * need any application change to exploit: a script injected anywhere, the
 * site loaded inside somebody else's frame, a referrer carrying a customer's
 * details to a third party.
 *
 * The content security policy is the important one. It says where scripts,
 * styles, images and connections may come from, so an injected `<script
 * src="https://attacker.example/x.js">` simply does not load. `'unsafe-inline'`
 * on styles is needed by Next's own style handling; on scripts it is needed
 * by the framework's inline bootstrap, and removing it requires per-request
 * nonces through middleware, which is the documented next step in SECURITY.md
 * rather than something to half-do here.
 */

const csp = [
  "default-src 'self'",
  // Next injects inline bootstrap scripts; Stripe's script is loaded only if
  // payments are switched on.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // The browser only ever talks to us. Everything else - Anthropic, Resend,
  // Companies House, OpenStreetMap - is called from the server, so no
  // outbound origin belongs here.
  "connect-src 'self'",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "form-action 'self'",
  // Nobody may put this site in a frame: no clickjacking a booking form or
  // the dashboard's sign-in.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Belt and braces alongside frame-ancestors, for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops a browser second-guessing a declared content type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // A customer's postcode can appear in a URL; do not hand it to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs a camera, a microphone or a location.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // Two years, subdomains included. Only ever sent over HTTPS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework version to anyone scanning for it.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // The dashboard and every API response: never cached by a browser or
        // a shared proxy, because both carry customer data.
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
