# Decisions

Every judgement call made while building this system, and why. Written so
that a future developer — or the owner reviewing the work — can see what was
chosen deliberately and what is simply a default waiting to be revisited.

---

## 1. Stack

| Choice | Decision | Reasoning |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, TypeScript) | As briefed. One repository holds the website, the API and the dashboard, which keeps hosting free and the moving parts few. |
| Styling | Tailwind CSS v4 | Ships with the Next.js scaffold, no runtime cost, no design system to license. |
| Database | Supabase Postgres, **with a local JSON fallback** | As briefed. The fallback is an addition — see §2. |
| AI | Anthropic Claude via a server-side route | As briefed. The key is read only on the server; `/api/chat` is the only surface the browser touches. |
| Admin | A protected `/admin` route in the same app | As briefed. No second tool to host or pay for. |
| Messaging | WhatsApp Business Cloud API (Meta) | As briefed, and correct: Meta's Cloud API has a genuinely free service-conversation tier; Twilio charges per message from the first one. |
| Email | Resend | Free tier of 3,000 emails/month, 100/day. Sends from the business's own domain. Gmail API via OAuth was rejected as it needs a Google Cloud project and a consent screen the owner would have to maintain. |
| Payments | Stripe | No monthly fee, per-transaction only. |
| Hosting | Vercel Hobby + Supabase free tier | As briefed. |

**No deviations from the recommended stack.** The additions below are
extensions, not substitutions.

## 2. The local JSON data store

**Decision:** the app ships with two storage drivers. If `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are both set, it uses Supabase Postgres. If not,
it uses a JSON file at `data/store.json`.

**Why:** the brief required the whole system to be functional against stubbed
data before any API keys exist, and to run locally with one command. Stubbing
a database behind an environment variable is the only way to achieve that
without the owner having to create an account first. The two drivers
implement one interface (`src/lib/db/types.ts`), so no business logic knows
which is in use.

**Limitation:** the JSON driver writes to disk, and serverless hosts have a
read-only filesystem. On Vercel it degrades to in-memory (each request may see
a fresh copy) and logs a warning. **Supabase must be connected before the
site handles real customers.** This is item 2 in SETUP_REQUIRED.md.

## 3. Pricing model

Prices are a stored document, edited at `/admin/pricing`, never hard-coded.
The engine (`src/lib/pricing.ts`) computes:

```
base charge
  + (bedrooms × per-bedroom)  or  (sq ft ÷ 1000 × per-1000-sq-ft)
  + flat add-ons
  × multiplier add-ons (same-day, weekend)
  × London zone multiplier
  → minimum price floor applied
  → shown as a range of ± the service's "range spread"
