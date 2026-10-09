# Merry Cleaners — Lead Source & Data Cost Report

**Compiled 19 September 2026.** Covers where prospect data comes from, what
each source is permitted to be used for, and what it costs.

> **No paid data source has been activated, trialled or signed up for.**
> No credit has been purchased and no payment details have been entered
> anywhere in this feature. Every source the system currently uses costs
> £0 and will continue to cost £0 at the volumes described here.

---

## 1. What the system uses today

| Source | What it provides | Cost | Key needed | Licence / terms | Reliability |
| --- | --- | --- | --- | --- | --- |
| **OpenStreetMap** (Overpass API) | Business names, addresses, postcodes, websites, published phone numbers, business category | **£0** | No | ODbL 1.0 — free to use, attribution required | Medium |
| **Companies House** public data API | Registered company name, number, registered office, SIC codes, trading status | **£0** | Yes — free key | Open Government Licence 3.0 | Very high |
| **A company's own website** | Confirms the organisation exists and trades; general business email, phone, contact form | **£0** | No | Public page, fetched subject to its `robots.txt` | High |
| **CSV you import yourself** | Anything you already hold or are entitled to export | **£0** | No | Whatever governs the list you supply | Medium |

**Total data cost: £0/month.** There is no per-record, per-lookup or
per-enrichment charge anywhere in this feature.

### Why these four and nothing else

Each was checked against its own published terms before any code was written:

- **OpenStreetMap** explicitly invites automated queries through Overpass,
  asks for a real User-Agent identifying the caller, and rate-limits by
  address. The adapter supplies the User-Agent, waits 2.5 seconds between
  queries, and **stops the run** on a 429 or 504 rather than retrying.
  Attribution: contains information from OpenStreetMap, available under the
  Open Database Licence.
- **Companies House** publishes a free API for exactly this purpose. It is the
  only source here that can confirm a company legally exists and is still
  trading, which is why it outranks everything else in the record's
  provenance.
- **A company's own website** is fetched one page at a time, home page only,
  never crawled, and only for an organisation already discovered elsewhere.
  `robots.txt` is read and honoured first. A 401, 403 or 429 ends the check.
- **CSV import exists precisely because some directories forbid automated
  collection.** See below.

---

## 2. Sources deliberately NOT used, and why

| Source | Status | Reason |
| --- | --- | --- |
| **Yell.com** | Not used | Its terms prohibit automated extraction of listings. No scraper was built. |
| **Checkatrade** | Not used | Same. |
| **Google Maps / Places scraping** | Not used | Scraping the web interface breaches Google's terms. |
| **Google Places API** | Not used | Technically permitted but chargeable per request, and its terms restrict storing and re-displaying the data. Would break the £0 constraint. |
| **LinkedIn / Sales Navigator** | Not used | Terms prohibit automated collection; the data is largely personal rather than corporate. |
| **Commercial B2B data providers** (Cognism, Apollo, Lusha, ZoomInfo and similar) | Not used | All are paid. Most do not publish a price and require a sales conversation, so **no figure is quoted here rather than an invented one.** Several sell personal contact data whose lawful basis for onward marketing is the buyer's problem, not theirs. |

**None of these is reachable from any code path in this system.** There is no
disabled scraper waiting to be switched on. If you ever want data from Yell or
Checkatrade, the supported route is to export or copy what you are entitled to
and paste it into **Prospects → Import a list you already have**, which
records that the rows came from you.

---

## 3. What the data costs if volumes grow

Nothing. All four sources are free at any volume this business will reach.
What does scale is the restraint required:

| If you want | Then | Cost |
| --- | --- | --- |
| ~12 organisations checked per day (the default) | The nightly run, unchanged | £0 |
| A borough swept in one go | Use the Prospects screen and run it by hand, 15–50 at a time | £0 |
| Thousands of records per week | **Not supported, and not advisable.** It would abuse donated infrastructure and produce a backlog you cannot read | — |

The limiting factor is not money. It is that every approach needs a person to
read the record and approve it, so the useful throughput is however many
organisations you can genuinely follow up.

---

## 4. Hidden costs worth naming

- **Companies House key.** Free, but it is a registration on the Companies
  House developer portal in the business's name. Until it is added as
  `COMPANIES_HOUSE_API_KEY`, the Prospects screen states plainly that the
  source is unavailable and every record stays at medium reliability. Nothing
  breaks; verification is just weaker.
- **Vercel function time.** The nightly run takes roughly 30–90 seconds. On the
  Hobby plan this is free; on Pro it is a rounding error against the included
  allowance.
- **Supabase rows.** A prospect record is a few kilobytes. Ten thousand of them
  is a few tens of megabytes, comfortably inside the free 500 MB tier. Storage
  will not be what pushes you onto Supabase Pro.
- **Vercel cron count.** Three schedules are now defined in `vercel.json`. If
  your plan limits the number of cron jobs, move this one to cron-job.org
  (free) calling `/api/cron/prospecting?secret=…` — the same arrangement
  DECISIONS.md already describes for follow-ups.

---

## 5. Cost of the alternative

For comparison, the manual equivalent of what the nightly run does — finding
twelve London agencies, checking each is trading, and noting a contact route —
is perhaps 45–60 minutes of someone's time per day. That is the cost this
feature removes. It does **not** remove the time needed to read the records and
decide who to approach, and it is not designed to.

---

## 6. Summary

| | |
| --- | --- |
| **Data sources in use** | 4 |
| **Monthly data cost** | **£0** |
| **Annual data cost** | **£0** |
| **Paid sources activated** | **None** |
| **Free keys still to obtain** | 1 (Companies House — optional, improves verification) |
| **Change to the go-live total in COST_AND_SUBSCRIPTIONS.md** | **£0** |

This feature adds nothing to the monthly bill.
