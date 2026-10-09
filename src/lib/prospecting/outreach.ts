import { BUSINESS } from "@/lib/content";
import { company } from "@/lib/knowledge";
import { SERVICE_LABELS, type PricingConfig } from "@/lib/types";
import { BUSINESS_TYPE_LABELS, type Prospect } from "./types";

/**
 * Outreach preparation.
 *
 * This module writes a draft. It does not send anything, and nothing in the
 * codebase sends what it writes: the owner reads the draft, edits it if they
 * want to, and sends it themselves from their own mailbox. There is
 * deliberately no bulk path.
 *
 * Every sentence is assembled from a fact that is already on the prospect
 * record or in the approved knowledge base. Nothing here asks a language
 * model to write copy, because a model given a company name will invent a
 * reason to contact them - a recent refurbishment, a growing portfolio, a
 * problem with their current cleaner. None of that would be true.
 *
 * What the draft may say:
 *   - the organisation's own name, and the borough it is recorded in
 *   - what Merry Cleaners does, and the credentials marked approved
 *   - which services could plausibly suit an organisation of that kind
 *
 * What it must never say:
 *   - that they need cleaning, are unhappy with anyone, or asked us to call
 *   - anything about their premises, staff, portfolio or contracts
 *   - a price, unless the owner has approved the rate card
 *   - a review, rating, client name or statistic
 */

export type OutreachChannel = "email" | "contact_form" | "phone";

export interface OutreachDraft {
  channel: OutreachChannel;
  /** Where the owner should send it. Null for a phone approach. */
  destination: string | null;
  subject: string;
  body: string;
  /** Every fact used, and where it came from, so the owner can check it. */
  facts_used: { fact: string; source: string }[];
  /** Things the owner must confirm before sending. */
  review_points: string[];
}

export interface OutreachReadiness {
  ready: boolean;
  /** Why it is not ready. Empty when it is. */
  blockers: string[];
  draft: OutreachDraft | null;
}

/** Which services it is reasonable to mention to this kind of organisation. */
function servicesToMention(prospect: Prospect): string[] {
  return prospect.qualification.potential_services.map(
    (service) => SERVICE_LABELS[service].toLowerCase(),
  );
}

/** Joins a list the way a person writes one. */
function sentenceList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function chooseChannel(prospect: Prospect): {
  channel: OutreachChannel;
  destination: string | null;
} | null {
  if (prospect.email) return { channel: "email", destination: prospect.email };
  if (prospect.contact_form_url) {
    return { channel: "contact_form", destination: prospect.contact_form_url };
  }
  if (prospect.phone) return { channel: "phone", destination: prospect.phone };
  return null;
}

/**
 * Checks whether an approach is appropriate at all, then drafts it.
 *
 * The checks come first and they are hard stops. An unverified prospect, one
 * with no published business contact route, or one on the do-not-contact
 * list gets no draft - not a draft with a warning attached.
 */
