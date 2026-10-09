# Production migration

Moving from the £0 prototype to a running business system, in the order that
makes sense.

The prototype was built so this is a sequence of connections, **not a
rebuild**. Every integration already has its interface; what is missing is
credentials.

## Where things stand

| Component | Prototype | Production | Work needed |
| --- | --- | --- | --- |
| Website | Live on Vercel Hobby | Vercel Pro + your domain | Plan change, DNS |
| Database | Supabase free, London | Supabase Pro | Plan change only |
| AI agent | Scripted engine, £0 | Model-driven | Add one API key |
| Email | Logged, not sent | Resend | Add key, verify domain |
| Inbound email | Endpoint ready | Cloudflare forwarding | Point a forwarder at it |
| Payments | Booking marked unpaid | Stripe | Add key |
| WhatsApp | Logged, not sent | Meta Cloud API | Verification + credentials |
| Follow-up timing | Daily cron | Every 5 minutes | Scheduler or Vercel Pro |
| Rate limiting | In-memory | Shared store | Optional, see `SECURITY.md` |
| Auth | One password | Supabase Auth | Only when staff need access |

## The sequence

### Stage 1 — Make it legal and safe (do first)

1. **ICO registration.** £52/year, or £47 by direct debit. Legally required.
2. **Set `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`** in Vercel. *(Done.)*
3. **Set `CRON_SECRET`.** *(Done.)*
4. **Enter your real prices** in `/admin/pricing` and tick approve. Until
   then the agent correctly refuses to quote — which means every enquiry
   needs you.
5. **Resolve the unapproved knowledge entries** — cancellation policy and
   payment terms. See `KNOWLEDGE_BASE.md`.

### Stage 2 — Make it conversational (about 10 minutes)

6. **Anthropic key.** console.anthropic.com, add credit, create a key, set
   `ANTHROPIC_API_KEY` in Vercel, redeploy.
   - Recommended model: **Sonnet 5** (the default). Roughly 2p per
     conversation. See `COST_AND_SUBSCRIPTIONS.md`.
   - **Set a spending cap in the console** — £15/month is sensible.
   - Re-run `npm run test:agent` afterwards: the model path is now live and
     its wording has not been exercised before.

### Stage 3 — Make it communicate (about 30 minutes)

7. **Resend.** Verify `merrycleaners.co.uk`, set `RESEND_API_KEY` and
   `EMAIL_FROM`.
   - **Set `MOCK_MODE=true` while you rehearse**, then remove it. With Resend
     connected and mock mode off, a test conversation can email a real person.
8. **Five-minute follow-ups.** cron-job.org hitting
   `/api/cron/followups?secret=YOUR_CRON_SECRET`, or take Vercel Pro.
9. **Inbound email.** Cloudflare Email Routing → `/api/email/inbound`, with
   `EMAIL_WEBHOOK_SECRET` sent as an `x-webhook-secret` header.

### Stage 4 — Take money (about 30 minutes)

10. **Stripe.** Business verification, then `STRIPE_SECRET_KEY`.
    - Until then bookings are created unpaid with an escalation reminding you
      to invoice.
    - **Test with `sk_test_` keys first.** Stripe's test mode is free.

### Stage 5 — Go live properly

11. **Vercel Pro** ($20/month). Required once this is commercial use.
12. **Point merrycleaners.co.uk at it.** See `DEPLOYMENT.md`.
    - **Decide about the four services** the old site lists and this one does
      not: post-construction, hospitality, Airbnb (currently folded into end
      of tenancy), before/after party. Either add them to
      `src/knowledge/services.json` or accept the narrower offer.
13. **Supabase Pro** ($25/month) — when losing the data would genuinely hurt.
    Realistically month three or four.

### Stage 6 — Later

14. **WhatsApp.** Meta verification takes days. Cost is effectively £0 for the
    replies this system sends.
15. **Shared-store rate limiting.** Vercel KV or Upstash, both free tiers.
16. **Supabase Auth.** Only when more than one person needs dashboard access.
17. **Error monitoring.** Sentry free tier.
18. **Voice.** Not built. The agent interface would accept a voice channel
    without architectural change.

## Things that will bite if you skip them

**Vercel Hobby is non-commercial.** Their pricing page says so. Running a
trading business on it is a terms breach.

**Supabase free pauses after a week of inactivity.** A live site generates
activity, so this is unlikely — but a quiet holiday period could trigger it.

**No spending cap on Anthropic means no ceiling.** The application rate-limits
requests, but only a console cap limits spend.

**`MOCK_MODE` off with providers connected means rehearsals reach real
people.** Set it while testing.

**Unapproved prices mean no quotes.** The agent is behaving correctly, but
every enquiry lands on you until you approve a rate card.

## What does not need changing

- No code changes to move from prototype to production. Every integration is
  behind an environment variable.
- No database migration beyond the ones already applied.
- No data loss: Supabase already holds what exists.
- The scripted engine remains as a fallback. If the AI key is removed or the
  provider fails, the system degrades to it rather than breaking.

## Rough cost at each stage

| After stage | Monthly |
| --- | --- |
| 1 | ~£4 (ICO only, still on free tiers) |
| 2 | ~£11 |
| 3 | ~£11 |
| 4 | ~£11 + Stripe fees on payments |
| 5 | ~£48 |
| 6 | ~£95+ |

Full detail, with sources, in `COST_AND_SUBSCRIPTIONS.md`.
