# Merry Cleaners — Go-Live Cost & Subscription Report

**Prices checked 19 September 2026, from each provider's official pricing page.**
SaaS pricing changes; re-check on the day you sign up. Every figure below links
to its source.

> **No paid service has been activated as part of this development.**
> Nothing has been subscribed to, no credit purchased, no payment details
> entered. Everything built so far runs at £0. Which of the services below to
> buy is your decision, to be made after reading this.

Sterling figures are converted at roughly **$1.27 = £1** and rounded. The
dollar amounts are the ones the provider will actually charge.

**Prospecting adds £0 to everything below.** Its data sources are free and it
sends nothing automatically — see `LEAD_SOURCE_AND_DATA_COSTS.md` and
`OUTREACH_COSTS.md` for the two detailed reports.

---

## 1. REQUIRED — the system cannot run in production without these

### 1.1 Vercel — web hosting

| | |
| --- | --- |
| **Purpose** | Hosts the website, the API and the AI agent. Already deployed here. |
| **Recommended plan** | **Pro — $20/month** |
| **Free option** | Hobby, $0 — **but see below** |
| **Billing** | Monthly, per team |
| **Included** | 1 TB data transfer, 10M edge requests, 1M function invocations, cron jobs, 1 seat |
| **Overages** | $0.15/GB transfer, $2 per 1M edge requests, $0.60 per 1M invocations |
| **Setup fee** | None |
| **Low usage** | $20/month |
| **Moderate usage** | $20/month — a cleaning company's traffic will not approach the included limits |
| **Official** | https://vercel.com/pricing |

**Why Pro, not free.** Vercel's own pricing page states the Hobby plan is
"designed for personal, non-commercial use". A trading business website is
commercial use. Hobby has been correct for building and testing; from the day
merrycleaners.co.uk points at it and real enquiries arrive, Pro is the
compliant plan. **This single line is most of your monthly cost.**

*Cheaper alternative:* Netlify, Cloudflare Pages and Railway have comparable
free/low tiers, but each would need redeployment work and none is meaningfully
cheaper at Pro level. Not recommended purely to save a few pounds.

### 1.2 ICO data protection fee — legal requirement

| | |
| --- | --- |
| **Purpose** | Mandatory UK registration for any organisation processing personal data |
| **Your tier** | **Tier 1 (micro)** — up to 10 staff or £632,000 turnover |
| **Price** | **£52/year**, or **£47/year by direct debit** |
| **Other tiers** | Tier 2 £78 (up to 250 staff / £36M), Tier 3 £3,763 |
| **Billing** | Annual |
| **Required?** | **Yes. Not optional.** Failure to pay carries a fixed penalty. |
| **Official** | https://ico.org.uk/for-organisations/data-protection-fee/ |

Monthly equivalent: about **£4**.

### 1.3 Domain — merrycleaners.co.uk

Already owned. Typical `.co.uk` renewal is £10–15/year depending on registrar;
check yours. Monthly equivalent: about **£1**.

---

## 2. STRONGLY RECOMMENDED — the system works without these, but poorly

### 2.1 Supabase — database

| | |
| --- | --- |
| **Purpose** | Stores every lead, booking, message, escalation and AI audit record |
| **Recommended plan** | **Free to begin, Pro ($25/month) within a few months** |
| **Free tier** | 500 MB database, 5 GB egress, **no backups**, **project pauses after 1 week of inactivity** |
| **Pro tier** | 8 GB database, 250 GB egress, 7-day backups, never pauses |
| **Overages (Pro)** | $0.125/GB database, $0.09/GB egress |
| **Setup fee** | None |
| **Low usage** | $0 |
| **Moderate usage** | $25/month |
| **Official** | https://supabase.com/pricing |

**When to upgrade.** Two things justify the $25: **daily backups**, and the
guarantee the project never pauses. 500 MB is several years of enquiries at
your volume, so size is not the trigger — *losing the data would be* . Move to
Pro once you are taking bookings you could not bear to lose. Realistically
month three or four.

**Important:** the free tier pauses a project after a week with no activity.
A live site receives activity, so this is unlikely to bite — but it is a real
risk if the site goes quiet over a holiday period.

### 2.2 Anthropic (Claude API) — the AI agent

