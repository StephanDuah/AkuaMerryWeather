import type { ServiceType } from "@/lib/types";
import {
  SOURCE_RELIABILITY,
  type BusinessType,
  type Priority,
  type PriorityFactor,
  type Prospect,
  type ProspectCandidate,
  type Qualification,
  type SourceId,
} from "./types";

/**
 * Classification, service matching and qualification.
 *
 * Two principles run through this file.
 *
 * First, **nothing is asserted that has not been established**. A prospect
 * has a "potential fit"; it never "needs cleaning". We have no idea whether
 * they need cleaning - we know they are the kind of organisation that often
 * does.
 *
 * Second, **priority is never a black box**. Every factor that fed the
 * decision is returned alongside it, with its weight and whether it was met,
 * so the owner can disagree with the reasoning rather than just the answer.
 */

/* ------------------------------------------------------------------ *
 * Classification
 * ------------------------------------------------------------------ */

const NAME_SIGNALS: { type: BusinessType; patterns: RegExp[] }[] = [
  { type: "property_management", patterns: [/\bproperty management\b/i, /\bblock management\b/i, /\bmanaging agent/i, /\bestate management\b/i] },
  { type: "short_let_management", patterns: [/\bshort[- ]?let/i, /\bserviced (apartment|accommodation)/i, /\bairbnb\b/i, /\bholiday let/i] },
  { type: "letting_agent", patterns: [/\blettings?\b/i] },
  { type: "estate_agent", patterns: [/\bestate agent/i, /\bestates?\b/i, /\bproperty (sales|services)\b/i] },
  { type: "coworking_space", patterns: [/\bco-?working\b/i, /\bworkspace\b/i, /\bbusiness centre\b/i] },
  { type: "construction_property", patterns: [/\bdevelopments?\b/i, /\bconstruction\b/i, /\bbuilders?\b/i] },
  { type: "landlord_operator", patterns: [/\bproperty (holdings|investments|group)\b/i] },
  { type: "hospitality", patterns: [/\bhotel\b/i, /\bguest house\b/i, /\bhostel\b/i] },
  { type: "restaurant", patterns: [/\brestaurant\b/i, /\bcaf[eé]\b/i, /\bbistro\b/i] },
];

/** Organisations the business has decided never to serve. */
const EXCLUDED_PATTERNS: RegExp[] = [
  /\bschool\b/i, /\bacademy\b/i, /\bcollege\b/i, /\buniversity\b/i,
  /\bnursery\b/i, /\bhospital\b/i, /\bclinic\b/i, /\bsurgery\b/i,
  /\bcare home\b/i, /\bnursing home\b/i, /\bhospice\b/i, /\bnhs\b/i,
];

