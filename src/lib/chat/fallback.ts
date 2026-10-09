import { store } from "@/lib/db";
import { calculateQuote, formatGbp } from "@/lib/pricing";
import { getAvailability, SLOT_LABELS } from "@/lib/booking";
import { createLead, findLead, inferSegment, updateLead } from "@/lib/leads";
import { createEscalation } from "@/lib/comms";
import { recordAgentAction } from "@/lib/agent/audit";
import { screenPostcode } from "@/lib/guardrails";
import {
  answerFromKnowledge,
  askWithoutRepeating,
  describePrice,
  looksLikeAQuestion,
  previousAssistantMessages,
  socialReply,
} from "./conversation";
import { BUSINESS, serviceByType } from "@/lib/content";
import type { ServiceType } from "@/lib/types";
import type { ChatMessage, ChatTurnResult } from "./engine";

/**
 * A scripted assistant used when no Anthropic API key is configured.
 *
 * It is deliberately narrow: it reads the whole transcript, works out what
 * it still needs, and asks for exactly that. It uses the same pricing
 * engine, the same availability data and the same guardrails as the
 * Claude-powered assistant, so the business logic is never duplicated -
 * only the conversational flexibility is reduced.
 */

const POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[A-Z]{2})\b|\b([A-Z]{1,2}\d[A-Z\d]?)\b(?=\s|,|\.|$)/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(\+?44\s?7\d{3}|\(?07\d{3}\)?)[\s.-]?\d{3}[\s.-]?\d{3}/;

interface Extracted {
  service: ServiceType | null;
  postcode: string | null;
  bedrooms: number | null;
  sqft: number | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  wantsToBook: boolean;
  /** Regular or deep, for domestic cleaning. They are priced very differently. */
  tier: "regular" | "deep" | null;
}

function extract(messages: ChatMessage[]): Extracted {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  const lower = userText.toLowerCase();

  let service: ServiceType | null = null;
  if (/end of tenancy|move[\s-]?out|moving out|check[\s-]?out|inventory|deposit/.test(lower)) {
    service = "end_of_tenancy";
  } else if (/office|commercial|workplace|workspace|studio|premises|retail/.test(lower)) {
    service = "office";
  } else if (/domestic|regular clean|weekly clean|fortnightly|my home|my flat|my house|house clean/.test(lower)) {
    service = "domestic";
  }

  const postcodeMatch = userText.match(POSTCODE_RE);
  const postcode = postcodeMatch ? postcodeMatch[0].toUpperCase().trim() : null;

  let bedrooms: number | null = null;
  const bedMatch = lower.match(/(\d+)\s*(?:bed|bedroom)/);
  if (bedMatch) bedrooms = Number(bedMatch[1]);
  else if (/\bstudio\b/.test(lower)) bedrooms = 0;

  let sqft: number | null = null;
  const sqftMatch = lower.match(/([\d,]{3,7})\s*(?:sq\s?ft|square feet|sqft|sq\.ft)/);
  if (sqftMatch) sqft = Number(sqftMatch[1].replace(/,/g, ""));

  const emailMatch = userText.match(EMAIL_RE);
  const phoneMatch = userText.match(PHONE_RE);

  let name: string | null = null;
  const nameMatch = userText.match(
    /(?:[Mm]y name is|[Ii](?:'m| am)|[Tt]his is|[Ii]t's)\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?)/,
  );
  if (nameMatch) name = nameMatch[1];

  return {
    service,
    postcode,
    bedrooms,
    sqft,
    email: emailMatch ? emailMatch[0] : null,
    phone: phoneMatch ? phoneMatch[0] : null,
    name,
    wantsToBook: /\bbook\b|\bbooking\b|available|availability|slot|schedule/.test(lower),
    tier: /\bdeep\b|spring clean|one[\s-]?off|thorough|top to bottom/.test(lower)
      ? "deep"
      : /\bregular\b|weekly|fortnightly|every week|maintenance|ongoing/.test(lower)
        ? "regular"
        : null,
  };
}

/**
 * The one thing still needed, phrased as a short follow-on.
 *
 * Used after answering a question, so the conversation keeps moving without
 * the answer being buried under a fresh interrogation. Returns null when
 * there is nothing outstanding, or when this has already been asked - a
 * follow-on that repeats what was just said is worse than no follow-on.
 */
