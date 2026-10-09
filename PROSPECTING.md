# Merry Cleaners — Lead Intelligence & Prospecting

How the system finds London organisations that could become customers, what it
is allowed to do, and what it refuses to do.

**Read this first: a prospect is not a lead.** A prospect is an organisation we
found in a public record and think might one day need cleaning. It has not
contacted Merry Cleaners and has not asked for anything. A lead is somebody who
has actually been in touch. The two are counted separately everywhere in this
system, and a prospect can only become a lead through one deliberate action
taken by a person. Conflating them would tell the owner the business is doing
better than it is.

---

## 1. Where the data comes from

Four sources, all free, each checked against its own published terms before any
code was written.

| Source | Provides | Key needed | Reliability |
| --- | --- | --- | --- |
| **OpenStreetMap** (Overpass API) | Name, address, postcode, website, published phone, category | No | Medium |
| **Companies House** | Registered name, company number, registered office, SIC codes, trading status | Free key | Very high |
| **The company's own website** | Confirms it exists and trades; general business email, phone, contact form | No | High |
| **A CSV you import** | Whatever you already hold | No | Medium |

Cost: **£0**. See `LEAD_SOURCE_AND_DATA_COSTS.md` for the full report.

### What it will not do

- **No scraping of Yell, Checkatrade or Google.** Their terms prohibit
  automated extraction. No scraper for them exists in the codebase — not
  disabled, not commented out, not waiting behind a flag.
- **Never bypasses a restriction.** `robots.txt` is fetched and honoured before
  any page request. A 401, 403 or 429 ends the check with the reason recorded:
  *"access not permitted, not attempting to bypass"*. No CAPTCHA solving, no
  login, no paywall, no user-agent games.
- **Never hammers a source.** 2.5 seconds between OpenStreetMap queries, 1.5
  between websites, one page per domain, home page only, never a crawl. A 429
  or 504 from Overpass **stops the run** rather than triggering a retry.

---

## 2. Provenance: every field answers for itself

Each record carries a list of evidence. One line per field, with the value, the
source, the exact URL, the date collected, and how much that source can be
trusted. The Prospects screen shows this as a table — *Where every detail came
from*.

This exists because the owner is going to contact these organisations on the
strength of what is on the record. A phone number with no provenance is a phone
number nobody can check.

Reliability ranks sources: Companies House (very high) → the company's own
website (high) → OpenStreetMap and imported CSV (medium). A medium-reliability
source alone cannot produce a high-priority prospect; verification is what
promotes a record.

### Conflicts are surfaced, not resolved

When two sources disagree — two different phone numbers for the same agency —
the record keeps the first value and **flags the disagreement**. It does not
silently pick a winner. You will see these on the record as *"Conflicting data
— Telephone: … vs …"*.

---

## 3. What the system will not record

- **A named individual's email address.** `sarah.jones@agency.co.uk` is a
  person's personal data under UK GDPR. If that is the only address published,
  the record stores **no email** and carries a flag saying one exists and that
  you should use the general business route or look at the site yourself. This
  applies to every source, including a CSV you import yourself.
- **Our own contact details.** Some websites echo the visiting program's
  identification back into the page they return. One real agency's page did
  exactly that, and an earlier version of the extractor read Merry Cleaners'
  own address back out and stored it as the agency's. The identifying header no
  longer contains an email address, our own identifiers are stripped from every
  page before it is read, and any address at our own domains is refused.
- **Anything about their business we have not read.** No inferred headcount, no
  guessed portfolio size, no assumption that they are unhappy with a current
  supplier. The record holds what a source published and nothing else.

---

## 4. How priority is decided

Seven named factors, each with a weight, a yes/no, and a sentence explaining
why it matters. The record shows all seven and the total. There is no AI score
anywhere in this, and no hidden model output — the brief was explicit that an
opaque score must not be the basis for prioritisation, and it is not.

The factors cover: the kind of organisation it is; whether it is inside Greater
London; whether it was verified; whether a published business contact route
exists; whether a service on the rate card plausibly suits it; whether the
register confirms it is trading; and whether anything is flagged.

**Service fit is phrased as potential, always.** The record says these services
*could* suit an organisation of this kind. It never says they need cleaning,
because nobody has told us that.

### Excluded sectors

Schools, colleges, universities, nurseries, hospitals, clinics, GP surgeries
and care homes are classified as **not relevant**, marked **not suitable**, and
no service is ever proposed for them. They are recorded rather than deleted so
that if the same organisation is discovered again you can see it was excluded
deliberately.

---

## 5. Deduplication

Checked in order of how strong the evidence is:

1. Companies House number — conclusive
2. Website domain
3. Name plus postcode
4. Phone number

A match merges into the existing record, adds the new source to its list, adds
a line of evidence for anything it filled in, and flags anything that
disagrees. The run summary reports merges separately from new records, so the
numbers cannot be inflated by re-discovering the same agency.

---

## 6. Do not contact

A permanent suppression list, at **Prospects → Do not contact**. Checked before
a prospect record is even created, so a suppressed organisation cannot re-enter
the pipeline by being found through a different source.

Suppress by website domain, email, phone, company name or Companies House
number. A domain is the most durable choice; a company name is the weakest and
may catch similarly named businesses.

Records already on file that match are **marked** do-not-contact rather than
deleted, so a future discovery shows why it was excluded. Removing an entry
lifts the block on future searches and nothing else — it does not restore
anything to the pipeline.