```

**Judgement calls:**

- **Starting numbers are placeholders** derived from typical London market
  rates (end of tenancy £150 base + £55/bedroom, domestic £60 + £20/bedroom,
  office £90 + £65 per 1,000 sq ft). The owner must review these before
  launch. They are guesses about *this* business, and the only numbers in the
  system that are.
- **Three London zones** — central (×1.25), inner (×1.10), outer (×1.00) —
  because the brief said pricing varies by location. Prefix matching is
  longest-wins, so `SW1` beats `SW`.
- **A London postcode matching no zone** gets ×1.05 *and* raises an
  escalation, rather than silently guessing.
- **A range, never a single figure.** Every quote carries the wording "this
  is an estimate… confirmed by our team", which is what the brief asked for
  and what protects the business from being held to a number quoted sight
  unseen.
- **Sizes outside a sane band** (over 10 bedrooms, over 100,000 sq ft) are
  refused and escalated rather than extrapolated.

## 4. Guardrails: deterministic first, AI second

The screening in `src/lib/guardrails.ts` runs **before** any model call, on
every inbound chat message and every inbound email. Complaints, payment and
refund language, excluded sectors (schools, colleges, nurseries, hospitals,
clinics, care homes) and out-of-scope services are matched by keyword and
answered with fixed, pre-written wording.

**Why not leave it to the AI:** the brief said complaints and payment matters
must *always* reach a human. A prompt instruction is a strong preference; code
that never calls the model is a guarantee. The AI's own instructions repeat
all the same rules as a second layer.

Escalation is also the failure mode: if the model errors, refuses, or runs out
of tool rounds without an answer, the customer is told a team member will
follow up and the item lands in the escalations inbox. The system never
apologises its way into a guess.

## 5. AI model and settings

- **Model: `claude-opus-5`,** overridable with `ANTHROPIC_MODEL`. Chosen as
  the current default capable model; the override exists so the owner can move
  to a cheaper model (e.g. `claude-sonnet-5`, `claude-haiku-4-5`) if volume
  makes cost a factor.
- **Effort `low`** on chat turns. The conversation is short and well-scoped,
  so depth costs latency in a chat window without improving the answer.
- **Tool use, not free text, for every fact.** The assistant cannot state a
  price or a date except through `quote_price` and `check_availability`, which
  read the same engine and diary the website uses. This is what makes
  "never invents information" enforceable rather than aspirational.
- **The system prompt is cached** (`cache_control: ephemeral`), which cuts the
  cost of the repeated instructions across a conversation.

**Cost note:** Anthropic has no free tier. Chat is the only meaningful running
cost in the system. At `low` effort with a cached prompt, a typical enquiry
conversation costs single-digit pence. **Without an API key the site still
works** — see §6.

## 6. A scripted assistant when there is no API key

`src/lib/chat/fallback.ts` is a deterministic slot-filling flow: it reads the
transcript, extracts service, postcode, size, name and contact details, and
asks for whatever is missing. It calls the same pricing engine, the same
availability data and the same guardrails.

**Why:** the brief required every module to be functional before keys are
supplied. A chat widget that says "not configured" would not have met it. The
trade-off is conversational flexibility, not correctness.

## 7. Email: draft-for-approval by default

`email_auto_send` defaults to **false**. The AI drafts, the owner approves in
the escalations inbox, and only then does anything leave the building. This is
the cautious reading of the questionnaire's answer about AI and customer
email, as the brief set out.

**Hard rule that the flag cannot override:** complaints and payment questions
are never auto-sent. For those two categories the AI does not even compose the
substance — it produces a neutral holding reply, and the owner writes the real
one. Drafting a response to a complaint is a judgement about the business's
own conduct, and that is not the AI's to make.

**Categories:** enquiry, quote request, booking request, complaint, existing
customer, cancellation, payment question, other. Classification is keyword-based
and always runs; it does not depend on the model being available.

## 8. Follow-up cadence

Stage 1 at **5 minutes** (as briefed), stage 2 at **36 hours**, then stop.

**Why 36 hours:** it lands on the next working day for an enquiry made at
almost any hour, without arriving so soon that it reads as pestering. Two
touches is the ceiling deliberately — a premium brand does not chase, and the
third message is where goodwill is lost. Both intervals are editable in
`/admin/settings`.

Leads that book, are marked lost, or have follow-ups paused leave the sequence.
A lead with a phone number but no email is followed up by WhatsApp where that
is connected, and otherwise raises an escalation asking the owner to call.

## 9. Scheduling the follow-up sweep

**The problem:** Vercel's free Hobby plan runs cron jobs **once a day**, which
cannot deliver a five-minute follow-up.

**The decision:** `vercel.json` registers a daily sweep as a safety net, and
the recommended arrangement is a free external scheduler — cron-job.org
(genuinely free, unlimited jobs, one-minute resolution) — calling
`https://<site>/api/cron/followups?secret=<CRON_SECRET>` every five minutes.
Both paths call the same endpoint, which is idempotent: it only sends what is
due. The button in `/admin` runs it on demand.

**Paid alternative, if wanted later:** Vercel Pro at $20/month lifts cron to
minute-level resolution and removes the need for the external scheduler.

## 10. Bookings and double-booking

Capacity is *teams per slot per day* (default 2), with three slots — morning,
afternoon, evening — and Sundays closed. A slot stops being offered once live
bookings reach capacity, and `createBooking` re-checks availability at the
moment of writing.

**Why so simple:** a full rota system (individual cleaners, travel time,
skills) is a much larger build, and the business does not yet have the staff
records to drive it. This prevents the failure that actually matters — two
customers promised the same team — with one number the owner controls.

**Race condition, acknowledged:** two simultaneous bookings for the last free
slot could both pass the check. At current volumes this is vanishingly
unlikely. The fix, when volume justifies it, is a unique constraint plus a
transaction in Postgres.

## 11. Admin authentication

A single owner password (`ADMIN_PASSWORD`) exchanged for an HMAC-signed,
httpOnly session cookie lasting seven days.

**Why not Supabase Auth,** which is free and already in the stack: it needs an
account, an email flow and a user table before anyone can log in, and the
business has exactly one administrator. A password in an environment variable
is the smallest thing that is genuinely safe here.

**When to change it:** as soon as more than one person needs access, or anyone
needs different permissions. Supabase Auth is then the upgrade path, and the
session check lives in one place (`src/lib/auth.ts`) to make that swap small.