function nextQuestion(found: Extracted, alreadySaid: string[]): string | null {
  const candidate = !found.service
    ? "Is your enquiry about an office, your home, or a property at the end of a tenancy?"
    : !found.postcode
      ? "If you let me have the postcode, I can confirm we cover it and work out the price."
      : found.service === "office" && !found.sqft
        ? "Roughly what is the floor area in square feet? An approximate figure is fine."
        : found.service !== "office" && found.bedrooms === null
          ? "How many bedrooms does the property have?"
          : null;

  if (!candidate) return null;
  return alreadySaid.some((said) => said.includes(candidate)) ? null : candidate;
}

export async function runFallbackTurn(
  messages: ChatMessage[],
  leadId: string | null,
  traceId: string,
): Promise<ChatTurnResult> {
  const found = extract(messages);

  /**
   * The scripted engine reaches the pricing and booking logic directly
   * rather than through the model's tool loop, so its decisions are audited
   * here instead. Every branch below records what it decided and why.
   */
  const audit = (
    tool: string,
    summary: string,
    outcome: "ok" | "refused" | "escalated",
    lead: string | null = leadId,
  ) =>
    recordAgentAction({
      trace_id: traceId,
      channel: "chat",
      tool,
      summary,
      outcome,
      lead_id: lead,
      actor: "scripted",
    });
  const lastUser =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  const alreadySaid = previousAssistantMessages(messages);

  /* ---- answer what was actually asked -------------------------------- *
   * Before anything else, because a visitor asking a question and being
   * handed the sales funnel instead is how this assistant used to loop.   */
  const social = socialReply(lastUser);
  if (social && !found.service) {
    await audit("small_talk", "greeted or acknowledged the visitor", "ok");
    return reply(
      `${social} We provide office cleaning, end of tenancy cleaning and domestic cleaning across Greater London.`,
      leadId,
    );
  }

  if (looksLikeAQuestion(lastUser)) {
    const answer = answerFromKnowledge(lastUser);
    if (answer) {
      if (answer.escalate) {
        await createEscalation({
          reason: "uncertain",
          summary: "A question the assistant is not approved to answer",
          detail: `The visitor asked: "${lastUser}"`,
          lead_id: leadId,
        });
        await audit("search_knowledge", `unapproved: ${answer.source}`, "escalated");
        return reply(answer.text, leadId, true);
      }

      await audit("search_knowledge", `answered from ${answer.source}`, "ok");
      // Answer first, then carry on with whatever is still needed - but only
      // if that next question has not already been asked and ignored.
      const next = nextQuestion(found, alreadySaid);
      return reply(next ? `${answer.text} ${next}` : answer.text, leadId);
    }

    // A question with no answer on file is handed over rather than guessed at.
    if (!found.service) {
      await createEscalation({
        reason: "uncertain",
        summary: "A question the assistant could not answer",
        detail: `The visitor asked: "${lastUser}"`,
        lead_id: leadId,
      });
      await audit("search_knowledge", "no entry matched the question", "escalated");
      return reply(
        `That is not something I can answer accurately, so I have passed it to a member of our team and they will come back to you. If it is urgent you are welcome to call us on ${BUSINESS.phonePrimary}. In the meantime, is your enquiry about an office, a home, or a property at the end of a tenancy?`,
        leadId,
        true,
      );
    }
  }

  if (!found.service) {
    const ask = askWithoutRepeating(
      alreadySaid,
      [
        "We provide office cleaning, end of tenancy cleaning and domestic cleaning across Greater London. Which of the three can we help you with?",
        "So that I point you the right way — is this for an office, for your home, or for a property at the end of a tenancy?",
      ],
      `I do not want to keep asking the same thing. Let me have a member of our team call you instead — could you leave a telephone number or an email address? Or you are very welcome to ring us on ${BUSINESS.phonePrimary}.`,
    );
    if (ask.exhausted) {
      await createEscalation({
        reason: "uncertain",
        summary: "The assistant could not establish what the visitor needs",
        detail: `Asked twice without success. Last message: "${lastUser}"`,
        lead_id: leadId,
      });
      await audit("collect_information", "gave up asking and handed over", "escalated");
      return reply(ask.text, leadId, true);
    }
    await audit("collect_information", "service type not yet identified", "ok");
    return reply(ask.text, leadId);
  }

  const service = serviceByType(found.service);

  if (!found.postcode) {
    const ask = askWithoutRepeating(
      alreadySaid,
      [
        `Thank you. We price ${service.name.toLowerCase()} by London postcode, so could you let me have the postcode of the property?`,
        "Even the first half of the postcode is enough — something like SW4, E8 or N1.",
      ],
      `Rather than keep asking, let me have a member of our team pick this up with you. Could you leave a telephone number or an email address? You are also very welcome to ring us on ${BUSINESS.phonePrimary}.`,
    );
    if (ask.exhausted) {
      await createEscalation({
        reason: "uncertain",
        summary: "The assistant could not obtain a postcode",
        detail: `Asked twice for a postcode without success. Service: ${found.service}.`,
        lead_id: leadId,
      });
      await audit("collect_information", "gave up asking for the postcode", "escalated");
      return reply(ask.text, leadId, true);
    }
    await audit("collect_information", `service=${found.service}, awaiting postcode`, "ok");
    return reply(ask.text, leadId);
  }

  const area = screenPostcode(found.postcode);
  if (!area.allowed) {
    await createEscalation({
      reason: "out_of_area",
      summary: `Enquiry outside Greater London (${found.postcode})`,
      detail: area.internalNote ?? "",
      lead_id: leadId,
    });
    await audit("screen_postcode", `outside Greater London: ${found.postcode}`, "escalated");
    return reply(area.customerMessage ?? "", leadId, true);
  }

  const isOffice = found.service === "office";
  if (isOffice && !found.sqft) {
    const ask = askWithoutRepeating(
      alreadySaid,
      [
        "To prepare an accurate estimate for your premises, roughly what is the floor area in square feet? An approximate figure is perfectly sufficient.",
        "A rough size is all I need — for example the number of desks, or the floor area if you know it.",
      ],
      `Let me pass this to a member of our team rather than keep asking. Could you leave a telephone number or an email address, or ring us on ${BUSINESS.phonePrimary}?`,
    );
    if (ask.exhausted) {
      await createEscalation({
        reason: "uncertain",
        summary: "The assistant could not obtain the office floor area",
        detail: `Asked twice without success. Postcode: ${found.postcode}.`,
        lead_id: leadId,
      });
      await audit("collect_information", "gave up asking for floor area", "escalated");
      return reply(ask.text, leadId, true);
    }
    await audit("collect_information", "awaiting office floor area", "ok");
    return reply(ask.text, leadId);
  }
  if (!isOffice && found.bedrooms === null) {
    const ask = askWithoutRepeating(
      alreadySaid,
      [
        "How many bedrooms does the property have? If it is a studio, please just say so.",
        "Just the number of bedrooms and I can give you the price — one, two, three?",
      ],
      `I will stop asking and have someone call you instead. Could you leave a telephone number or an email address, or ring us on ${BUSINESS.phonePrimary}?`,
    );
    if (ask.exhausted) {
      await createEscalation({
        reason: "uncertain",
        summary: "The assistant could not obtain the number of bedrooms",
        detail: `Asked twice without success. Service: ${found.service}, postcode: ${found.postcode}.`,
        lead_id: leadId,
      });
      await audit("collect_information", "gave up asking for bedrooms", "escalated");
      return reply(ask.text, leadId, true);
    }
    await audit("collect_information", "awaiting bedroom count", "ok");
    return reply(ask.text, leadId);
  }

  const pricing = await store.getPricing();
  const quote = calculateQuote(
    {
      service_type: found.service,
      postcode: found.postcode,
      bedrooms: found.bedrooms,
      floor_area_sqft: found.sqft,
      addons: [],
      tier: found.tier,
    },
    pricing,
  );

  if (!quote.ok && quote.reason === "pricing_not_approved") {
    await audit(
      "quote_price",
      `details complete for ${found.service} at ${found.postcode}; rate card unapproved, no price stated`,
      "escalated",
    );
    await createEscalation({
      reason: "uncertain",
      summary: `Quote needed: ${found.service.replace(/_/g, " ")} at ${found.postcode.toUpperCase()}`,
      detail:
        "All details were collected but the rate card is not approved, so no price was given.",
      lead_id: leadId,
    });
    return reply(
      `${quote.message} In the meantime, may I take your name and either a telephone number or an email address so they can reach you?`,
      leadId,
      true,
    );
  }

  if (!quote.ok) {
    await audit("quote_price", `could not price: ${quote.reason}`, "escalated");
    await createEscalation({
      reason: "uncertain",
      summary: "The assistant could not calculate an estimate",
      detail: `${quote.message} Details supplied: ${JSON.stringify(found)}`,
      lead_id: leadId,
    });
    return reply(
      "I would rather give you a precise figure than an approximate one, so a member of our team will review the details and come back to you shortly.",
      leadId,
      true,
    );
  }

  // Record or update the lead as soon as we have something to save.
  let activeLeadId = leadId;
  if (found.name && (found.email || found.phone)) {
    const payload = {
      name: found.name,
      email: found.email,
      phone: found.phone,
      postcode: found.postcode,
      bedrooms: found.bedrooms,
      floor_area_sqft: found.sqft,
      service_type: found.service,
      quote_low: quote.low,
      quote_high: quote.high,
      segment: inferSegment(lastUser),
    };
    if (activeLeadId) {
      await updateLead(activeLeadId, { ...payload, status: "quote_sent" });
    } else {
      const existing = await findLead(found.email, found.phone);
      if (existing) {
        await updateLead(existing.id, { ...payload, status: "quote_sent" });
        activeLeadId = existing.id;
      } else {
        const lead = await createLead({
          ...payload,
          source: "website_chat",
          notes: "Captured by the website assistant.",
          consent_text:
            "Provided their details in the website chat so we could prepare a quote.",
        });
        activeLeadId = lead.id;
      }
    }
    await audit("save_lead", `lead captured for ${found.service}`, "ok", activeLeadId);
  }

  // "in the region of £155 to £155" is what the old wording produced once
  // real, exact prices were loaded. A published price is stated as a price.
  const priced = describePrice(quote.low, quote.high, quote.from_price_list, formatGbp);

  if (!activeLeadId) {
    return reply(
      `Based on what you have told me, our price for ${service.name.toLowerCase()} at ${found.postcode.toUpperCase()} ${priced}. ${quote.disclaimer} May I take your name and either a telephone number or an email address so a member of our team can confirm it? We use these details only to prepare your quote and arrange the clean.`,
      activeLeadId,
    );
  }

  if (found.wantsToBook) {
    const slots = (await getAvailability(10)).filter((slot) => slot.available).slice(0, 3);
    await audit(
      "check_availability",
      `${slots.length} slot(s) offered`,
      "ok",
      activeLeadId,
    );
    if (!slots.length) {
      return reply(
        `Thank you. Our price for this clean ${priced}. ${quote.disclaimer} Our diary is fully committed for the dates I can see, so a member of our team will contact you with the next available options.`,
        activeLeadId,
        true,
      );
    }
    const offered = slots
      .map((slot) => `${formatDate(slot.date)}, ${SLOT_LABELS[slot.slot] ?? slot.slot}`)
      .join("; ");
    return reply(
      `Thank you. Our price for this clean ${priced}. ${quote.disclaimer} We currently have ${offered}. Which would suit you, and could you confirm the full address? A member of our team will then confirm everything in writing.`,
      activeLeadId,
    );
  }

  await audit("quote_price", `estimate given for ${found.service}`, "ok", activeLeadId);
  return reply(
    `Thank you. Our price for this clean ${priced}. ${quote.disclaimer} Our staff are DBS-checked, trained and fully insured, and every job is covered by our re-clean guarantee. Would you like us to look at dates, or you are welcome to call us on ${BUSINESS.phonePrimary}.`,
    activeLeadId,
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function reply(
  text: string,
  leadId: string | null,
  escalated = false,
): ChatTurnResult {
  return { reply: text, leadId, escalated, usedModel: false };
}
