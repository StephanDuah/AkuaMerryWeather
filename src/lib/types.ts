/**
 * Shared domain types for Merry Cleaners.
 * Every record the business stores is described here so the data layer,
 * the API routes and the admin dashboard agree on one shape.
 */

export type ServiceType = "office" | "end_of_tenancy" | "domestic";

export const SERVICE_TYPES: ServiceType[] = [
  "office",
  "end_of_tenancy",
  "domestic",
];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  office: "Office & Commercial Cleaning",
  end_of_tenancy: "End of Tenancy Cleaning",
  domestic: "Domestic Cleaning",
};

export type PropertyType =
  | "flat"
  | "house"
  | "office"
  | "hmo"
  | "short_let"
  | "other";

/**
 * Lead lifecycle. Transparent named states rather than an opaque numeric
 * score, so the owner can always see why a lead sits where it does. The
 * criteria for each are documented in BUSINESS_RULES.md.
 */
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "quote_requested"
  | "quote_sent"
  | "booking_pending"
  | "booked"
  | "follow_up"
  | "human_review"
  | "won"
  | "lost"
  | "unqualified";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "quote_requested",
  "quote_sent",
  "booking_pending",
  "booked",
  "follow_up",
  "human_review",
  "won",
  "lost",
  "unqualified",
];

/** Statuses that take a lead out of the automated follow-up sequence. */
export const CLOSED_STATUSES: LeadStatus[] = [
  "booked",
  "won",
  "lost",
  "unqualified",
  "human_review",
];

export type LeadSource =
  | "google"
  | "yell"
  | "checkatrade"
  | "referral"
  | "website_chat"
  | "website_form"
  | "phone"
  | "whatsapp"
  | "email"
  | "estate_agent"
  /** Discovered by the prospecting agent and confirmed to have responded. */
  | "prospecting"
  | "other";

export const LEAD_SOURCES: LeadSource[] = [
  "google",
  "yell",
  "checkatrade",
  "referral",
  "website_chat",
  "website_form",
  "phone",
  "whatsapp",
  "email",
  "estate_agent",
  "prospecting",
  "other",
];

export type CustomerSegment =
  | "estate_agent"
  | "business_office"
  | "landlord"
  | "airbnb_host"
  | "homeowner"
  | "tenant"
  | "unknown";

export interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  property_type: PropertyType | null;
  bedrooms: number | null;
  /** Square feet, used for office quotes. */
  floor_area_sqft: number | null;
  service_type: ServiceType | null;
  addons: string[];
  preferred_date: string | null;
  segment: CustomerSegment;
  source: LeadSource;
  status: LeadStatus;
  quote_low: number | null;
  quote_high: number | null;
  notes: string | null;
  /** UK GDPR: recorded lawful basis and consent for marketing follow-up. */
  lawful_basis: "contract" | "legitimate_interest" | "consent";
  marketing_consent: boolean;
  consent_text: string | null;
  /** Follow-up automation bookkeeping. */
  followup_stage: 0 | 1 | 2;
  next_followup_at: string | null;
  followup_paused: boolean;
}

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled";

export type PaymentStatus =
  | "unpaid"
  | "link_sent"
  | "paid"
  | "refunded"
  | "not_applicable";

export interface Booking {
  id: string;
  created_at: string;
  updated_at: string;
  lead_id: string | null;
  customer_name: string;
  email: string | null;
  phone: string | null;
  address: string;
  postcode: string;
  service_type: ServiceType;
  addons: string[];
  /** ISO date (YYYY-MM-DD) and a slot key such as "morning". */
  date: string;
  slot: string;
  duration_hours: number;
  /** Null when the rate card is unapproved - the team confirms the figure. */
  price: number | null;
  price_is_estimate: boolean;
  status: BookingStatus;
  payment_status: PaymentStatus;
  payment_link: string | null;
  notes: string | null;
}

export type CommunicationChannel = "email" | "whatsapp" | "chat" | "phone" | "system";
export type CommunicationDirection = "inbound" | "outbound";
export type CommunicationStatus = "logged" | "draft" | "queued" | "sent" | "failed";

export interface Communication {
  id: string;
  created_at: string;
  lead_id: string | null;
  booking_id: string | null;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  status: CommunicationStatus;
  subject: string | null;
  body: string;
  /** e.g. "followup_1", "quote_reply", "inbound_email" */
  template: string | null;
  to_address: string | null;
  sent_at: string | null;
}

export type EscalationReason =
  | "complaint"
  | "payment"
  | "refund"
  | "out_of_area"
  | "out_of_scope"
  | "excluded_sector"
  | "uncertain"
  | "email_approval"
  | "manual";

export type EscalationStatus = "open" | "resolved";

export interface Escalation {
  id: string;
  created_at: string;
  resolved_at: string | null;
  lead_id: string | null;
  booking_id: string | null;
  communication_id: string | null;
  reason: EscalationReason;
  summary: string;
  detail: string;
  status: EscalationStatus;
  /** Present when the item is an AI-drafted reply awaiting approval. */
  draft_subject: string | null;
  draft_body: string | null;
  draft_to: string | null;
}

/** Categories the inbound email classifier may return. */
export type EmailCategory =
  | "enquiry"
  | "quote_request"
  | "booking_request"
  | "complaint"
  | "existing_customer"
  | "cancellation"
  | "payment_question"
  | "other";

export const ALWAYS_HUMAN_CATEGORIES: EmailCategory[] = [
  "complaint",
  "payment_question",
];


/* ------------------------------------------------------------------ *
 * Agent action audit log
 * ------------------------------------------------------------------ */