Under UK GDPR an objection has to be honoured without delay. Use this the
moment somebody asks, however they ask.

---

## 7. Outreach: drafted here, sent by you

For a record that qualifies, the dashboard prepares a draft. **Nothing in this
system sends it.** There is no bulk send, no sequence engine, and no code path
from the nightly run to a message.

A draft is only prepared when all of the following are true. Otherwise the
screen lists what is missing instead:

- verified, and not on the do-not-contact list
- placed in a London borough
- a published business contact route exists
- a service on the rate card plausibly suits the organisation
- not already a lead

Every sentence is assembled from a fact on the record or an approved claim in
the knowledge base, by ordinary code. **No language model writes outreach**,
deliberately: a model given a company name will invent a reason to contact them
— a recent refurbishment, a growing portfolio, a problem with their cleaner —
and none of it would be true.

The draft says plainly that we do not know what arrangements they already have,
offers an opt-out in the first message, and quotes no price unless the rate card
in **Pricing** has been approved. Under it, the screen lists every fact used and
where each came from, so you can check the whole thing before sending.

`OUTREACH_COSTS.md` covers what sending actually costs (£0 at these volumes) and
why automating it is not recommended.

---

## 8. The nightly run

One campaign, one borough, up to 12 organisations, once a day at 06:00
(`/api/cron/prospecting`, scheduled in `vercel.json`).

Which slice runs is derived from the date rather than a stored cursor: the
borough advances daily, and the campaign advances when the borough list wraps.
That makes it stateless — a missed night, a redeploy, or two instances firing at
once cannot corrupt a position. A full pass over London takes about a month,
roughly how often these public records change.

It is small on purpose. Overpass is donated infrastructure, and more
importantly every approach needs a person to read the record and approve it, so
producing hundreds a night would only build a backlog that makes the whole list
feel worthless.

**The schedule contacts nobody.** It discovers and verifies. The endpoint's own
response says so on every run.

---

## 9. Becoming a lead

The only route: open the record, use **They got in touch**, and confirm that the
organisation actually replied. That action creates the lead record, links the
two together through `prospects.lead_id`, and marks the prospect `responded`.

Two things are enforced in code rather than trusted to the interface:

- The status dropdown **cannot** set a lead status. Changing a dropdown does not
  make somebody a lead.
- Automated follow-ups are **paused** on the new lead. We approached them first,
  so chasing them is the owner's decision, not a timer's.

The link between the records is what lets the report state honestly how many
leads prospecting has actually produced.

---

## 10. What is actually working

The Prospects screen reports response by audience, from what you have recorded.
Approaches and replies are counted separately, and **a response rate only
appears once an audience reaches ten approaches** — a percentage calculated from
three would be worse than no number at all. Until then it says so.

---

## 11. Test data

Synthetic records are marked `is_test` and are excluded from every count, every
search and every report. They appear only under the **test data** filter, where
each one is labelled **TEST DATA — NOT A REAL PROSPECT** and the record page
carries the same warning. **Remove all test records** deletes them.

They are never mixed with real prospects.

---

## 12. Testing

```
npm run dev              # one terminal
npm run test:prospecting # another
```

44 assertions across 11 scenarios, run against the live API: source
availability, CSV import, deduplication, provenance, excluded sectors,
suppression, live OpenStreetMap discovery, the prospect/lead separation, the
refusal to store a person's email address, field-level provenance coverage, and
the refusal to draft an approach for an unverified prospect.

Scenario 7 treats a rate limit as a **pass**: if OpenStreetMap asks us to slow
down and the adapter stops, that is the required behaviour. What would fail is
retrying through it.

Test records are removed at the end of every run.

---

## 13. Files

| File | What it does |
| --- | --- |
| `src/lib/prospecting/types.ts` | The record shape, source reliability, and the prospect/lead boundary |
| `src/lib/prospecting/boroughs.ts` | 33 boroughs, OSM names, postcode prefixes |
| `src/lib/prospecting/sources/overpass.ts` | OpenStreetMap discovery, with throttling and back-off |
| `src/lib/prospecting/sources/companiesHouse.ts` | Register lookup and verification |
| `src/lib/prospecting/sources/website.ts` | `robots.txt`, one-page fetch, contact extraction |
| `src/lib/prospecting/sources/csv.ts` | Import of lists you supply |
| `src/lib/prospecting/qualify.ts` | Classification, service fit, the seven priority factors |
| `src/lib/prospecting/dedupe.ts` | Duplicate detection, merging, suppression checks |
| `src/lib/prospecting/pipeline.ts` | Discovery → suppress → dedupe → classify → verify → qualify → store |
| `src/lib/prospecting/outreach.ts` | Draft preparation from verified facts only |
| `src/lib/prospecting/daily.ts` | The date-derived nightly rotation |
| `src/lib/prospecting/report.ts` | Owner report, CSV export, and the outcomes feedback loop |
| `src/app/admin/prospects/` | The dashboard tab |
| `src/app/api/prospecting/[action]/route.ts` | Owner-only API |
| `src/app/api/cron/prospecting/route.ts` | The scheduled run |
| `supabase/migrations/002_prospecting.sql` | `prospects`, `suppressions`, `campaigns` |

All three tables have row-level security enabled with **no policies**, so they
are reachable only through the server's service-role key. Prospect data is
commercially sensitive and, where it touches named individuals, personal.