export function isExcludedSector(text: string): boolean {
  return EXCLUDED_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Decides what an organisation is. Hints from adapters are trusted in
 * order of source reliability; the company name is the fallback.
 */
export function classify(candidate: {
  company_name: string;
  business_type_hint: BusinessType | null;
  source: SourceId;
  website?: string | null;
}): BusinessType {
  if (isExcludedSector(candidate.company_name)) return "irrelevant";

  // A hint from an authoritative source (SIC code, OSM office tag) wins.
  if (candidate.business_type_hint) return candidate.business_type_hint;

  for (const signal of NAME_SIGNALS) {
    if (signal.patterns.some((pattern) => pattern.test(candidate.company_name))) {
      return signal.type;
    }
  }

  return "other_business";
}

/* ------------------------------------------------------------------ *
 * Service matching
 * ------------------------------------------------------------------ */

/**
 * Which of the three services an organisation of this kind could
 * plausibly need, and why. The reason is shown to the owner verbatim.
 */
const SERVICE_FIT: Record<
  BusinessType,
  { services: ServiceType[]; fit: "high" | "medium" | "low" | "none"; reason: string }
> = {
  estate_agent: {
    services: ["end_of_tenancy", "office"],
    fit: "high",
    reason:
      "Estate agents handle property turnarounds between tenancies and also run their own offices.",
  },
  letting_agent: {
    services: ["end_of_tenancy", "office"],
    fit: "high",
    reason:
      "Letting agents manage checkouts, which is exactly what end of tenancy cleaning is for.",
  },
  property_management: {
    services: ["end_of_tenancy", "office"],
    fit: "high",
    reason:
      "Property managers handle tenancy changes and communal areas across a portfolio.",
  },
  short_let_management: {
    services: ["end_of_tenancy", "domestic"],
    fit: "high",
    reason:
      "Short-let operators need turnaround cleaning between guests, often at short notice.",
  },
  landlord_operator: {
    services: ["end_of_tenancy", "domestic"],
    fit: "high",
    reason: "Landlords need properties cleaned between tenancies.",
  },
  commercial_office: {
    services: ["office"],
    fit: "medium",
    reason: "Offices typically hold a recurring cleaning contract.",
  },
  coworking_space: {
    services: ["office"],
    fit: "high",
    reason:
      "Co-working spaces are cleaned daily and presentation is central to what they sell.",
  },
  construction_property: {
    services: ["end_of_tenancy", "office"],
    fit: "medium",
    reason:
      "Property developers need units cleaned before handover, and run their own offices.",
  },
  hospitality: {
    services: ["office"],
    fit: "low",
    reason:
      "Hotels usually employ in-house housekeeping, so the fit is limited to back-of-house or contract overflow.",
  },
  restaurant: {
    services: ["office"],
    fit: "low",
    reason:
      "Restaurants have specialist kitchen cleaning needs largely outside what we offer.",
  },
  retail: {
    services: ["office"],
    fit: "low",
    reason: "Retail units sometimes contract out front-of-house cleaning.",
  },
  other_business: {
    services: ["office"],
    fit: "low",
    reason: "Any business with premises may hold a cleaning contract.",
  },
  irrelevant: {
    services: [],
    fit: "none",
    reason: "Outside the sectors Merry Cleaners serves.",
  },
};

export function serviceFit(type: BusinessType) {
  return SERVICE_FIT[type];
}

/* ------------------------------------------------------------------ *
 * Qualification
 * ------------------------------------------------------------------ */

export interface QualifyInput {
  company_name: string;
  business_type: BusinessType;
  borough: string | null;
  postcode: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  contact_form_url: string | null;
  sources: SourceId[];
  companies_house_status: string | null;
  website_reachable?: boolean;
  inactive_signals?: string[];
}

/**
 * Works out priority from named factors. The factors, their weights and
 * whether each was met are all returned, so the owner sees the arithmetic.
 */
export function qualify(input: QualifyInput): Qualification {
  const fit = SERVICE_FIT[input.business_type];

  const bestReliability = input.sources
    .map((source) => SOURCE_RELIABILITY[source])
    .sort((a, b) => {
      const order = { very_high: 0, high: 1, medium: 2, low: 3 };
      return order[a] - order[b];
    })[0];

  const hasContact = Boolean(
    input.email || input.phone || input.contact_form_url,
  );
  const inactive = input.inactive_signals ?? [];
  const dissolved =
    input.companies_house_status !== null &&
    input.companies_house_status !== "active";

  const factors: PriorityFactor[] = [
    {
      factor: "Operates in London",
      met: Boolean(input.borough),
      weight: 25,
      note: input.borough
        ? `Placed in ${input.borough}`
        : "No London borough could be established",
    },
    {
      factor: "Organisation type we serve",
      met: fit.fit === "high" || fit.fit === "medium",
      weight: 20,
      note: fit.reason,
    },
    {
      factor: "Strong service fit",
      met: fit.fit === "high",
      weight: 15,
      note:
        fit.fit === "high"
          ? "Regular, repeatable cleaning need"
          : `Fit assessed as ${fit.fit}`,
    },
    {
      factor: "Business contact route available",
      met: hasContact,
      weight: 15,
      note: hasContact
        ? "A published business email, telephone or contact form exists"
        : "No public business contact route found",
    },
    {
      factor: "Official website confirmed",
      met: Boolean(input.website) && input.website_reachable !== false,
      weight: 10,
      note: input.website
        ? input.website_reachable === false
          ? "Website did not respond"
          : "Website present"
        : "No website known",
    },
    {
      factor: "Corroborated by an authoritative source",
      met: bestReliability === "very_high" || bestReliability === "high",
      weight: 10,
      note: `Best source reliability: ${(bestReliability ?? "low").replace(/_/g, " ")}`,
    },
    {
      factor: "Appears to be actively trading",
      met: !dissolved && inactive.length === 0,
      weight: 5,
      note: dissolved
        ? `Companies House status is ${input.companies_house_status}`
        : inactive.length
          ? inactive.join("; ")
          : "No signals of inactivity",
    },
  ];

  const score = factors.reduce((sum, f) => sum + (f.met ? f.weight : 0), 0);
  const max = factors.reduce((sum, f) => sum + f.weight, 0);

  // A low-reliability source alone can never produce a high priority.
  const unverified = bestReliability === "low" || bestReliability === "medium";

  let priority: Priority;
  if (fit.fit === "none" || !input.borough) {
    priority = "low";
  } else if (score >= 75 && !unverified) {
    priority = "high";
  } else if (score >= 75 && unverified) {
    priority = "medium";
  } else if (score >= 50) {
    priority = "medium";
  } else {
    priority = "low";
  }

  const met = factors.filter((f) => f.met).map((f) => f.factor.toLowerCase());
  const missed = factors.filter((f) => !f.met).map((f) => f.factor.toLowerCase());

  const reasoning = [
    `Assessed as ${priority} priority (${score} of ${max}).`,
    met.length ? `In its favour: ${met.join(", ")}.` : "",
    missed.length ? `Against: ${missed.join(", ")}.` : "",
    unverified && score >= 75
      ? "Held at medium because it has not yet been corroborated by an authoritative source."
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    priority,
    score,
    max_score: max,
    factors,
    reasoning,
    potential_services: fit.services,
    potential_fit: fit.fit,
  };
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

/**
 * Where a prospect sits in the pipeline, based only on what is known.
 * Note what is absent: nothing here can produce "interested" or
 * "qualified_lead". Those require the prospect to respond, which happens in
 * the customer-facing system, not here.
 */
export function initialStatus(
  qualification: Qualification,
  input: QualifyInput,
): Prospect["status"] {
  if (qualification.potential_fit === "none") return "not_suitable";
  if (!input.borough) return "needs_verification";

  const dissolved =
    input.companies_house_status !== null &&
    input.companies_house_status !== "active";
  if (dissolved || (input.inactive_signals ?? []).length > 0) {
    return "needs_verification";
  }

  const verified = input.sources.some(
    (source) => source === "companies_house" || source === "official_website",
  );
  const hasContact = Boolean(input.email || input.phone || input.contact_form_url);

  if (verified && hasContact && qualification.priority === "high") {
    return "outreach_ready";
  }
  if (verified && hasContact) return "potential_fit";
  if (verified) return "verified";
  return "needs_verification";
}

/** Candidate → the fields qualification needs. */
export function toQualifyInput(
  candidate: ProspectCandidate,
  businessType: BusinessType,
): QualifyInput {
  return {
    company_name: candidate.company_name,
    business_type: businessType,
    borough: candidate.borough,
    postcode: candidate.postcode,
    website: candidate.website,
    email: candidate.email,
    phone: candidate.phone,
    contact_form_url: null,
    sources: [candidate.source],
    companies_house_status: candidate.companies_house_status,
  };
}
