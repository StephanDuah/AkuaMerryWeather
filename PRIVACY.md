# Privacy and data protection

How the system handles personal data, and what the business still has to do.

Merry Cleaners is a UK business, so **UK GDPR** and the **Data Protection Act
2018** apply. This was designed in from the start, not added afterwards.

## What is collected

| Data | Why | Required? |
| --- | --- | --- |
| Name | To address the customer and identify the job | Yes |
| Email and/or telephone | To send the quote and confirm the booking | One of the two |
| Property address and postcode | To price by zone and to attend | Yes |
| Property type, bedrooms or floor area | To calculate the quote | Yes |
| Service and add-ons | To specify the work | Yes |
| Preferred date | To schedule | No |
| Lead source | To measure which advertising works | No |
| Correspondence | To maintain a record of what was agreed | Yes |
| Marketing consent | Separate, optional, unticked by default | No |

**Not collected:** card or bank details (Stripe handles payment; the system
never sees a card number), date of birth, identity documents, or anything the
agent is not explicitly instructed to ask for.

The agent is instructed never to request more than a quote and a clean
require, and never to ask for card, bank or identity documents in chat.

## Prospect data

Prospecting records hold information about **organisations**, taken from public
sources: a company name, a registered office, a published business phone
number, a general mailbox such as `info@` or `lettings@`. Corporate information
about a company is not personal data.

Three rules keep it that way:

- **A named individual's email address is never stored.** If the only address
  published on a company's site is `firstname.surname@company.co.uk`, the record
  stores no email and flags that one exists. This applies to imported lists too.
- **No individual is profiled.** There are no named contacts, no job titles, no
  personal phone numbers and no social profiles on a prospect record.
- **Sole traders are the edge case.** For a one-person business the company's
  details may also be personal data. The lawful basis for approaching them is
  legitimate interest, the first message always offers an opt-out, and the
  do-not-contact list makes honouring an objection immediate and permanent.

Suppression entries are kept **indefinitely and deliberately**, because that is
what makes an objection durable. Keeping the minimum needed to honour a "do not
contact me" request is a recognised basis for retaining it.

`prospects`, `suppressions` and `campaigns` all have row-level security enabled
with no policies, so they are reachable only through the server's service-role
key. There is no public surface to any of it.

## Lawful basis

| Purpose | Basis |
| --- | --- |
| Answering an enquiry and preparing a quote | Legitimate interest |
| Delivering a booked clean | Contract |
| Following up an unconverted enquiry (max two messages) | Legitimate interest |
| Accounting and tax records | Legal obligation |
| Marketing beyond the two follow-ups | Consent |

The basis is recorded on each lead: `legitimate_interest` for an unconverted
enquiry, `contract` once a booking exists.

## Retention

**24 months from last contact**, configurable in `/admin/settings`.

- `/api/cron/retention` reports what is due and erases it on `POST`.
- Scheduled weekly in `vercel.json`.
- Accounting records are kept for six years where the law requires it — those
  live in Stripe and your accounts, not here.

## Erasure — honouring "delete my data"

Open the lead in `/admin/leads`, scroll to **Data protection**, click
**Delete this record permanently**.

This removes the lead **and** every message, escalation and booking attached
to it. It cannot be undone. That is the whole point.

## Transparency

- The privacy notice at `/privacy` is written in plain English and describes
  what this system actually does.
- The chat widget states at the point of collection that details are used only
  to prepare the quote and arrange the clean.
- The quote form carries the same statement above the consent checkbox.
- The privacy notice has a section on AI use, stating that anything involving
  a complaint, payment, refund or uncertainty goes to a person.

## Automated decision-making

**No decision is taken about a customer that produces a legal or similarly
significant effect.** The agent quotes, schedules and drafts. It does not
assess creditworthiness, refuse service on personal characteristics, or make
binding commitments — every price is an estimate a person confirms, and
anything sensitive is escalated.

This is worth stating plainly because UK GDPR Article 22 restricts solely
automated decisions with significant effects. Nothing here meets that bar.

## Processors

| Processor | What they handle | Where |
| --- | --- | --- |
| Vercel | Hosting; data in transit | Configurable region |
| Supabase | The database | **London (eu-west-2)** — chosen deliberately |
| Anthropic | Conversation text sent for a reply | US |
| Resend | Outbound email | US/EU |
| Stripe | Payment data (we never see card numbers) | Global |
| Meta | WhatsApp messages, when connected | Global |

**Anthropic is an international transfer.** Their terms include Standard
Contractual Clauses. If you connect the AI, your privacy notice should name
Anthropic as a processor — it already does.

## Technical measures

- Service-role database key server-side only, never in a browser bundle.
- Row Level Security on every table with no policies — only the server's key
  has access.
- Dashboard behind a signed, httpOnly session cookie; `noindex`.
- Audit summaries redacted: emails and phone numbers stripped before storage.
- Secrets in environment variables, never committed. `.env.local` gitignored.
- Rate limiting on public endpoints.

## What the business still must do

1. **Register with the ICO.** £52/year, or £47 by direct debit. **Legally
   required.** Not optional, and there is a fixed penalty for not paying.
   https://ico.org.uk/for-organisations/data-protection-fee/
2. **Add your ICO registration number** to the privacy notice.
3. **Have the privacy notice reviewed** by someone qualified before launch. It
   is a solid, honest starting point written to match the system's actual
   behaviour — it is not legal advice.
4. **Keep a record of processing activities** if you grow past the exemption
   thresholds.
5. **Tell customers about the AI** — the privacy notice does this already;
   keep it accurate if the system changes.

## Cookies

The site sets **one** cookie: the dashboard session. It is strictly necessary
and therefore exempt from consent requirements. There is no analytics, no
advertising pixel, and no consent banner.

**If you add Google Analytics or an ads pixel, you will need a consent
banner.** That is a real obligation, not a formality.
