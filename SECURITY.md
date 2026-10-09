# Security

What was reviewed, what was found, what was fixed, and what remains.

**First review:** 19 September 2026.
**Second review (adversarial):** 19 September 2026 — a deliberate attempt to
break the finished system, including the prospecting feature. Seven weaknesses
were found and fixed; they are listed first because they are the serious ones.

This documents real audits, not an assertion that the code is fine.

---

# Second review — findings

Each of these is now covered by a test in `tests/security.mjs`, so undoing a
fix fails the suite rather than going unnoticed.

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| A | **Server-side request forgery in prospect verification.** Prospect websites come from OpenStreetMap, which anyone in the world can edit. Setting a London agency's `website` tag to `http://169.254.169.254/` or `http://127.0.0.1:3000/…` would make the nightly run fetch that address *from inside the server* and show what came back on the prospect's page. A read of internal services with the answer delivered to a screen. | **Critical** | **Fixed** |
| B | **Machine endpoints failed open.** Every cron route and the inbound email webhook allowed the request when their secret was unset. A missing variable in production — a typo, a value set on preview but not production — would have left them open to the internet, silently. | **High** | **Fixed** |
| C | **A guessable session key.** With `ADMIN_SESSION_SECRET` unset, the signing key fell back to `dev-secret-` plus the password, and the password fell back to `merry-admin`. Both strings are in this public repository, so an admin cookie could be forged without ever seeing the login page. | **Critical** if the variable were missing | **Fixed** |
| D | **No limit on password guessing.** One password protects the whole dashboard and it could be tried without limit. | **High** | **Fixed** |
| E | **One visitor could read another customer's record.** `/api/chat` trusted a `leadId` sent by the browser, so anyone holding a lead id — guessed, copied, forwarded — could ask the assistant about that person and get back their name, postcode, quote and booking dates. `/api/bookings` likewise accepted any `lead_id`. | **High** (personal data) | **Fixed** |
| F | **No security headers at all.** No content security policy, no framing protection, no `nosniff`, no referrer policy. An injected script would have run, and the booking form or sign-in page could be framed by another site. | **Medium** | **Fixed** |
| G | **Internal error text returned to callers.** Database and network errors carry table names and internal hostnames. | **Low** | **Fixed** |

## A — Outbound request guard

`src/lib/security/safeFetch.ts`. Every fetch to an address we did not choose
ourselves goes through it:

- `http` and `https` only — no `file:`, `gopher:` or `data:`
- ports 80 and 443 only
- the hostname is resolved first, and **every** returned address must be
  public: loopback, private ranges, link-local (including cloud metadata),
  carrier-grade NAT, multicast and the documentation ranges are all refused
- redirects are followed by hand with the same checks at each hop, because a
  public URL redirecting to `127.0.0.1` is the standard way past this
- `localhost`, `*.internal`, `*.local` and the known metadata hostnames are
  refused by name as well

**Residual risk, stated plainly:** between the DNS check and the connection, a
hostile resolver could answer differently (DNS rebinding). Closing that fully
means connecting to the validated address directly while preserving TLS and
the `Host` header, which Node's `fetch` does not expose. The attacker would
need control of authoritative DNS for a domain we were already verifying.

## B — Fail closed, not open

`src/lib/security/secrets.ts`. In production a missing secret **locks** the
endpoint; outside production it stays permissive so a laptop still works. The
comparison is constant-time over hashes, so neither the value nor its length
leaks through timing.

## C, D — Admin authentication

- In production, a missing `ADMIN_PASSWORD` or `ADMIN_SESSION_SECRET` locks the
  dashboard and says which variable is missing. There is no fallback to
  anything guessable.
- Passwords are compared as SHA-256 digests in constant time, so the check
  reveals nothing about length or content.
- Sign-in is limited to **10 attempts per 15 minutes** per address. An owner
  who mistypes has room; an attacker guessing does not.

## E — Conversations are bound to a signed token

`src/lib/security/leadToken.ts`. The browser is never given a record id. It
gets a token that names the lead, signed with the session secret and valid for
24 hours. A raw id is rejected, and a token cannot be edited to point at
another customer without breaking the signature.

## F — Security headers

Set in `next.config.ts`, with `src/proxy.ts` for the per-request parts:

| Header | Why |
| --- | --- |
| `Content-Security-Policy` | Where scripts, styles, images and connections may come from. `connect-src 'self'` — the browser only ever talks to us; Anthropic, Resend, Companies House and OpenStreetMap are all called from the server. |
| `frame-ancestors 'none'` + `X-Frame-Options` | Nobody may frame the booking form or the sign-in page |
| `X-Content-Type-Options: nosniff` | No second-guessing a declared content type |
| `Referrer-Policy` | A customer's postcode can appear in a URL; it is not handed to other sites |
| `Permissions-Policy` | No camera, microphone, location or payment APIs |
| `Strict-Transport-Security` | HTTPS only, two years, subdomains included |
| `Cache-Control: no-store` on `/api` | Responses carry customer data |
| `X-Robots-Tag: noindex` on `/admin` | The dashboard never reaches a search index |

