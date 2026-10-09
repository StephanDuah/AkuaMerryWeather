# The AI agent

What it can do, what it must never do, and how it is prevented from doing it.

## What actually works today

| Capability | Status |
| --- | --- |
| Receive enquiries (chat, form, email) | **Working** |
| Answer questions from the knowledge base | **Working** |
| Explain services and what each includes | **Working** |
| Collect customer information | **Working** |
| Qualify and classify leads | **Working** |
| Collect quote information | **Working** |
| Give an indicative price | **Working, gated** — see below |
| Check availability | **Working** |
| Create bookings | **Working** |
| Record leads and full history | **Working** |
| Follow up automatically | **Working** |
| Classify and draft email replies | **Working** |
| Escalate to a human | **Working** |
| Audit its own actions | **Working** |
| Notify the owner | **Working** (dashboard; push/email notification not built) |
| WhatsApp | **Stubbed** — logs instead of sending |
| Voice | **Not built** |
| Outbound prospecting | **Not built, deliberately** |

## The two engines

**Model-driven.** When a provider is configured, the agent converses freely
within its rules and calls tools to act.

**Scripted.** When no model is configured — the current £0 setup — a
deterministic flow asks for service, postcode, size and contact details in
order. It uses the same pricing engine, availability and guardrails, so its
decisions match. It is less conversational, not less correct.

Set `AI_PROVIDER=none` to force the scripted engine even with a key present.

## The tools

The agent cannot touch the database directly. It can only call these:

| Tool | What it does |
| --- | --- |
| `search_knowledge` | Looks up company facts. Returns entries flagged approved or not. |
| `get_service_information` | Full specification for one service. |
| `quote_price` | Calculates a price from the stored rate card. |
| `check_availability` | Returns genuinely free slots. |
| `save_lead` | Creates or updates a lead. |
| `create_booking` | Books a slot, after re-checking it is free. |
| `schedule`/`cancel_followup` | Stops the nudge sequence. |
| `notify_owner` | Raises a note without blocking the conversation. |
| `escalate_to_human` | Hands the matter over. |

Each call is validated, executed by real business logic, and written to the
audit log with a trace id, outcome and duration.

## Rule zero

> Never answer a question about the company, its services, its policies or its
> pricing from your own knowledge. Look it up first, and answer only from what
> comes back.

If the knowledge base marks an entry `approved: false`, that is a
**placeholder the business has not agreed**, not a fact. The agent escalates
instead of filling the gap. This is what structurally prevents it inventing a
cancellation policy or payment terms.

## The pricing gate

`PricingConfig.approved` defaults to **false**. While it is false the agent:

- collects every detail needed to quote
- states that a member of the team will confirm the figure
- raises an escalation containing everything needed
- **still completes the booking**, flagged "price to confirm"

It never states a number. Turn it on in `/admin/pricing` once real rates are
entered. No code change.

## What it must never do

Enforced in `src/lib/guardrails.ts`, **before** any model call:

| Situation | Behaviour |
| --- | --- |
| Complaint of any kind | Apologise, escalate. Never admit liability or offer compensation. |
| Payment, invoice, refund, dispute | Escalate. Always, regardless of any auto-send setting. |
| Address outside Greater London | Decline politely, escalate. Never quote. |
| Schools, healthcare, care homes | Decline politely, escalate. |
| A service not offered | Decline politely, escalate. |
| Uncertainty of any kind | Say a person will confirm, escalate. |

Failure is also a hand-off: if the model errors, refuses, or runs out of tool
rounds, the customer is told a person will follow up.

## Memory model

Four kinds, deliberately distinct:

| Kind | Where | Lifetime |
| --- | --- | --- |
| Company knowledge | `src/knowledge/*.json` | Permanent, owner-edited |
| Conversation context | Sent by the browser each turn | The conversation |
| Customer record | `leads` table | Until retention or erasure |
| Operational state | `bookings`, `escalations`, `agent_actions` | Business lifetime |

Conversation text is **not** treated as permanent memory. What persists is the
structured lead record and the communications log.

## Changing its behaviour

| To change | Edit |
| --- | --- |
| What it says about the company | `src/knowledge/company.json` |
| What a service includes | `src/knowledge/services.json` |
| A policy answer | `src/knowledge/policies.json` |
| An FAQ | `src/knowledge/faqs.json` |
| Prices | `/admin/pricing` |
| Follow-up timing | `/admin/settings` |
| Tone and conversational rules | `src/lib/chat/prompt.ts` |
| What is never automated | `src/lib/guardrails.ts` |

The first five need no developer.
