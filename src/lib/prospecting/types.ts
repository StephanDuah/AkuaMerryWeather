import type { ServiceType } from "@/lib/types";

/**
 * Lead intelligence and prospecting.
 *
 * A prospect is an organisation that MIGHT be a customer. It is not a lead.
 * A lead is someone who has contacted us. That distinction is enforced
 * throughout: a prospect only becomes a lead when it responds, and the
 * owner's report counts the two separately.
 *
 * Every field that matters carries provenance - where it came from, when,
 * and how confident we are. Nothing enters this system without a source.
 */

/* ------------------------------------------------------------------ *
 * Provenance
 * ------------------------------------------------------------------ */

export type SourceId =
  | "companies_house"
  | "openstreetmap"
  | "official_website"
  | "manual_csv"
  | "manual_entry"
  /** Adapters that exist but are not free. Never enabled in development. */
  | "future_paid";

/**
 * How much a source can be trusted on its own.
 * Section 29 of the brief: a low-confidence source must not produce a
 * high-priority prospect without verification.
 */
export type SourceReliability = "very_high" | "high" | "medium" | "low";

export const SOURCE_RELIABILITY: Record<SourceId, SourceReliability> = {
  companies_house: "very_high",
  official_website: "high",
  openstreetmap: "medium",
  manual_csv: "medium",
  manual_entry: "medium",
  future_paid: "low",
};

export const SOURCE_LABELS: Record<SourceId, string> = {
  companies_house: "Companies House",
  openstreetmap: "OpenStreetMap",
  official_website: "Official company website",
  manual_csv: "Manual CSV import",
  manual_entry: "Entered by hand",
  future_paid: "Paid data source",
};

/** One piece of evidence for one field. */
export interface Provenance {
  field: string;
  value: string;
  source: SourceId;
  source_url: string | null;
  collected_at: string;
  reliability: SourceReliability;
}

/* ------------------------------------------------------------------ *
 * Classification
 * ------------------------------------------------------------------ */

export type BusinessType =
  | "estate_agent"
  | "letting_agent"
  | "property_management"
  | "commercial_office"
  | "coworking_space"
  | "restaurant"
  | "retail"
  | "hospitality"
  | "short_let_management"
  | "landlord_operator"
  | "construction_property"
  | "other_business"
  | "irrelevant";

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  estate_agent: "Estate agent",
  letting_agent: "Letting agent",
  property_management: "Property management",
  commercial_office: "Commercial office",
  coworking_space: "Co-working space",
  restaurant: "Restaurant",
  retail: "Retail",
  hospitality: "Hotel / hospitality",
  short_let_management: "Airbnb / short-let management",
  landlord_operator: "Landlord / property operator",
  construction_property: "Construction / property company",
  other_business: "Other business",
  irrelevant: "Not relevant",
};

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

export type ProspectStatus =
  | "discovered"
  | "needs_verification"
  | "verified"
  | "potential_fit"
  | "high_priority"
  | "outreach_ready"
  | "contacted"
  | "responded"
  | "interested"
  | "qualified_lead"
  | "quote_requested"
  | "booking_opportunity"
  | "customer"
  | "not_suitable"
  | "do_not_contact";

export const PROSPECT_STATUSES: ProspectStatus[] = [
  "discovered",
  "needs_verification",
  "verified",
  "potential_fit",
  "high_priority",
  "outreach_ready",
  "contacted",
  "responded",
  "interested",
  "qualified_lead",
  "quote_requested",
  "booking_opportunity",
  "customer",
  "not_suitable",
  "do_not_contact",
];

/**
 * The point at which a prospect stops being a prospect and becomes a lead.
 * Before this, nobody has expressed interest - we merely think they might.
 */
export const LEAD_STATUSES_FROM_PROSPECT: ProspectStatus[] = [
  "responded",
  "interested",
  "qualified_lead",
  "quote_requested",
  "booking_opportunity",
  "customer",
];

export type Priority = "high" | "medium" | "low";

/** Every factor that fed the priority, so it is never a black box. */
export interface PriorityFactor {
  factor: string;
  met: boolean;
  weight: number;
  note: string;
}