**Checked on the live deployment**, because the development server and
production do not behave the same here. In production `/admin` returns:

```
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
```

`no-store` and `private` are both present, so no shared cache and no browser
disk cache may keep a dashboard page. On the development server the framework
emits only `no-cache, must-revalidate` for rendered pages; that is a local
artefact, and the test accepts either so it can run in both places.

**CSP caveat:** `script-src` still allows `'unsafe-inline'` and
`'unsafe-eval'`, which the framework's bootstrap requires. Removing them means
per-request nonces through `src/proxy.ts`. That is the next hardening step,
not something to half-do.

---

# Dependencies and the supply chain

The application has 8 direct dependencies but **456 packages** in its tree.
That tree is the real attack surface: code written by hundreds of people, most
of whom nobody here has heard of, running with the same permissions as the
application.

## What was found

| | |
| --- | --- |
| Packages in the tree | 456 |
| Known vulnerabilities | **0** |
| Packages that execute code at install time | **1** (`unrs-resolver`, development only) |
| Packages with an integrity hash in the lockfile | **456 of 456** |
| Direct dependencies declared loosely | **12 of 16** — now 0 |

## What was done

**Install scripts are blocked** (`.npmrc`, `ignore-scripts=true`). This is the
single most effective control available here. Almost every npm supply-chain
attack of recent years worked the same way: an attacker takes over a package —
by compromising a maintainer's account, buying an abandoned one, or
typo-squatting a name — and adds a `postinstall` script. That script runs with
the developer's full permissions the moment anyone installs, whether or not
the application ever imports the package. `event-stream`, `ua-parser-js`,
`coa`, `rc` and `node-ipc` were all delivered that way.

Before switching it on, the tree was checked: exactly one package declares an
install script, and it is a development-only native resolver used by ESLint. A
clean `npm ci --ignore-scripts` followed by typecheck, lint and a production
build all passed, so nothing in this project needs those scripts to run.

**Every dependency is pinned to an exact version.** Twelve of sixteen were
declared as ranges, four of them as wide as "any 4.x". A range means a future
install can pull a version nobody has reviewed — which is exactly how a
compromised release reaches you even when your own code has not changed.
`save-exact=true` keeps new additions pinned too.

**The runtime is pinned as well**, through `engines` and `.nvmrc`. A Node
major changing underneath the application is the same class of problem.

**Installs come from the lockfile.** `npm ci` fails if `package.json` and the
lockfile disagree, rather than quietly resolving something new and rewriting
the lockfile the way `npm install` does. Every package in the lockfile carries
a SHA-512 integrity hash, so a tampered tarball fails to install even if a
registry or mirror were compromised.

## Staying that way

```
npm run audit:deps
```

39 checks: known vulnerabilities, that nothing has drifted back to a floating
range, that the lockfile still matches what is declared, that every package
still has an integrity hash, and — the one worth having — **that no new
package has appeared that runs code at install time.** New install scripts are
compared against a reviewed allowlist in `tests/dependencies.mjs`, each entry
carrying the reason it is permitted, so a new one is a failure that gets
looked at deliberately.

`.github/workflows/checks.yml` runs all of that on every push **and every
Monday morning**. The weekly run is the important half: a vulnerability is
usually disclosed long after the code was written, so a check that only runs
when somebody changes something will never find it.

## Known: ESLint is on an unsupported major

`eslint@9.39.5` is pinned, and npm reports that 9.x is no longer supported —
ESLint 10 is current. Unsupported means no security patches, so the upgrade
was attempted.

**It does not work yet.** ESLint 10 removed `context.getFilename()`, and the
copy of `eslint-plugin-react` bundled inside `eslint-config-next@16.3.5` still
calls it, so every file fails to lint with
`contextOrFilename.getFilename is not a function`. The peer range says
`eslint >=9.0.0`, but the bundled plugin has not caught up. Reverted to 9.39.5,
which lints cleanly.

**How much this matters:** less than it sounds. ESLint is a development
dependency. It is not part of the deployed application, does not run in
production, and never touches customer data. The exposure is a developer
machine and CI, not the live site.

**When to revisit:** after `eslint-config-next` ships a release whose bundled
`eslint-plugin-react` supports ESLint 10. Retry then with
`npm install --save-dev eslint@latest`, run `npx eslint src --ext .ts,.tsx`,
and revert if it errors. If the lockfile churns during the attempt, restore it
with `git checkout -- package-lock.json package.json` and reinstall with
`npm ci` rather than committing unreviewed drift — the experiment above moved
19 transitive packages and dropped three ESLint plugins.

## What this does not solve

Stated plainly, because supply-chain security has no finish line:

- **A compromised package the application actually calls** can still do harm.
  Blocking install scripts closes the easiest door, not every door. The real
  mitigation is the small dependency count — eight direct, all well-known.
- **Pinning delays security updates.** A pinned version does not update itself,
  so the weekly audit is what makes pinning safe rather than dangerous. When it
  reports something, update deliberately and run the suites.
