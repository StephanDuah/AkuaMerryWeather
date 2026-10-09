import { store } from "@/lib/db";
import { getProvider } from "@/lib/ai";
import { createEscalation, logCommunication } from "@/lib/comms";
import { createLead, findLead } from "@/lib/leads";
import { screenMessage } from "@/lib/guardrails";
import { BUSINESS, SERVICES } from "@/lib/content";
import { handoverReply } from "./templates";
import { sendEmail } from "./send";
import { ALWAYS_HUMAN_CATEGORIES, type EmailCategory, type EscalationReason } from "@/lib/types";

/**
 * Inbound email handling.
 *
 * The default posture is draft-for-approval: the AI writes a reply and puts
 * it in the escalations inbox for the owner to approve, edit or discard.
 * Turning on email_auto_send in /admin/settings lets routine categories go
 * out automatically - but complaints and anything about money never do,
 * whatever that flag says.
 */

export interface InboundEmail {
  from: string;
  from_name?: string | null;
  subject: string;
  body: string;
}

export interface InboundResult {
  category: EmailCategory;
  action: "auto_sent" | "awaiting_approval";
  escalation_id: string | null;
  lead_id: string | null;
  draft_subject: string;
  draft_body: string;
}

const CATEGORY_RULES: { category: EmailCategory; patterns: RegExp[] }[] = [
  {
    category: "complaint",
    patterns: [
      /complain|unhappy|disappointed|not acceptable|unacceptable|poor (service|job)|still dirty|damaged|broken|missing/i,
    ],
  },
  {
    category: "payment_question",
    patterns: [
      /refund|invoice|payment|overcharg|charged twice|receipt|vat|outstanding balance|chargeback/i,
    ],
  },
  {
    category: "cancellation",
    patterns: [/cancel|postpone|reschedul|move the booking|can we change the date/i],
  },
  {
    category: "booking_request",
    patterns: [/book|confirm the date|go ahead|proceed with|arrange the clean/i],
  },
  {
    category: "quote_request",
    patterns: [/quote|estimate|how much|pricing|price for|cost of/i],
  },
  {
    category: "existing_customer",
    patterns: [/our (usual|regular) clean|next visit|same team|our contract|as always/i],
  },
];

/** Deterministic first pass. Cheap, predictable, and always runs. */
export function classifyEmail(subject: string, body: string): EmailCategory {
  const text = `${subject}\n${body}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.category;
  }
  if (/\?/.test(text) || /interested|enquir|inquir/i.test(text)) return "enquiry";
  return "other";
}

function reasonFor(category: EmailCategory): EscalationReason {
  if (category === "complaint") return "complaint";
  if (category === "payment_question") return "payment";
  return "email_approval";
}

async function draftReply(
  email: InboundEmail,
  category: EmailCategory,
): Promise<{ subject: string; body: string }> {
  const fallback = handoverReply(email.from_name ?? null);

  const provider = getProvider();
  if (!provider) return fallback;
  if (ALWAYS_HUMAN_CATEGORIES.includes(category)) {
    // A person writes these. We still provide the holding reply as a
    // starting point, but the AI does not compose the substance.
    return fallback;
  }

  try {
    const serviceSummary = SERVICES.map(
      (service) => `- ${service.name}: ${service.summary}`,
    ).join("\n");

    const response = await provider.complete({
      maxTokens: 1500,
      effort: "low",
      system: `You draft email replies for ${BUSINESS.name}, a premium London cleaning company, for a human to review before sending.

Services offered (nothing else):
${serviceSummary}

Service area: ${BUSINESS.serviceArea} only. We do not work in schools, colleges, nurseries, hospitals, clinics or care homes.

Rules:
- British English, premium and professional, warm but never casual. No emoji, no exclamation marks, no slang.
- Never state a price, a date, a timescale or a policy that is not already in the customer's message or in these instructions. If a price is needed, say our team will confirm it.
- Never promise anything about payments, refunds or compensation.
- Mention that our staff are DBS-checked, trained and fully insured only where it is genuinely relevant.
- Sign off as ${BUSINESS.name} with the telephone number ${BUSINESS.phonePrimary}.
- Output plain text only: the first line is "Subject: ..." and the rest is the body. No commentary.`,
      messages: [
        {
          role: "user",
          content: `Category: ${category}\nFrom: ${email.from_name ?? email.from}\nSubject: ${email.subject}\n\n${email.body}`,
        },
      ],
    });

    if (response.stopReason === "refusal") return fallback;

    const text = response.text.trim();
    if (!text) return fallback;

    const match = text.match(/^Subject:\s*(.+)\n([\s\S]*)$/);
    if (!match) return { subject: `Re: ${email.subject}`, body: text };
    return { subject: match[1].trim(), body: match[2].trim() };
  } catch (error) {
    console.error("[merry-cleaners] Email draft failed:", error);
    return fallback;
  }
}

export async function handleInboundEmail(
  email: InboundEmail,
): Promise<InboundResult> {
  const settings = await store.getSettings();
  const category = classifyEmail(email.subject, email.body);

  // Attach to an existing lead, or open one so the history stays complete.
  let lead = await findLead(email.from, null);
  if (!lead) {
    lead = await createLead({
      name: email.from_name ?? null,
      email: email.from,
      source: "email",
      notes: `Opened from an inbound email: "${email.subject}".`,
      consent_text: "Contacted us by email.",
    });
  }

  const inbound = await logCommunication({
    lead_id: lead.id,
    channel: "email",
    direction: "inbound",
    subject: email.subject,
    body: email.body,
    template: `inbound_${category}`,
    to_address: BUSINESS.email,
  });

  const draft = await draftReply(email, category);

  const screen = screenMessage(email.body);
  const mustStayHuman =
    ALWAYS_HUMAN_CATEGORIES.includes(category) || !screen.allowed;

  if (settings.email_auto_send && !mustStayHuman) {
    await sendEmail({
      to: email.from,
      subject: draft.subject,
      body: draft.body,
      lead_id: lead.id,
      template: `auto_reply_${category}`,
    });
    return {
      category,
      action: "auto_sent",
      escalation_id: null,
      lead_id: lead.id,
      draft_subject: draft.subject,
      draft_body: draft.body,
    };
  }

  const escalation = await createEscalation({
    reason: mustStayHuman ? reasonFor(category) : "email_approval",
    summary: mustStayHuman
      ? `${category.replace(/_/g, " ")} from ${email.from} - reply personally`
      : `Reply ready for approval: ${email.subject}`,
    detail: mustStayHuman
      ? `This email was categorised as "${category}" and is never answered automatically. The draft below is a holding reply only; please write the substantive response yourself.\n\nOriginal message:\n${email.body}`
      : `Original message:\n${email.body}`,
    lead_id: lead.id,
    communication_id: inbound.id,
    draft_subject: draft.subject,
    draft_body: draft.body,
    draft_to: email.from,
  });

  await logCommunication({
    lead_id: lead.id,
    channel: "email",
    direction: "outbound",
    status: "draft",
    subject: draft.subject,
    body: draft.body,
    template: `draft_${category}`,
    to_address: email.from,
  });

  return {
    category,
    action: "awaiting_approval",
    escalation_id: escalation.id,
    lead_id: lead.id,
    draft_subject: draft.subject,
    draft_body: draft.body,
  };
}