**Development default:** with no `ADMIN_PASSWORD` set, the password is
`merry-admin` and the login screen says so plainly. Item 1 in
SETUP_REQUIRED.md is to change it.

## 12. Lead generation: what was deliberately not built

**No scraping of Google, Yell or Checkatrade.** The brief flagged this, and it
is the right call:

- It breaches those platforms' terms of service, risking the listings that
  currently produce the business's work.
- Harvested contact details used for unsolicited approaches engage UK GDPR and
  PECR. For sole traders and partnerships, business contact details are still
  personal data.
- The lists produced this way convert poorly in any case.

**Built instead:** channel attribution on every lead (so paid channels can be
measured), and a copy generator for Google Ads, estate-agent outreach and
referral messages, with the prompt template printed on the page so the owner
can use it in any AI tool. The legitimate acquisition routes, in priority
order, are set out on `/admin/marketing`.

## 13. UK GDPR

Designed in, not added afterwards:

- **Minimisation.** The forms ask only for what a quote and a clean require.
  No date of birth, no payment details on our own servers.
- **Lawful basis recorded per lead.** `legitimate_interest` for an
  unconverted enquiry, `contract` once a booking exists. Marketing consent is
  a separate, optional, unticked box.
- **Retention.** 24 months from last contact by default, editable. A sweep
  (`/api/cron/retention`, weekly in `vercel.json`) erases what has expired.
- **Erasure on request.** One control on each lead's page deletes the person
  and every message, escalation and booking attached to them.
- **A plain-English privacy notice** at `/privacy`, including a paragraph on
  AI use and the fact that no significant automated decision is made about
  anyone.
- **Transparency at the point of collection.** The chat widget and the quote
  form both say what the details will be used for.

**Still the owner's to do:** register with the ICO (£52/year for most small
businesses — the one genuinely unavoidable cost), and have the privacy notice
read by someone qualified before launch.

## 14. Smaller calls

- **Brand.** Colours (`#1877BD` blue, `#F09025` orange), typefaces (Poppins,
  Quicksand) and the logo were taken from the live merrycleaners.co.uk so the
  new front end matches the existing identity.
- **Three services only.** The live site lists seven (post-construction,
  hospitality, Airbnb, parties). The brief named three, so the site, the
  assistant and the pricing engine offer three. Airbnb hosts are addressed as
  an audience for end of tenancy work rather than as a separate service.
- **Testimonials are unattributed and role-based.** No named client is quoted
  because no signed-off quotations were supplied. They should be replaced with
  real, permitted ones before launch — they are the only placeholder content
  on the public site.
- **No cookie banner.** The site sets no analytics or advertising cookies; the
  only cookie is the dashboard session, which is strictly necessary and
  therefore exempt. Adding Google Analytics or an ads pixel **will** require a
  consent banner.
- **British English throughout**, including in the AI's instructions.
- **Sundays closed**, following the stated working hours.

## 15. Photography

**Decision:** the site uses stock photographs licensed for commercial use
(Pexels licence — free to use commercially, no attribution required, no
release needed for editorial-style use of this kind). Each one is chosen to
depict the specific service it sits beside: a hob being degreased on the end
of tenancy page, a desk being wiped on the office page, a carpet being
vacuumed on the domestic page.

**Why stock at all:** the business supplied no photography of its own. The
only original asset in the project is the logo. A cleaning company's website
needs to show cleaning, and the alternative — a text-only site — was tried in
the previous revision and was correctly judged too bland.

**The line that is not crossed.** These are not Merry Cleaners' staff, and
they are not jobs Merry Cleaners has completed. So:

- No photograph is captioned as "our team", "our cleaners" or "our work".
- Alt text describes what is happening in the frame, never whose work it is.
- A posed group portrait was downloaded and then **rejected**, because a team
  photograph on a company website reads as that company's staff, which would
  have been a false claim.
- One candidate was rejected because the subject wore another cleaning
  company's branded shirt.
- No before-and-after pairing has been built, because no genuine before-and
  -after images exist. Two unrelated photographs must never be presented as a
  pair — the business's own trust signal says photographs are supplied per
  job, and that promise is about real evidence.

**The upgrade path, and it matters.** Real photographs of the company's own
work are strictly better than any stock: they are unique, they are honest,
and the business already takes before-and-after shots as part of the service.
Replacing these files (same names, in `public/photos/`) and updating the alt
text in `src/lib/media.ts` is all that is required. At that point the
before-and-after slider the brief asked for becomes possible and should be
built.

