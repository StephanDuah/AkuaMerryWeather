# Final report

Merry Cleaners AI customer-acquisition, booking and operations system.
**19 September 2026.**

---

## A. What was already present

At the start of this brief, an earlier session had produced a working Next.js
application: the public website with photography and animation, a quote and
booking flow, an admin dashboard, a chat assistant, a pricing engine,
guardrails, follow-up automation, email drafting and a Supabase database,
deployed to Vercel at merry-cleaners.vercel.app.

The **first thing done under this brief was an audit** of that project, which
found it already covered most of the twenty capabilities listed in §1 — and
identified precisely what did not exist.

## B. What was changed

| Change | Why |
| --- | --- |
| **Knowledge base moved out of code** into `src/knowledge/*.json` | §22: business rules must not be buried in application code |
| **`approved` flag on every knowledge entry** | Unapproved means escalate, not improvise |
| **Pricing approval gate, defaulting to off** | §9: the supplied pricing is incomplete, so no quotation may be fabricated |
| **12-state lead lifecycle** replacing 5 | §19, with documented criteria |
| **Agent action audit trail** + a screen to read it | §19, §20, §26 |
| **Model-agnostic provider layer** | §27: no lock-in to one AI vendor |
| **Seven more agent tools** (4 → 11) | §26 |
| **Mock mode** + in-dashboard simulator | §28 |
| **15-scenario automated test suite** | §29 |
| **Rate limiting on public endpoints** | §25, found during the security review |
| **Eleven documentation files** | §33 |
| **Cost report with researched prices** | §34–36 |

Four real bugs were found and fixed along the way, listed in §G.

## C. What the agent can actually do

Receive enquiries from chat, the website form or email. Answer questions from
the knowledge base. Explain services. Collect and classify leads. Gather quote
information. Check genuine availability. Create bookings. Record everything
against a customer. Follow up automatically, twice, then stop. Classify
inbound email and draft replies. Escalate anything it should not decide. Audit
every action it takes.

**Eleven tools**, each validated and audited: `search_knowledge`,
`get_service_information`, `get_customer`, `quote_price`, `check_availability`,
`save_lead`, `create_booking`, `send_customer_message`, `cancel_followup`,
`notify_owner`, `escalate_to_human`.

It **cannot** write arbitrary database rows, state a price outside the pricing
engine, state availability outside the diary, send email directly, or act on a
complaint or payment matter — those are intercepted in code before the model
is consulted.

## D. What is simulated or mock

Labelled honestly, never presented as working:

| Component | State |
| --- | --- |
| **Email sending** | Recorded in the lead's history instead of delivered. Resend not connected. |
| **WhatsApp** | Logged instead of sent. Meta verification not done. |
| **Card payment** | Bookings created unpaid with a reminder to invoice. Stripe not connected. |
| **Inbound email** | Endpoint live and tested; no forwarder pointed at it yet. |
| **Voice** | Not built. The interface would accept it without a rebuild. |
| **Outbound prospecting** | Deliberately not built — see §12 of `DECISIONS.md`. |

The AI itself is **not** simulated. With no key, a real scripted engine runs,
using the same pricing, diary and guardrails.

## E. What remains to connect

In order, from `PRODUCTION_MIGRATION.md`:

1. **ICO registration** — £47/year by direct debit. Legally required.
2. **Enter and approve your real prices.** Until then no price is quoted.
3. **Set your cancellation policy and payment terms.**
4. **Anthropic key** (~£7/month) — makes the assistant conversational.
5. **Resend** — makes emails actually arrive.
6. **Five-minute follow-up scheduler.**
7. **Stripe** — online payment.
8. **Vercel Pro + point merrycleaners.co.uk at it.**
9. **Supabase Pro** — around month three.
10. **WhatsApp** — Meta verification takes days.

No code changes are needed for any of these. Every integration sits behind an
environment variable.

## F. Security and privacy

**Security review performed 19 September 2026.** Findings:

- **Fixed:** public endpoints were unthrottled, so `/api/chat` could run up an
  AI bill. Rate limiting added and verified.
- **Fixed:** `/api/availability` could pass `NaN` into the diary logic.
- **Accepted, documented:** rate limiter state is per-instance in memory.
- **Accepted, documented:** one shared owner password, no per-user audit.