| | |
| --- | --- |
| **Purpose** | Powers the conversational agent, email classification and reply drafting |
| **Plan** | Pay as you go. **There is no free tier.** |
| **Price — Opus 5** | $5 per million input tokens / $25 per million output |
| **Price — Sonnet 5** | $2 in / $10 out |
| **Price — Haiku 4.5** | $1 in / $5 out |
| **Prompt caching** | Cached reads cost ~90% less (Opus $0.50/M, Sonnet $0.20/M, Haiku $0.10/M). **This system already uses caching.** |
| **Setup fee** | None |
| **Official** | https://claude.com/pricing |

**Estimated cost per customer conversation** (roughly six exchanges, with the
system prompt cached after the first turn):

| Model | Per conversation | 100/month | 400/month |
| --- | --- | --- | --- |
| Opus 5 | ~$0.07 (≈6p) | ~$7 (≈£6) | ~$29 (≈£23) |
| **Sonnet 5** | ~$0.03 (≈2p) | ~$3 (≈£2) | ~$12 (≈£9) |
| Haiku 4.5 | ~$0.015 (≈1p) | ~$1.50 (≈£1) | ~$6 (≈£5) |

**Recommendation: Sonnet 5.** The agent's job is narrow and heavily
constrained by tools and guardrails — it is not doing open-ended reasoning.
Sonnet handles it comfortably at roughly 40% of Opus cost. Switch with one
environment variable (`ANTHROPIC_MODEL`); no code change.

**Set a spending limit in the Anthropic console.** £15/month is a sensible
ceiling to start.

**The genuinely free option:** leave the API key unset. The system then runs
its scripted engine, which still qualifies leads, collects quote details,
checks availability, books, escalates and follows up — it simply follows a
fixed path instead of conversing naturally. **This is what is running today,
and it costs nothing.**

### 2.3 Resend — sending email

| | |
| --- | --- |
| **Purpose** | Sends quotes, follow-ups and booking confirmations from your own domain |
| **Recommended plan** | **Free — $0/month** |
| **Free tier** | 3,000 emails/month, **100/day**, 3 domains |
| **Next tier** | Pro $20/month for 50,000 emails, no daily limit |
| **Setup fee** | None |
| **Low & moderate usage** | **$0** |
| **Official** | https://resend.com/pricing |

The free tier is genuinely sufficient. At two follow-ups per lead plus
confirmations, 3,000 emails covers several hundred enquiries a month. You
would need roughly 1,000 enquiries monthly before Pro is needed.

---

## 3. WHEN YOU START TAKING PAYMENT AND MESSAGES

### 3.1 Stripe — card payments

| | |
| --- | --- |
| **Purpose** | Takes card payment online; sends the customer a payment link on booking |
| **Plan** | Standard |
| **UK domestic cards** | **1.5% + 20p** |
| **UK premium cards** | 2.8% + 20p |
| **European (EEA) cards** | 2.5% + 20p (+2% if currency conversion) |
| **International cards** | 3.15% + 20p (+2% if currency conversion) |
| **Monthly fee** | **None.** Stripe states it charges no setup, monthly or hidden fees. |
| **Official** | https://stripe.com/gb/pricing |

**In plain terms:** a £300 end of tenancy clean costs **£4.70** in fees. You
pay only when you are paid. There is no reason to delay signing up beyond the
time it takes.

### 3.2 WhatsApp Business Platform (Meta Cloud API)

| | |
| --- | --- |
| **Purpose** | Messaging leads who leave a phone number but no email |
| **Free** | **Service messages are free** when the customer messages first, as are utility replies sent in response to a customer |
| **Charged** | Per *delivered* message for business-initiated marketing, utility and authentication templates. Rates vary by country and category. |
| **UK rate** | Not published on the public pricing page; shown in Meta's rate calculator after signup |
| **Setup fee** | None, but Business Verification is required |
| **Official** | https://whatsappbusiness.com/products/platform-pricing/ |

**Cost to you: effectively £0.** Everything this system does is a *reply* to a
customer who contacted you — which Meta does not charge for. It never sends
unprompted marketing templates. The real cost here is **time**: Meta's business
verification takes several days.

---

## 4. OPTIONAL