- **Transitive dependencies still move** when a direct dependency is updated.
  Review what the lockfile diff actually changes, not just the package you
  meant to update.
- **No runtime sandboxing.** Node gives a dependency the same filesystem and
  network access as the application. Node's permission model could restrict
  that further; it is not used here.

---

# First review — findings

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | Public endpoints had no rate limiting. `/api/chat` costs money per call once a model is connected, so anyone with the URL could run up the bill. | **High** (cost/abuse) | **Fixed** |
| 2 | `/api/availability` trusted `Number()` on a query parameter and could pass `NaN` into the diary logic. | Low | **Fixed** |
| 3 | Rate limiter state is per-instance in memory, so on serverless an attacker spread across instances gets a higher ceiling. | Low, accepted | Documented below |
| 4 | Single shared owner password, no per-user accounts or audit of who signed in. | Medium, accepted at this scale | Documented below |

### Verified clean

- **No secrets in git.** No `.env` file is tracked; `.env.local` is ignored.
- **No server module reaches the browser.** No client component imports the
  database, auth, AI, email or integration layers.
- **Every admin mutation checks the session.** All 19 server actions call
  `assertAdmin()` before doing anything (login and logout excepted by design).
- **All public write endpoints validate input** with zod schemas.
- **Prompt injection is refused** — tested, scenario 14.
- **Another customer's data is not disclosed** — tested, scenario 15.

## Rate limiting

Fixed-window counters, per client IP (`x-forwarded-for`).

| Endpoint | Limit |
| --- | --- |
| `/api/chat` | 20 per minute |
| `/api/quote` | 30 per minute |
| `/api/leads` | 10 per minute |
| `/api/bookings` | 10 per minute |
| `/api/availability` | 60 per minute |

Verified by hammering the endpoint: 20 allowed, 6 returned `429` with a
correct `Retry-After` header.

**Known limitation (finding 3).** The counter lives in memory, so each
serverless instance keeps its own. This stops casual abuse and accidental
loops — the realistic threat at this scale — but a determined attacker spread
across instances gets a higher effective ceiling.

**Production upgrade:** move the counter to Vercel KV or Upstash Redis (both
have free tiers). The interface in `src/lib/security/rateLimit.ts` is designed
for it: replace the `Map` with a shared store and nothing else changes.

**Also set a spending cap in the Anthropic console.** Application-layer limits
are not a substitute for a hard billing ceiling.

## Authentication

**Public site:** no authentication, by design.

**Dashboard:** one owner password (`ADMIN_PASSWORD`) exchanged for an
HMAC-SHA256 signed, httpOnly, sameSite session cookie lasting seven days.
Password and signature comparisons use `timingSafeEqual`.

**Cron and webhook endpoints:** shared secret (`CRON_SECRET`,
`EMAIL_WEBHOOK_SECRET`) as a bearer token or query parameter.

**Accepted limitation (finding 4).** There is one shared password. There is no
record of *who* signed in, and no per-user permissions. Acceptable for a
single-owner business; **not** acceptable once staff have access.

**Upgrade path:** Supabase Auth, already in the stack and free. The session
check lives in one file (`src/lib/auth.ts`) to keep that swap small.

## The AI agent's permissions

The agent operates under least privilege by construction:

- It **cannot** issue database queries. It calls nine validated tools.
- It **cannot** state a price except through the pricing engine.
- It **cannot** state availability except through the real diary.
- It **cannot** send email directly; drafts go to the escalations inbox.
- It **cannot** act on complaints or payments at all — those are intercepted
  in code before the model is consulted.
- Every tool call is audited with a trace id, outcome and duration.

### Prompt injection

Two layers. Deterministic screening runs before any model call, so an injected
instruction cannot bypass the complaint and payment rules — those never reach
the model. The system prompt then instructs the agent to refuse instruction
overrides. Tested in scenario 14.

**Residual risk:** a sufficiently clever injection could influence the model's
*wording*. It cannot influence what the model can *do*, because actions are
tool-gated and the damaging categories never reach it.

## Data protection

- Service-role database key is server-side only, never in a client bundle.
- Row Level Security is enabled on every table with **no policies**, so the
  anonymous and authenticated keys can do nothing; only the server's
  service-role key has access.
- Audit summaries are redacted: email addresses and phone numbers are stripped
  before an agent action is recorded.
- The dashboard is `noindex`.
- Customer records can be erased individually or by retention sweep.

See `PRIVACY.md`.

## Before going live

1. **Set `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`.** Without them the
   development password `merry-admin` applies.
2. **Set `CRON_SECRET`** so the scheduled endpoints are not open.
3. **Set a spending cap** in the Anthropic console.
4. **Set `MOCK_MODE=true`** while rehearsing with real providers connected.
5. Rotate the Supabase service-role key if it has ever been pasted into a
   chat, an email or a ticket.

## Reporting

If something looks wrong — an unexpected escalation, a reply that does not
sound like the business, a record you did not expect — the audit trail in
`agent_actions` shows what the agent did and when. Every row carries a trace
id linking the actions taken within one conversation.