**Verified clean:** no secrets in git; no server module reachable from the
browser; all 19 admin actions check the session; all public write endpoints
validate input; prompt injection refused; another customer's data not
disclosed.

**Privacy:** data minimised at capture, lawful basis recorded per lead,
24-month retention with an automated sweep, one-click erasure, plain-English
notice, database in London, RLS enabled with no public policies, audit
summaries redacted of contact details.

**Outstanding for the owner:** ICO registration, and adding that number to the
privacy notice.

## G. Testing results

```
34 passed   0 failed
```

All fifteen scenarios from §29, run against the real HTTP endpoints — local,
against Supabase, and against production. Nothing mocked.

**Bugs this found:**

1. **Bookings failed entirely** when the rate card was unapproved. Now a
   booking completes without a price and is flagged for confirmation.
2. **A database constraint** still required a price. Migration written and
   applied.
3. **The audit trail recorded nothing** in the live configuration — it was
   wired only into the model path, and with no API key the scripted engine
   runs. Both engines now audited.
4. **The pricing approval control did not exist.** The flag was in code and
   the documentation told the owner to tick it; the button was never built.

Each was found by testing or by auditing my own claims, not by assumption.

## H. Production architecture

Four separated layers: **website** → **agent** → **business rules and data** →
**integrations**. Guardrails run before any model call. Tools are the only way
the agent can act. Storage has two interchangeable drivers. The vendor SDK is
imported by exactly one file.

Full diagram and rationale in `ARCHITECTURE.md`.

## I. Required subscriptions

| Service | Plan | Cost |
| --- | --- | --- |
| Vercel | Pro | $20/month (≈£16) |
| ICO registration | Tier 1 | £52/year, £47 by direct debit |
| Domain | existing | ~£10–15/year |

## J. Recommended subscriptions

| Service | Plan | Cost |
| --- | --- | --- |
| Supabase | Free → Pro | £0, then $25/month |
| Anthropic | Sonnet 5, pay as you go | ~£2–9/month |
| Resend | Free | £0 |
| Stripe | Standard | No monthly fee; 1.5% + 20p per UK card |
| WhatsApp | Cloud API | ≈£0 for service replies |

## K. Cost estimates

| Scenario | Monthly | Yearly |
| --- | --- | --- |
| **A — Minimum viable** | ≈£21 | ≈£252 |
| **B — Recommended** | ≈£48 | ≈£576 |
| **C — Expanded automation** | ≈£95+ | ≈£1,140+ |

Plus Stripe fees on money received. **No one-off costs.**

## L. Official links

- Vercel — https://vercel.com/pricing
- Supabase — https://supabase.com/pricing
- Anthropic — https://claude.com/pricing
- Resend — https://resend.com/pricing
- Stripe UK — https://stripe.com/gb/pricing
- WhatsApp Business — https://whatsappbusiness.com/products/platform-pricing/
- ICO — https://ico.org.uk/for-organisations/data-protection-fee/
- cron-job.org — https://cron-job.org
- Google Business Profile — https://business.google.com

**No paid service has been activated as part of this development.** Nothing
was subscribed to, no credit purchased, no payment details entered. Which
services to buy is the owner's decision.

## M. Exact next steps

**This week**

1. Register with the ICO (15 minutes, £47).
2. Open Dashboard → Pricing, enter your real rates, tick the approval box.
3. Decide your cancellation policy and payment terms; update
   `src/knowledge/policies.json` or ask for them to be entered.
4. Replace the placeholder testimonials with real reviews you may publish.

**Then, when ready**

5. Add an Anthropic key with a £15/month cap.
6. Connect Resend and verify the domain.
7. Set up the five-minute follow-up schedule.
8. Connect Stripe.
9. Switch Vercel to Pro and point merrycleaners.co.uk at the site — deciding
   first whether to add the four services the old site lists and this one does
   not.

---

## Honest limitations

- **The model path's wording has not been exercised**, because no API key is
  configured. The guardrails, tools, pricing and booking logic are shared by
  both engines and are tested; the model's phrasing is not. Re-run the suite
  after adding a key.
- **No visual regression testing.** Appearance checked by hand.
- **A theoretical booking race** exists if two people take the last slot in the
  same instant. Documented in `DECISIONS.md`.
- **Photography is licensed stock**, not the company's own work, and is never
  captioned as such. Real job photographs would be strictly better.
- **Load and concurrency are untested.**