| Service | Purpose | Price | Official |
| --- | --- | --- | --- |
| **cron-job.org** | Triggers 5-minute follow-ups | **Free** | https://cron-job.org |
| **GitHub** | Code storage, auto-deploy | **Free** | https://github.com |
| **Google Business Profile** | Maps/local search listing | **Free** | https://business.google.com |
| **Cloudflare** | Inbound email routing into the agent | **Free** | https://cloudflare.com |
| **Google Workspace** | Professional mailbox (check current UK price at signup) | Per user/month | https://workspace.google.com |
| **Google Ads** | Paid acquisition — spend you control, not a subscription | Suggest £10–15/day to test | https://ads.google.com |

**Note on cron-job.org:** if you take Vercel Pro, its included cron jobs can do
this work and you can skip the separate account.

## 5. FUTURE — not needed now

| Capability | Likely provider | Indicative cost | Notes |
| --- | --- | --- | --- |
| Voice AI answering | Twilio / Vapi / Retell | Per-minute, typically $0.05–0.15/min | Architecture supports adding a voice channel without a rebuild |
| Outbound prospecting | Apollo, Lusha or similar | £40+/month | **Must be compliant** — see DECISIONS.md §12 on why no scraping was built |
| SMS fallback | Twilio | ~4p per UK SMS | WhatsApp covers this more cheaply |
| Error monitoring | Sentry | Free tier, then $26/month | Worth adding once live |

---

## 6. THE THREE SCENARIOS

### A. Minimum viable production — £25/month

The cheapest configuration that can legally and reliably run the agent.

| Item | Monthly |
| --- | --- |
| Vercel Pro | $20 (≈£16) |
| Supabase Free | £0 |
| **AI: scripted engine, no API key** | **£0** |
| Resend Free | £0 |
| ICO fee (annualised) | ≈£4 |
| Domain (annualised) | ≈£1 |
| **Total** | **≈£21/month · ≈£252/year** |

Plus Stripe fees on payments taken. The agent qualifies, quotes, books,
follows up and escalates — it simply is not conversational.

### B. Recommended production — £50/month

The configuration I would actually run for a small, growing London cleaning
company.

| Item | Monthly |
| --- | --- |
| Vercel Pro | $20 (≈£16) |
| Supabase Pro | $25 (≈£20) |
| Claude API (Sonnet 5, ~300 conversations) | ≈£7 |
| Resend Free | £0 |
| ICO fee (annualised) | ≈£4 |
| Domain (annualised) | ≈£1 |
| **Total** | **≈£48/month · ≈£576/year** |

Plus Stripe at 1.5% + 20p per payment. On £5,000/month of card payments that
is about £80.

### C. Expanded automation — £95/month

Adds WhatsApp, a professional mailbox, monitoring and heavier AI use.

| Item | Monthly |
| --- | --- |
| Everything in B | ≈£48 |
| Claude API at higher volume (~800 conversations) | ≈£18 |
| WhatsApp Cloud API (service replies) | ≈£0 |
| Google Workspace (1 user) | ≈£6 (verify current price) |
| Sentry error monitoring | ≈£20 |
| Resend Pro (if volume demands) | ≈£16 |
| **Total** | **≈£95–110/month · ≈£1,140–1,320/year** |

Marketing spend (Google Ads) sits on top of all three and is entirely your
choice.

---

## 7. ONE-OFF COSTS

There are none. No setup fees on any service listed. The build itself is
complete and committed to your GitHub repository.

## 8. WHAT VARIES WITH USAGE — stated plainly

- **Claude API** — the only per-conversation cost. Scales with enquiry volume.
  Capped by the spending limit you set.
- **Stripe** — 1.5% + 20p, only on money you actually receive.
- **Vercel / Supabase overages** — realistically unreachable at your volumes;
  the limits are generous.
- **WhatsApp** — £0 for the replies this system sends.

## 9. THE HONEST RECOMMENDATION

Start with **Scenario A (£21/month)**. It is compliant, durable and
functional. Then add, in this order:

1. **Anthropic key** (~£7/month) — the biggest single improvement to customer
   experience for the least money.
2. **Supabase Pro** (£20/month) — once losing the data would genuinely hurt.
3. **WhatsApp** (£0) — worth the verification time.
4. Everything else only when a real need appears.

For context: an agency-built website, plus a booking system, plus a CRM would
be a four-figure build and well over £100/month in subscriptions.
