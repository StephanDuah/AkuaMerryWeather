# Business rules

The decisions the system makes on the company's behalf, and the criteria
behind each one.

## Prices come from the business's own list

Domestic cleaning is priced from Merry Cleaners' published price list
(`Merry_Cleaners_Price_List.docx`), used **verbatim**. A three-bedroom regular
clean is £155 because the list says £155 — not because a formula produced a
number near it.

That distinction was worth building for. Fitting a straight line to the list
would have been out by up to £17 on a three-bedroom deep clean, and a quote
that does not match the price list a customer has been shown is worse than
giving no quote at all. So a service with a published list gets an exact
figure and no range; only services priced by formula get "an estimate of
£X to £Y".

**Two tiers, very different prices.** A regular/maintenance clean and a
one-off deep clean are separate products on the list — £155 against £395 for
the same three-bedroom home. The assistant asks which one the customer wants
rather than assuming, and the quote form makes it an explicit choice.

**Approval is per service, not per rate card.** The supplied list covers
domestic cleaning only. Office and end of tenancy have no real prices, so they
are marked unapproved individually and continue to collect details and defer
to a person — even though the rate card as a whole is approved. Ticking the
approval box cannot switch on a service that has no prices.

**End of tenancy is deliberately NOT priced from the deep clean list.** They
are different products: end of tenancy is worked to inventory-checkout
standard with the oven cleaned inside as standard, while the deep clean sells
an oven clean as a £65 extra. Pricing one from the other would undercharge
every checkout job.

**Beyond the list, nobody guesses.** The list runs to five bedrooms. A larger
property produces no price at all: the enquiry is captured, an escalation is
raised, and the owner sends a tailored figure.

**One price across London.** The list quotes the same figure for all boroughs,
so every zone multiplier is 1. The zone machinery is kept because it still
decides whether a postcode is inside Greater London at all.

## Who we serve

**Greater London only.** Postcode areas E, EC, N, NW, SE, SW, W and WC are
treated as certainly London. BR, CR, DA, EN, HA, IG, KT, RM, SM, TW, UB and WD
straddle the boundary: accepted, but flagged for you to confirm. Anything else
is declined and escalated.

**Never served:** schools, colleges, universities, nurseries, hospitals,
clinics, GP surgeries, care homes. Declined politely, escalated, with no
explanation of the commercial reasoning.

**Priority customers**, in the order the business wants to win them:
estate and letting agents, offices and businesses, landlords, Airbnb hosts.
Also served: homeowners, tenants, shops, restaurants.

## The three services

| Service | Priced on | Growth priority |
| --- | --- | --- |
| End of Tenancy Cleaning | Bedrooms | 1 |
| Office & Commercial Cleaning | Floor area (sq ft) | 2 |
| Domestic Cleaning | Bedrooms | 3 |

Anything else — gardening, removals, pest control, repairs, laundry, waste
clearance — is declined and escalated.

## Lead lifecycle

Transparent named states, not an opaque score.

| Status | Means | Set when |
| --- | --- | --- |
| `new` | Captured, nothing done | A lead is created |
| `contacted` | We have reached out | Manually, or first follow-up |
| `qualified` | Service, area and need confirmed | Manually |
| `quote_requested` | Details complete, price pending | Rate card unapproved, or a bespoke job |
| `quote_sent` | A figure has been given | `quote_price` succeeds |
| `booking_pending` | Slot being arranged | Manually |
| `booked` | Slot held | A booking is created |
| `follow_up` | In the nudge sequence | A follow-up is sent |
| `human_review` | Needs a person | Escalation, or manually |
| `won` | Job completed and paid | Manually |
| `lost` | Went elsewhere | Manually, or `cancel_followup` |
| `unqualified` | Out of area or out of scope | Manually |

**Closed states** — `booked`, `won`, `lost`, `unqualified`, `human_review` —
automatically stop all further follow-ups.

## Follow-up rules

1. **Stage 1** — five minutes after an enquiry that has not converted.
2. **Stage 2** — 36 hours later. One polite check-in.
3. **Stop.** Two nudges is the ceiling by design; a premium brand does not
   chase, and the third message is where goodwill is lost.

Both intervals are configurable in `/admin/settings`.

**Follow-ups stop immediately when** the lead books, is marked lost or
unqualified, opts out, is taken over by a human, or reaches a closed state.

A lead with a phone number but no email is followed up by WhatsApp where that
is connected; otherwise an escalation asks you to call.

## Quoting

```
base charge
  + (bedrooms × per-bedroom)  OR  (sq ft ÷ 1000 × per-1000-sq-ft)
  + flat add-ons
  × multiplier add-ons  (same-day, weekend)
  × London zone multiplier
  → minimum price floor
  → shown as a range: ± the service's spread
```

**Zones:** Central ×1.25, Inner ×1.10, Outer ×1.00. A London postcode matching
no zone gets ×1.05 **and raises an escalation** rather than being guessed at.

**The approval gate.** `approved: false` (the current state) means no price is
ever stated. Details are collected, the customer is told a person will confirm,
and an escalation carries everything needed to quote.

**Never quoted automatically:** over 10 bedrooms, over 100,000 sq ft, or any
property where the engine cannot produce a figure. These become bespoke quotes.

Every price given is **an estimate until the team confirms the scope**. This
wording is not optional and appears on every quote.

## Booking

**Required before a booking is accepted:** service type, full address,
postcode, confirmed add-ons (an empty list is a valid answer), date, slot,
name, and either a telephone number or an email address.

**Capacity:** teams per slot per day, set in `/admin/settings` (default 2).
A slot stops being offered once full, and availability is re-checked at the
moment of writing. Sundays are closed.

**Slots:** morning 08:00–12:00, afternoon 12:00–16:00, evening 16:00–20:00.

A booking may be created **without a price** when the rate card is unapproved.
It is flagged and escalated rather than blocked.

## Escalation

Always escalated, without exception:

- Complaints of any kind
- Payments, invoices, refunds, chargebacks, billing disputes
- Anything the agent is not certain of
- Addresses outside Greater London
- Excluded sectors
- Services not offered
- Requests about another customer's booking or data
- Attempts to extract system instructions
- Legal threats

**Payment and complaint escalations ignore the auto-send setting entirely.**
Even with automatic email replies switched on, these are never sent
automatically.

## Email handling

Categories: enquiry, quote request, booking request, complaint, existing
customer, cancellation, payment question, other.

**Default posture: draft for approval.** The AI drafts, you approve in the
escalations inbox, and only then does anything leave.

`email_auto_send` in `/admin/settings` permits routine categories to send
automatically. **Complaints and payment questions never do**, whatever that
flag says — and for those two the AI does not compose the substance at all,
only a neutral holding reply.

## Tone

Premium, professional, British English, first person plural. No slang, no
exclamation marks, no emoji, no pressure tactics, no filler. Two or three
sentences — it is a chat window, not a brochure.