**Delivery:** photographs are served through `next/image`, which converts to
WebP, generates responsive sizes and lazy-loads everything below the fold. A
phone receives roughly 26 KB for the hero rather than the 383 KB source file.

## 16. Motion

Scroll reveals are driven by a single `IntersectionObserver` that unobserves
each element after it fires, so nothing animates twice and nothing keeps
running while the visitor scrolls. Photographs ease in with a clip-path
rather than sliding, text rises a short distance, and the hero settles on
load — three different behaviours, so the page does not feel like one effect
applied everywhere.

Everything sits inside `@media (prefers-reduced-motion: no-preference)`, and
the reveal script marks all elements visible immediately when reduced motion
is requested or when JavaScript does not run. The page is fully readable with
motion disabled, which is the test that matters.

## 17. Prospecting: sources chosen by their terms, not their yield

Each candidate source was checked against its own published terms before a line
of code was written, and the decision followed the terms rather than how much
data the source held.

OpenStreetMap invites automated queries through Overpass, so an adapter was
built, with the User-Agent it asks for, a 2.5-second interval, and a hard stop
on a 429 or 504. Companies House publishes a free API, so it became the
highest-reliability source in every record's provenance. A company's own website
is fetched one page at a time, home page only, after reading `robots.txt`.

Yell and Checkatrade prohibit automated extraction, so **no scraper for them
exists** — not disabled, not behind a flag. Their place in the system is the CSV
import, which records that the rows came from the owner. Google's Places API is
technically usable but chargeable and restrictive about storing results, which
would break the £0 constraint. Commercial B2B data providers are all paid, and
several sell personal contact data whose lawful basis becomes the buyer's
problem.

**Consequence:** fewer records per run than a scraper would produce, and every
one of them defensible.

## 18. The prospect/lead boundary is enforced in code

A prospect can only become a lead through one action — *They got in touch* on
the record — which requires the owner to confirm that the organisation actually
replied. The status dropdown structurally cannot set a lead status; it filters
those options out, and the server action refuses them if the form is tampered
with.

This is the single most important correctness property of the feature. Discovery
volume is easy and worthless; a lead number inflated by discovery would tell the
owner the business is growing when it is not.

The new lead is created with follow-up automation **paused**, because we
approached them first and chasing somebody who replied to a cold approach should
be a decision, not a timer.

## 19. Outreach is drafted by code, not by a model

Drafts are assembled from facts already on the record and claims already marked
approved in the knowledge base. No language model writes outreach.

This was tested the obvious way: a model given a company name and asked to write
a warm opening will invent a reason for the contact — a recent refurbishment, a
growing portfolio, dissatisfaction with a current supplier. Every one of those
is a fabricated claim about a real business, in a message with the client's name
on it. Template assembly is duller and cannot do that.

There is also no bulk send. Volume cold email relies on legitimate interest at a
scale that is hard to defend under UK GDPR, and it would put the domain that
carries the quotes and booking confirmations at risk. The owner sends each
approach themselves.

## 20. A self-inflicted data bug, and what it changed

During testing, verification recorded `admin@merrycleaners.co.uk` — the client's
own address — as the business email of a real London estate agency. The agency's
page echoed the visiting program's User-Agent into its HTML; the User-Agent
contained our contact address, as good crawler etiquette suggests; and the email
extractor found it there and stored it as theirs.

Three changes came out of it. The User-Agent now identifies us with a URL and no
email address. Our own identifiers are stripped from every page before anything
is read out of it. And an address at one of our own domains is refused outright,
wherever it appears.

The wider lesson shaped two further rules: an address on a domain other than the
site's own is recorded but flagged for confirmation, and an address naming an
individual is not recorded at all. A prospect record asserting a contact detail
that is not the organisation's is exactly the fabrication the brief forbids, and
it took a real page to find it — which is why the suite now covers it.

## 21. The nightly run is stateless and small

Twelve organisations, one borough, once a day. Which slice runs is derived from
the date rather than stored in a cursor, so a missed night, a redeploy or two
instances firing at once cannot corrupt a position. A full pass over London
takes about a month, roughly how often the underlying public records change.

Small is the point. Overpass is donated infrastructure, and every approach needs
a person to read the record and approve it — so a run that produced hundreds a
night would build a backlog that makes the whole list feel worthless.

## 22. Response rates are withheld until they mean something

The outcomes table shows a percentage only once an audience reaches ten recorded
approaches. Below that it says "not enough data".

A response rate computed from three approaches is noise presented as insight,
and the owner would act on it — prioritising the wrong audience on the strength
of one reply. Withholding the number is more useful than showing it.