export function prepareOutreach(
  prospect: Prospect,
  pricing: PricingConfig,
): OutreachReadiness {
  const blockers: string[] = [];

  if (prospect.status === "do_not_contact") {
    blockers.push(
      "This organisation is on the do-not-contact list. No approach may be prepared.",
    );
  }
  if (prospect.business_type === "irrelevant" || prospect.status === "not_suitable") {
    blockers.push(
      "This organisation is not one the business prospects — it falls in an excluded sector or is not a business we serve.",
    );
  }
  if (prospect.verified_at === null && !prospect.sources.includes("companies_house")) {
    blockers.push(
      "Not verified yet. Run Verify first, so the contact details and the fact that they are trading have both been checked.",
    );
  }
  if (prospect.borough === null) {
    blockers.push(
      "No London borough on record, so we cannot say this organisation is inside our service area.",
    );
  }
  if (prospect.qualification.potential_services.length === 0) {
    blockers.push("No service on the rate card plausibly suits this organisation.");
  }

  const route = chooseChannel(prospect);
  if (!route) {
    blockers.push(
      "No published business contact route on record — no email, contact form or phone number.",
    );
  }

  if (prospect.lead_id !== null) {
    blockers.push(
      "This organisation is already a lead. Continue the conversation from the lead record rather than starting a new approach.",
    );
  }

  if (blockers.length > 0 || !route) {
    return { ready: false, blockers, draft: null };
  }

  const services = servicesToMention(prospect);
  const typeLabel = BUSINESS_TYPE_LABELS[prospect.business_type].toLowerCase();
  const credentials = company.credentials
    .filter((credential) => credential.approved)
    .filter((credential) => ["insured", "dbs", "guarantee"].includes(credential.id));

  const facts: { fact: string; source: string }[] = [
    {
      fact: prospect.company_name,
      source: `Recorded name (${prospect.provenance.find((p) => p.field === "company_name")?.source ?? prospect.sources[0] ?? "on file"})`,
    },
    {
      fact: `Located in ${prospect.borough}`,
      source: prospect.postcode
        ? `Postcode ${prospect.postcode}`
        : "Address on file",
    },
    {
      fact: `Classified as a ${typeLabel}`,
      source: "Classification rules, from the recorded business activity",
    },
    {
      fact: `Services that could suit: ${sentenceList(services)}`,
      source: "Service fit rules — what this kind of organisation typically buys",
    },
  ];
  if (prospect.companies_house_number) {
    facts.push({
      fact: `Companies House ${prospect.companies_house_number}${prospect.companies_house_status ? ` (${prospect.companies_house_status})` : ""}`,
      source: "Companies House register",
    });
  }

  const subject =
    prospect.business_type === "commercial_office" ||
    prospect.business_type === "coworking_space"
      ? `Office cleaning in ${prospect.borough} — ${BUSINESS.name}`
      : `Cleaning support for ${prospect.company_name}`;

  // Written in the first person, as the owner, because the owner is the one
  // who will send it. It opens by saying plainly why we are writing, which
  // is the honest alternative to inventing a pretext.
  const lines: string[] = [];
  lines.push("Hello,");
  lines.push("");
  lines.push(
    `I am getting in touch from ${BUSINESS.name}, a cleaning company based in ${BUSINESS.address}. ` +
      `We work across ${BUSINESS.serviceArea} only, and I am writing to introduce us to ${prospect.company_name} ` +
      `in case a cleaning contractor is ever useful to you.`,
  );
  lines.push("");
  // Framed as our own judgement, not as a claim about how much work we do or
  // what this organisation needs. The business has supplied no figures about
  // its own demand, so the draft cannot imply any.
  // "An organisation like yours" rather than the classification itself: it
  // stays grammatical for every business type, and it keeps the sentence a
  // statement of our own expectation rather than a claim about their needs
  // or about how much work of this kind we do.
  lines.push(
    `I do not know what arrangements you already have in place. I am simply making the introduction, ` +
      `as ${services.length === 1 ? "the service" : "the services"} I would expect to be most relevant to ` +
      `an organisation like yours ${services.length === 1 ? "is" : "are"} ${sentenceList(services)}.`,
  );
  lines.push("");
  for (const credential of credentials) {
    lines.push(`• ${credential.title} — ${credential.detail}`);
  }
  lines.push("");
  if (pricing.approved) {
    lines.push(
      "I am happy to send our rates, or to quote on a specific property or premises if you tell me the size and what is involved.",
    );
  } else {
    // No rate card has been approved, so the draft cannot imply one exists.
    lines.push(
      "If it would help, tell me the size of the property or premises and what is involved, and I will come back to you with a figure.",
    );
  }
  lines.push("");
  lines.push(
    "If you would rather I did not contact you again, just say so and I will remove you from our list straight away.",
  );
  lines.push("");
  lines.push("Kind regards,");
  lines.push("");
  lines.push(BUSINESS.name);
  lines.push(`${BUSINESS.phonePrimary} · ${BUSINESS.email}`);
  lines.push(BUSINESS.website);

  const reviewPoints: string[] = [
    "Read every sentence. If anything is not true of this organisation, delete it.",
    "Send it from your own mailbox, to one recipient. This system does not send it and cannot send in bulk.",
    "UK GDPR: an unsolicited approach to a business relies on legitimate interest. Honour an opt-out immediately — use Do not contact on this record when one arrives.",
  ];
  if (!pricing.approved) {
    reviewPoints.push(
      "No rate card is approved yet, so the draft does not quote a price. Do not add one until the rates in Pricing are signed off.",
    );
  }
  if (route.channel === "phone") {
    reviewPoints.push(
      "There is no email or contact form on record, so this is a script for a call rather than something to send.",
    );
  }
  if (prospect.flags.length > 0) {
    reviewPoints.push(
      `This record carries ${prospect.flags.length} flag${prospect.flags.length === 1 ? "" : "s"}. Resolve ${prospect.flags.length === 1 ? "it" : "them"} before you make contact.`,
    );
  }

  return {
    ready: true,
    blockers: [],
    draft: {
      channel: route.channel,
      destination: route.destination,
      subject,
      body: lines.join("\n"),
      facts_used: facts,
      review_points: reviewPoints,
    },
  };
}
