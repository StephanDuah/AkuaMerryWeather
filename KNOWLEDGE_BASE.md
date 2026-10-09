# Knowledge base

Everything the AI agent is allowed to say about Merry Cleaners lives in four
JSON files. **You can edit them without a developer.**

## The files

| File | Contains |
| --- | --- |
| `src/knowledge/company.json` | Name, contact details, hours, coverage, credentials, customer segments |
| `src/knowledge/services.json` | The three services: what each includes, excludes, and who it suits |
| `src/knowledge/policies.json` | Quoting, booking, cancellation, payment, complaints, guarantee, data protection, tone |
| `src/knowledge/faqs.json` | Question-and-answer pairs the agent may use |

## The `approved` flag — the important part

Every entry carries `approved: true` or `approved: false`.

**`approved: true`** — a fact the business can evidence. The agent may state it.

**`approved: false`** — a **placeholder awaiting your decision**. It is *not* a
fact. The agent will not state it and will not improvise around it: it tells
the customer a team member will confirm, and raises an escalation.

This is what stops the system inventing a cancellation policy you never agreed.

### Currently unapproved, and why

| Entry | Why | To fix |
| --- | --- | --- |
| `policies.cancellation` | No cancellation policy supplied | Write your notice period and any fee, set `approved: true` |
| `policies.payment` | No payment terms supplied | Write them, set `approved: true`. *Note: payment matters still always escalate by separate rule.* |
| `faqs.staff_numbers` | Team size and trading history unconfirmed. The live website carries figures that conflict with other information supplied. | Confirm the real figures, then add them |
| Pricing (`/admin/pricing`) | Rates are placeholders I derived from market rates, not yours | Enter real rates, tick approve |

Until these are resolved the agent is *correct* to defer — but every affected
enquiry needs you.

## How to edit

1. Open the file in any text editor (Notepad works).
2. Change the text between the quotation marks.
3. Save.
4. Commit and push, or ask me — the site redeploys automatically.

**Rules when editing**

- Keep the quotation marks and commas exactly as they are.
- Never add a claim the business cannot evidence — no awards, certifications,
  statistics or review counts that are not real.
- If you are unsure whether something is true, set `approved: false` rather
  than guessing. Deferring costs you one reply; a false claim costs more.

## How search works

`searchKnowledge(query)` tokenises the customer's words, drops filler, and
scores entries: a curated keyword phrase scores 5, a single keyword 3, an
incidental word match 1. The best four are returned.

Each result tells the agent whether it may be stated. If any match is
unapproved, the agent is instructed to escalate that part rather than answer.

No vector database, no embeddings, no external service. The knowledge base is
small and curated, so keyword matching is more predictable and costs nothing.

## Adding an FAQ

```json
{
  "id": "parking",
  "approved": true,
  "question": "Do your cleaners need parking?",
  "keywords": ["parking", "permit", "car", "van", "access"],
  "answer": "Where a permit is needed, let us know when booking and we will arrange it with you in advance."
}
```

Only add this if it is **true**. `keywords` are what a customer might type.

## Adding a service

Add an entry to `services.json` with the same fields as the existing three.
The website page, the chatbot's knowledge and the quote form all read from
this file, so one edit updates everything.

You will also need matching pricing in `/admin/pricing` and a photograph in
`src/lib/media.ts`.

**Do not add a service the business does not actually provide.** The agent
will start offering it.

## What is deliberately absent

- **Testimonials.** None supplied with permission to publish. The agent may
  say references are available on request; it must not quote or count them.
- **Trading history and team size.** Conflicting figures; unconfirmed.
- **Social media links.** None supplied.
- **Founding date.** Not supplied.

Each is marked as a placeholder in the files, so nothing is silently invented.
