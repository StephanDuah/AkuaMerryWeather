import type { EscalationReason } from "@/lib/types";
import { checkLondon } from "@/lib/postcode";

/**
 * Scope and safety rules that apply to every module.
 *
 * The principle throughout: the system never guesses. When a message falls
 * outside what Merry Cleaners offers, or touches money or dissatisfaction,
 * it goes to a human and the customer is told a person will follow up.
 */

/** Sectors the business has decided not to serve. */
const EXCLUDED_SECTOR_TERMS = [
  "school",
  "schools",
  "primary school",
  "secondary school",
  "academy",
  "college",
  "university",
  "nursery",
  "hospital",
  "hospitals",
  "nhs",
  "clinic",
  "surgery",
  "care home",
  "nursing home",
  "hospice",
  "medical centre",
  "medical center",
  "gp practice",
];

/** Work we do not take on, so the assistant must never offer it. */
const OUT_OF_SCOPE_TERMS = [
  "gardening",
  "garden maintenance",
  "pest control",
  "man and van",
  "removals",
  "handyman",
  "plumbing",
  "electrician",
  "painting and decorating",
  "gutter",
  "roof clean",
  "laundry service",
  "dry cleaning",
  "ironing service",
  "waste removal",
  "rubbish clearance",
  "chimney",
  "pressure washing driveway",
];

const COMPLAINT_TERMS = [
  "complaint",
  "complain",
  "unhappy",
  "disappointed",
  "terrible",
  "awful",
  "appalling",
  "damaged",
  "broken",
  "stolen",
  "missing item",
  "poor job",
  "not clean",
  "still dirty",
  "unacceptable",
  "legal action",
  "solicitor",
  "trading standards",
];

const PAYMENT_TERMS = [
  "refund",
  "chargeback",
  "overcharged",
  "double charged",
  "invoice",
  "vat receipt",
  "payment failed",
  "card declined",
  "dispute",
  "money back",
  "credit note",
  "outstanding balance",
  "late fee",
];

export interface ScopeCheck {
  allowed: boolean;
  escalate: boolean;
  reason: EscalationReason | null;
  /** Wording the assistant should use verbatim when it must decline. */
  customerMessage: string | null;
  /** Internal note recorded on the escalation. */
  internalNote: string | null;
}

const OK: ScopeCheck = {
  allowed: true,
  escalate: false,
  reason: null,
  customerMessage: null,
  internalNote: null,
};

function containsAny(haystack: string, needles: string[]): string | null {
  const text = haystack.toLowerCase();
  for (const needle of needles) {
    // Word-boundary-ish match so "reschool" style false hits are avoided.
    const pattern = new RegExp(`(^|[^a-z])${escapeRegex(needle)}([^a-z]|$)`, "i");
    if (pattern.test(text)) return needle;
  }
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Inspects a free-text message for anything that must not be handled
 * automatically. Called on every inbound chat message and every inbound email.
 */
/**
 * Asking for somebody else's details.
 *
 * "What is the address for the booking under the name Priya Raman?" is a
 * request for a third party's personal data, and the only correct answer is
 * no. It is checked before anything else because it must not be answered
 * helpfully - not from the knowledge base, not from a lead record, not at
 * all. The assistant has no way to know whether the person asking is who
 * they say they are, so it does not try to judge; it declines and tells a
 * person.
 *
 * Previously this passed only by luck: the assistant happened to reply with
 * a generic prompt that contained no telephone number. Nothing was actually
 * stopping it.
 */
function asksAboutSomeoneElse(text: string): boolean {
  const t = text.toLowerCase();
  const wantsDetails =
    /\b(address|phone|telephone|number|email|postcode|booking|account|details|when (is|are)|what time)\b/.test(
      t,
    );
  // Word boundaries matter here. Without them "his" matches inside
  // "this", so a customer asking about their own booking would be
  // refused - a false positive that would do real harm.
  const aboutAnother =
    /\b(for|of|under|belonging to)\s+(the\s+)?(booking|customer|client|account|job|appointment|name)\b/.test(
      t,
    ) ||
    /\bunder the name\b/.test(t) ||
    /\b(their|someone else's|somebody else|another customer|other customer)\b/.test(t);
  return wantsDetails && aboutAnother;
}

export function screenMessage(text: string): ScopeCheck {
  if (asksAboutSomeoneElse(text)) {
    return {
      allowed: false,
      escalate: true,
      reason: "uncertain",
      customerMessage:
        "I am not able to share details of anyone else's booking, I am afraid — that is personal information and it would not be right for me to give it out. If the booking is your own, a member of our team can confirm it with you once they have checked who they are speaking to, and I have asked them to get in touch.",
      internalNote:
        "The visitor asked for details of a booking or customer other than their own. Declined automatically. Confirm the caller's identity before discussing any booking.",
    };
  }

  const complaint = containsAny(text, COMPLAINT_TERMS);
  if (complaint) {
    return {
      allowed: false,
      escalate: true,
      reason: "complaint",
      customerMessage:
        "I am sorry to hear that. So this is dealt with properly, I am passing your message directly to a member of our management team, who will contact you personally.",
      internalNote: `Possible complaint detected (matched "${complaint}").`,
    };
  }

  const payment = containsAny(text, PAYMENT_TERMS);
  if (payment) {
    return {
      allowed: false,
      escalate: true,
      reason: "payment",
      customerMessage:
        "Anything relating to payments, invoices or refunds is handled personally by our accounts team. I have passed your message on and a member of the team will be in touch shortly.",
      internalNote: `Payment or refund matter detected (matched "${payment}").`,
    };
  }

  const sector = containsAny(text, EXCLUDED_SECTOR_TERMS);
  if (sector) {
    return {
      allowed: false,
      escalate: true,
      reason: "excluded_sector",
      customerMessage:
        "Thank you for thinking of us. We do not currently take on contracts in this sector, so I would not want to take up your time. If it would help, a member of our team can call you to discuss whether we can assist in any other way.",
      internalNote: `Excluded sector enquiry (matched "${sector}"). Schools and healthcare settings are out of scope by business decision.`,
    };
  }

  const outOfScope = containsAny(text, OUT_OF_SCOPE_TERMS);
  if (outOfScope) {
    return {
      allowed: false,
      escalate: true,
      reason: "out_of_scope",
      customerMessage:
        "We specialise in office cleaning, end of tenancy cleaning and domestic cleaning, so that particular service sits outside what we provide. A member of our team is happy to point you in the right direction if that would be useful.",
      internalNote: `Out-of-scope service requested (matched "${outOfScope}").`,
    };
  }

  return OK;
}

/** Checks a postcode against the Greater London service area. */
export function screenPostcode(postcode: string): ScopeCheck {
  const result = checkLondon(postcode);
  if (!result.inLondon) {
    return {
      allowed: false,
      escalate: true,
      reason: "out_of_area",
      customerMessage:
        "We serve Greater London only, so unfortunately this address falls outside our coverage. I am sorry we cannot assist on this occasion.",
      internalNote: `Enquiry outside Greater London (${postcode}).`,
    };
  }
  if (!result.certain) {
    return {
      allowed: true,
      escalate: true,
      reason: "out_of_area",
      customerMessage: null,
      internalNote: `Postcode ${postcode} is in the ${result.area} area, which straddles the Greater London boundary. Confirm the address is inside Greater London before the visit.`,
    };
  }
  return OK;
}

/** Shared wording used whenever the system is unsure of something. */
export const UNCERTAIN_RESPONSE =
  "I would rather give you a definite answer than an approximate one, so I will pass this to a member of our team. They will come back to you shortly with confirmation.";
