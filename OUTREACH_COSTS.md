# Merry Cleaners — Production Outreach Cost Report

**Compiled 19 September 2026.** Covers what it costs to actually approach the
organisations the prospecting agent finds, once you decide to start.

> **Nothing has been sent to anybody.** No outreach has been despatched during
> development, no sending service has been activated for this purpose, and the
> system has no code path that sends a prospecting approach automatically. The
> figures below describe what you would spend **if** you choose to begin.

---

## 1. The important point first

**The outreach in this system is not automated, and the cost model follows from
that.** For each organisation the dashboard prepares a draft; you read it, edit
it if you want to, and send it yourself from your own mailbox. There is no bulk
send, no sequence engine, no "enrol 500 prospects in a campaign" button.

That is a deliberate design decision, for three reasons:

1. **Legal.** An unsolicited approach to a business relies on legitimate
   interest under UK GDPR and PECR. That is defensible for a small number of
   relevant, individually considered approaches. It becomes much harder to
   defend as a volume operation.
2. **Deliverability.** Cold email sent in bulk from a young domain is the
   fastest way to damage the domain your quotes and booking confirmations go
   out on. Protecting `merrycleaners.co.uk` matters more than outreach volume.
3. **Quality.** Twelve considered approaches a week from an owner who has read
   the record will out-perform a thousand automated ones.

**Consequence: the marginal cost of outreach in this system is close to zero,
because the constraint is your time, not a per-message fee.**

---

## 2. What you would actually pay

### 2.1 Sending by email — £0

| | |
| --- | --- |
| **How** | Your own mailbox, or Resend if you later choose to send from the app |
| **Resend free tier** | 3,000 emails/month, 100/day — already documented in COST_AND_SUBSCRIPTIONS.md |
| **Cost at 20 approaches/week** | **£0** (≈87/month, well inside the free tier) |
| **Cost at 100 approaches/week** | **£0** on volume, but see the deliverability warning below |
| **When you would pay** | Resend Pro at $20/month, only past 3,000 emails or the 100/day limit |

At any volume this system is designed for, **email outreach costs nothing
beyond what you already pay for transactional email.**

### 2.2 Sending via a contact form — £0

Several records have no published email but do have a contact form. You open
the form and paste the draft. No service, no cost.

### 2.3 Telephone — your existing phone

Where only a phone number is published, the draft becomes a script for a call.
Cost is the call itself on your existing mobile contract.

### 2.4 Post — not supported

No address-based mailing is built, and letters would be a real per-item cost.
Not recommended at this stage.

---

## 3. Costs that would appear if you automated it

Listed so the decision is informed, **not as a recommendation.** None of this
is built.

| If you added | Typical cost | What it would also cost you |
| --- | --- | --- |
| A bulk cold-email tool | Paid, from roughly $30–60/month at the entry level — **prices vary and are not quoted here as fact; check on the day** | Domain reputation, and a much weaker UK GDPR position |
| A separate sending domain to protect the main one | Domain registration ≈£10/year, plus warm-up time | Weeks of careful ramp-up |
| A dedicated IP | Usually only on higher tiers | Warm-up, and no benefit at low volume |
| Bought contact lists | Paid, priced per record | Very likely unlawful to market to without consent, and it would poison the do-not-contact discipline the system is built around |

**My advice: do none of this.** The system is deliberately shaped so that you
never need to.

---

## 4. Ongoing cost of the prospecting feature itself

| Item | Monthly |
| --- | --- |
| Data sources (OpenStreetMap, Companies House, company websites, CSV) | **£0** — see LEAD_SOURCE_AND_DATA_COSTS.md |
| Nightly run (Vercel function time, ~30–90s/day) | **£0** within the hosting you already need |
| Prospect storage (Supabase rows) | **£0** within the free tier |
| Sending approaches | **£0** at the volumes described |
| AI model usage | **£0** — the drafts are assembled from stored facts by ordinary code. No model is called to write outreach, deliberately: a model given a company name invents a reason to contact them. |
| **Total added to your monthly bill** | **£0** |

This feature does not change the go-live total in
`COST_AND_SUBSCRIPTIONS.md` (≈£21/month minimum, ≈£50/month recommended).

---

## 5. Cost of getting it wrong

Worth stating plainly, because these are the only large numbers in this report:

- **ICO enforcement.** Marketing that ignores objections risks action. The
  do-not-contact list exists to make honouring an objection a single click, and
  it is checked before a prospect record is even created.
- **Domain blacklisting.** If `merrycleaners.co.uk` gets flagged as a spam
  source, your quotes and booking confirmations stop arriving. The commercial
  cost of that is far higher than any outreach tool's subscription.
- **Reputation with agents.** Estate and letting agencies talk to each other.
  One clumsy mass mailing can close a borough to you.

All three are avoided by the same thing: small volumes, individually approved.

---

## 6. Summary

| | |
| --- | --- |
| **Outreach sent during development** | **None** |
| **Automated sending built** | **None — by design** |
| **Cost per approach** | **£0** |
| **Monthly cost at 20 approaches/week** | **£0** |
| **Monthly cost at 100 approaches/week** | **£0** on fees; not recommended for other reasons |
| **Paid outreach services activated** | **None** |
| **Added to the go-live bill** | **£0** |

The real budget for outreach here is measured in your time, not in pounds:
roughly 5–10 minutes per organisation to read the record, check the draft, send
it, and mark it as contacted.