export interface Qualification {
  priority: Priority;
  /** Sum of met factor weights, shown alongside the factors themselves. */
  score: number;
  max_score: number;
  factors: PriorityFactor[];
  /** Plain-English explanation the owner can read. */
  reasoning: string;
  /** Services this organisation could plausibly need, never "does need". */
  potential_services: ServiceType[];
  potential_fit: "high" | "medium" | "low" | "none";
}

/* ------------------------------------------------------------------ *
 * The prospect record
 * ------------------------------------------------------------------ */

export interface Prospect {
  id: string;
  created_at: string;
  updated_at: string;

  company_name: string;
  trading_name: string | null;
  business_type: BusinessType;

  website: string | null;
  /** Business contact routes only - never an individual's personal details. */
  email: string | null;
  phone: string | null;
  contact_form_url: string | null;

  address: string | null;
  postcode: string | null;
  borough: string | null;

  companies_house_number: string | null;
  companies_house_status: string | null;

  /** Every source that contributed, for a single deduplicated record. */
  sources: SourceId[];
  provenance: Provenance[];

  discovered_at: string;
  verified_at: string | null;
  last_checked_at: string | null;

  qualification: Qualification;
  status: ProspectStatus;

  /** Set when this prospect has become a real lead in the main system. */
  lead_id: string | null;

  /** Anything conflicting or doubtful, surfaced rather than resolved silently. */
  flags: string[];
  notes: string | null;

  /** Synthetic records for testing are never mixed with real ones. */
  is_test: boolean;

  campaign_id: string | null;
}

/* ------------------------------------------------------------------ *
 * Suppression
 * ------------------------------------------------------------------ */

export interface Suppression {
  id: string;
  created_at: string;
  /** Normalised domain, phone or company name this applies to. */
  identifier: string;
  identifier_type: "domain" | "email" | "phone" | "company_name" | "ch_number";
  reason: string;
  /** Who or what created it - the owner, or a rule. */
  created_by: string;
  source: string | null;
}

/* ------------------------------------------------------------------ *
 * Campaigns
 * ------------------------------------------------------------------ */

export interface Campaign {
  id: string;
  created_at: string;
  name: string;
  description: string;
  /** Which business types this campaign is hunting. */
  target_types: BusinessType[];
  /** London boroughs to cover, or empty for all. */
  boroughs: string[];
  /** Which adapters to use. */
  sources: SourceId[];
  enabled: boolean;
  last_run_at: string | null;
  /** Totals from the most recent run, for the owner's report. */
  last_run_summary: string | null;
}

/* ------------------------------------------------------------------ *
 * Adapter contract
 * ------------------------------------------------------------------ */

/**
 * What every source adapter returns. Deliberately minimal: adapters
 * discover, they do not classify or qualify. That happens once, centrally,
 * so behaviour cannot drift between sources.
 */
export interface ProspectCandidate {
  company_name: string;
  website: string | null;
  business_type_hint: BusinessType | null;
  address: string | null;
  postcode: string | null;
  borough: string | null;
  email: string | null;
  phone: string | null;
  companies_house_number: string | null;
  companies_house_status: string | null;
  source: SourceId;
  source_url: string | null;
  discovered_at: string;
  /** Anything the adapter noticed but could not resolve. */
  flags?: string[];
}

export interface SourceAdapter {
  id: SourceId;
  label: string;
  reliability: SourceReliability;
  /** False when credentials are missing or the source is paid. */
  available(): boolean;
  /** Why it is unavailable, shown in the dashboard. */
  unavailableReason(): string | null;
  search(options: {
    businessTypes: BusinessType[];
    borough?: string;
    limit: number;
  }): Promise<ProspectCandidate[]>;
}

export interface RunSummary {
  campaign: string;
  started_at: string;
  finished_at: string;
  sources_used: SourceId[];
  candidates_found: number;
  duplicates_merged: number;
  suppressed: number;
  new_prospects: number;
  updated_prospects: number;
  verified: number;
  potentially_inactive: number;
  needs_review: number;
  by_type: Record<string, number>;
  by_priority: Record<Priority, number>;
  errors: string[];
}