export type AgentChannel = "chat" | "email" | "whatsapp" | "system" | "test";

export type AgentOutcome = "ok" | "refused" | "escalated" | "error";

/**
 * One row per tool the agent invoked. This is the audit trail: what was
 * asked, which tool ran, what it decided, and whether a human was pulled in.
 */
export interface AgentAction {
  id: string;
  created_at: string;
  /** Groups the actions taken within a single conversation turn. */
  trace_id: string;
  channel: AgentChannel;
  tool: string;
  /** Redacted input - never store raw personal data beyond what the lead holds. */
  summary: string;
  outcome: AgentOutcome;
  lead_id: string | null;
  booking_id: string | null;
  /** Which model/provider produced this, or "rules" for deterministic paths. */
  actor: string;
  duration_ms: number | null;
  error: string | null;
}

export interface AdDraft {
  id: string;
  created_at: string;
  channel: "google_ads" | "outreach_email" | "referral" | "other";
  service_type: ServiceType | null;
  audience: string;
  title: string;
  body: string;
}

/* ------------------------------------------------------------------ *
 * Pricing configuration (editable from /admin/pricing, never hard-coded)
 * ------------------------------------------------------------------ */

/**
 * One row of a published price list: a size, and what the business charges
 * for it. Exact figures, used verbatim rather than fitted to a formula.
 */
export interface BedroomPrice {
  bedrooms: number;
  price: number;
  /** Hours on site, as published. */
  hours: number;
  /** How many cleaners the published list allocates to that size. */
  cleaners: number;
}

/**
 * A variant of a service with its own price list - for example a regular
 * maintenance clean and a one-off deep clean of the same home.
 */
export interface ServiceTier {
  key: string;
  label: string;
  description: string;
  /** Exact published prices. Largest entry is the biggest size we quote. */
  price_by_bedrooms: BedroomPrice[];
  /** Shown to the customer alongside the price. */
  frequency_note: string;
}

export interface ServicePricing {
  service_type: ServiceType;
  label: string;
  /**
   * Whether THIS service may be quoted to a customer.
   *
   * Separate from the rate card's own approval flag because a business can
   * easily have real prices for one service and none for another. Merry
   * Cleaners supplied a price list covering domestic cleaning only, so
   * domestic quotes while office and end of tenancy keep deferring to a
   * person - rather than the whole rate card being held back, or placeholder
   * figures reaching a customer.
   */
  approved: boolean;
  /** Why it is not approved, shown to the owner in /admin/pricing. */
  unapproved_reason: string | null;
  /**
   * Published prices by size. When this is set the engine uses it verbatim
   * and ignores the formula below, because a business's own price list is
   * the price - not something to approximate. A straight-line fit to Merry
   * Cleaners' list was out by up to £17 on a 3-bedroom deep clean.
   */
  tiers: ServiceTier[];
  /** Callout/base charge applied to every job of this type. */
  base_price: number;
  /** Charged per bedroom (domestic / end of tenancy). */
  per_bedroom: number;
  /** Charged per 1000 sq ft (office). */
  per_1000_sqft: number;
  /** Minimum we will ever quote for this service. */
  minimum_price: number;
  /** Quote range is base estimate -/+ this fraction, e.g. 0.1 = +/-10%. */
  range_spread: number;
  /** Rough hours on site, used to size booking slots. */
  base_hours: number;
  hours_per_unit: number;
}

export interface AddonPricing {
  key: string;
  label: string;
  /** Flat amount added, or a multiplier when mode is "multiplier". */
  amount: number;
  mode: "flat" | "multiplier";
  applies_to: ServiceType[];
  description: string;
}

export interface ZonePricing {
  key: string;
  label: string;
  /** Outward postcode prefixes, e.g. ["EC", "WC", "W1"]. */
  prefixes: string[];
  /** Multiplier applied to the whole job price. */
  multiplier: number;
}

export interface PricingConfig {
  /**
   * When false, the agent must NOT state a price. It collects the details
   * and tells the customer a team member will confirm. Defaults to false so
   * placeholder rates can never reach a customer as a quotation.
   */
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  currency: "GBP";
  vat_note: string;
  services: ServicePricing[];
  addons: AddonPricing[];
  zones: ZonePricing[];
  /** Applied when a postcode is inside London but matches no zone. */
  default_zone_multiplier: number;
  updated_at: string;
}

export interface Settings {
  /** false = AI drafts land in the escalations inbox for approval (default). */
  email_auto_send: boolean;
  /** Minutes after an unconverted quote before the first follow-up. */
  followup_1_minutes: number;
  /** Hours after the first follow-up before the check-in nudge. */
  followup_2_hours: number;
  business_hours: string;
  booking_slots: string[];
  /** Maximum simultaneous jobs per slot (prevents double-booking). */
  capacity_per_slot: number;
  /** How long lead data is kept before the retention sweep flags it. */
  retention_months: number;
  updated_at: string;
}

/** Prospecting records live in their own tables - see src/lib/prospecting. */
export type ProspectingTable = "prospects" | "suppressions" | "campaigns";

export interface Database {
  leads: Lead[];
  bookings: Booking[];
  communications: Communication[];
  escalations: Escalation[];
  agent_actions: AgentAction[];
  ad_drafts: AdDraft[];
  prospects: unknown[];
  suppressions: unknown[];
  campaigns: unknown[];
  pricing: PricingConfig;
  settings: Settings;
}

export type TableName =
  | "leads"
  | "bookings"
  | "communications"
  | "escalations"
  | "agent_actions"
  | "ad_drafts"
  | "prospects"
  | "suppressions"
  | "campaigns";
