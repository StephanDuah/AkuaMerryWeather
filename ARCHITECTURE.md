# Architecture

How the system is put together, and why it is put together this way.

## The shape of it

```
   Customer                          Owner
      │                                │
      ▼                                ▼
┌──────────────┐               ┌──────────────┐
│  Website     │               │  Dashboard   │
│  (public)    │               │  /admin      │
└──────┬───────┘               └──────┬───────┘
       │  HTTP                        │  server actions
       ▼                              ▼
┌─────────────────────────────────────────────┐
│              API layer  /api/*              │
│   rate limited · zod validated · no auth    │
│   on public routes, shared secret on cron   │
└──────┬──────────────────────────────────────┘
       ▼
┌─────────────────────────────────────────────┐
│                 AGENT                        │
│  1. guardrails      (deterministic, first)   │
│  2. provider layer  (model, swappable)       │
│  3. tools           (the only way to act)    │
│  4. audit           (every action recorded)  │
└──────┬──────────────────────────────────────┘
       ▼
┌──────────────┬──────────────┬───────────────┐
│  Knowledge   │   Business   │    Storage    │
│  JSON files  │    logic     │  JSON │ Supa  │
└──────────────┴──────────────┴───────────────┘
                      │
                      ▼
            ┌───────────────────┐
            │   Integrations    │
            │ email · WhatsApp  │
            │ Stripe · (voice)  │
            └───────────────────┘
```

Four things are deliberately separate, as the brief required: **the website**,
**the agent**, **the business rules and data**, and **the integrations**. The
website is one interface onto the agent, not the agent itself.

## Layers

### 1. Interfaces

| Interface | Where | Status |
| --- | --- | --- |
| Website chat | `src/components/ChatWidget.tsx` → `/api/chat` | Live |
| Quote & booking form | `src/components/QuoteForm.tsx` | Live |
| Owner dashboard | `src/app/admin/*` | Live |
| Inbound email | `/api/email/inbound` | Live, needs a forwarder connected |
| WhatsApp | `src/lib/integrations/whatsapp.ts` | Stubbed, awaiting Meta verification |
| Voice | — | Not built. The agent interface would accept it without a rebuild. |

Every interface calls the same agent. None contains business logic.

### 2. The agent — `src/lib/chat/`, `src/lib/agent/`

Ordered deliberately:

1. **Guardrails run first** (`src/lib/guardrails.ts`). Complaints, payment
   matters, excluded sectors and out-of-scope services are matched in code and
   answered with fixed wording. The model is never consulted. A prompt
   instruction is a preference; code that never calls the model is a guarantee.
2. **The provider layer** (`src/lib/ai/`) reaches a model. `AnthropicProvider`
   is the only file that imports a vendor SDK.
3. **Tools** (`src/lib/chat/tools.ts`) are the only way the agent can act. It
   cannot write arbitrary database rows; it calls a validated function.
4. **Audit** (`src/lib/agent/audit.ts`) records every tool call with a trace
   id, outcome and duration.
5. **The scripted engine** (`src/lib/chat/fallback.ts`) answers when no model
   is configured. It uses the same pricing engine, availability and guardrails.

### 3. Business logic — `src/lib/`

| Module | Responsibility |
| --- | --- |
| `pricing.ts` | Quote calculation, with the approval gate |
| `booking.ts` | Availability, capacity, double-booking prevention |
| `leads.ts` | Lead capture, lifecycle, follow-up scheduling |
| `followups.ts` | The two-stage nudge sequence |
| `comms.ts` | Communications log and escalations |
| `retention.ts` | UK GDPR retention sweep and erasure |
| `guardrails.ts` | What is never handled automatically |
| `postcode.ts` | Greater London coverage checks |

### 4. Knowledge — `src/knowledge/*.json`

Business facts live in data, not code. See `KNOWLEDGE_BASE.md`.

### 5. Storage — `src/lib/db/`

One interface, two drivers:

- **JSON file** (`data/store.json`) when Supabase is not configured. Makes the
  whole system runnable with no accounts at all.
- **Supabase Postgres** when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
  are set.

No business logic knows which is active.

## Key decisions

**Guardrails before the model, not inside the prompt.** The brief required
complaints and payment matters to always reach a human. Deterministic code is
the only way to guarantee that.

**Tools, not database access.** The model cannot invent a price or a date
because it has no way to state one except through a tool that reads the real
pricing engine and the real diary.

**Two engines, one set of rules.** The scripted fallback exists so the system
is fully functional at £0. It shares the pricing engine, availability and
guardrails, so its behaviour cannot drift from the model-driven path.

**Approval gates on facts.** Pricing and knowledge entries carry an `approved`
flag. Unapproved means "escalate", not "improvise". This is what prevents the
system inventing a cancellation policy the business never agreed.

**One vendor file.** Swapping AI provider means writing one adapter.

## Request lifecycle: a chat message

1. `POST /api/chat` — rate limited, validated with zod.
2. Message logged against the lead.
3. **Guardrails.** If blocked: fixed reply, escalation raised, audit row,
   return. The model is never called.
4. Provider selected. None configured → scripted engine.
5. Model loop, max 6 tool rounds. Each tool call audited.
6. Reply logged. Returned to the browser.

If anything throws, the customer is told a person will follow up and an
escalation is raised. The system never guesses its way out of a failure.

## What is deliberately not here

- **No lead scraping.** Breaches platform terms and UK GDPR. See `DECISIONS.md`.
- **No vector database.** The knowledge base is small; keyword search over
  curated JSON is more predictable and costs nothing.
- **No queue.** Follow-ups are driven by a scheduled sweep, which is simpler
  and adequate at this volume.
- **No multi-user auth.** One owner password. Supabase Auth is the documented
  upgrade path.
