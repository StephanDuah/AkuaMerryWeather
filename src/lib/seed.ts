import type { Database, PricingConfig, Settings } from "@/lib/types";

/**
 * Pricing configuration.
 *
 * Domestic cleaning carries Merry Cleaners' own published prices, taken from
 * Merry_Cleaners_Price_List.docx exactly as written. Those figures are used
 * verbatim rather than fitted to a formula: a straight-line fit to the list
 * was out by up to £17 on a three-bedroom deep clean, and a quote that does
 * not match the list the customer was shown is worse than no quote.
 *
 * Office and end of tenancy are NOT on that price list, so their figures are
 * still placeholders and both are marked unapproved. The agent collects the
 * details for those two and defers to a person, exactly as before. Approving
 * the card as a whole does not switch them on - see ServicePricing.approved.
 *
 * Nothing here is hard-coded into the quoting logic; the engine reads
 * whatever is stored, and the owner can change any of it in /admin/pricing.
 */
export const DEFAULT_PRICING: PricingConfig = {
  // The owner supplied a real price list, so the card is approved. Which
  // services that actually enables is decided per service below.
  approved: true,
  approved_at: "2026-09-25T00:00:00.000Z",
  approved_by: "Merry Cleaners price list (Merry_Cleaners_Price_List.docx)",
  currency: "GBP",
  vat_note: "All prices shown exclude VAT where applicable.",
  services: [
    {
      service_type: "office",
      label: "Office & Commercial Cleaning",
      // NOT on the supplied price list. Placeholders, kept only so the shape
      // of the record is complete; nothing here reaches a customer.
      approved: false,
      unapproved_reason:
        "The supplied price list covers domestic cleaning only. No office or commercial rates have been provided, so office enquiries are collected and passed to you rather than quoted.",
      tiers: [],
      base_price: 90,
      per_bedroom: 0,
      per_1000_sqft: 65,
      minimum_price: 120,
      range_spread: 0.12,
      base_hours: 2,
      hours_per_unit: 1.5,
    },
    {
      service_type: "end_of_tenancy",
      label: "End of Tenancy Cleaning",
      // Deliberately NOT priced from the deep clean list. The two are
      // different products: end of tenancy is worked to inventory-checkout
      // standard with the oven cleaned inside as standard, whereas the deep
      // clean list sells an oven clean as a £65 extra. Pricing one from the
      // other would undercharge every checkout job.
      approved: false,
      unapproved_reason:
        "The supplied price list has no end of tenancy rates. It is not the same as the deep clean: end of tenancy is worked to inventory standard with the oven done inside, which the deep clean charges £65 extra for. Send me your end of tenancy prices and I will load them.",
      tiers: [],
      base_price: 150,
      per_bedroom: 55,
      per_1000_sqft: 0,
      minimum_price: 180,
      range_spread: 0.12,
      base_hours: 4,
      hours_per_unit: 1.5,
    },
    {
      service_type: "domestic",
      label: "Domestic Cleaning",
      approved: true,
      unapproved_reason: null,
      // Merry Cleaners' published prices, verbatim. Hours and cleaner counts
      // are the ones on the list, so the diary reserves what the job needs.
      tiers: [
        {
          key: "regular",
          label: "Regular / maintenance clean",
          description:
            "An ongoing clean of your home, worked to a checklist agreed with you in advance.",
          frequency_note: "Weekly or fortnightly",
          price_by_bedrooms: [
            { bedrooms: 1, price: 95, hours: 2, cleaners: 1 },
            { bedrooms: 2, price: 125, hours: 3, cleaners: 1 },
            { bedrooms: 3, price: 155, hours: 3.5, cleaners: 1 },
            { bedrooms: 4, price: 195, hours: 4.5, cleaners: 1 },
            { bedrooms: 5, price: 240, hours: 5.5, cleaners: 1 },
          ],
        },
        {
          key: "deep",
          label: "Deep clean",
          description:
            "A thorough one-off clean, top to bottom, with a larger team on the bigger properties.",
          frequency_note: "One-off",
          price_by_bedrooms: [
            { bedrooms: 1, price: 200, hours: 3, cleaners: 1 },
            { bedrooms: 2, price: 295, hours: 5, cleaners: 2 },
            { bedrooms: 3, price: 395, hours: 6, cleaners: 2 },
            { bedrooms: 4, price: 520, hours: 8, cleaners: 3 },
            { bedrooms: 5, price: 650, hours: 10, cleaners: 3 },
          ],
        },
      ],
      // Unused while tiers are present; kept for a property outside the list.
      base_price: 60,
      per_bedroom: 20,
      per_1000_sqft: 0,
      minimum_price: 75,
      range_spread: 0.15,
      base_hours: 2,
      hours_per_unit: 0.75,
    },
  ],
  addons: [
    // The four upsells on Merry Cleaners' published price list, at the
    // prices it states. Anything not on that list has been removed rather
    // than left at a made-up figure.
    {
      key: "oven_deep_clean",
      label: "Oven deep clean",
      amount: 65,
      mode: "flat",
      applies_to: ["end_of_tenancy", "domestic"],
      description: "Full strip-down and degrease of a single domestic oven.",
    },
    {
      key: "carpet_clean_room",
      label: "Carpet clean (per room)",
      amount: 45,
      mode: "flat",
      applies_to: ["end_of_tenancy", "domestic", "office"],
      description: "Hot-water extraction, priced per room.",
    },
    {
      key: "balcony_terrace",
      label: "Balcony / terrace clean",
      amount: 40,
      mode: "flat",
      applies_to: ["end_of_tenancy", "domestic"],
      description: "Swept, washed down and cleared of debris.",
    },
    {
      key: "same_day",
      label: "Same-day / emergency booking",
      amount: 40,
      mode: "flat",
      applies_to: ["office", "end_of_tenancy", "domestic"],
      description:
        "A surcharge for a job brought forward to the same day, where a team is free.",
    },
  ],
  // Merry Cleaners' price list quotes one price across all London boroughs,
  // so every zone multiplier is 1. The zones are kept because they still
  // place a postcode inside or outside London, and because a future office
  // rate card may well want a central-London uplift.
  zones: [
    {
      key: "central",
      label: "Central London (Zone 1)",
      prefixes: [
        "EC1",
        "EC2",
        "EC3",
        "EC4",
        "WC1",
        "WC2",
        "W1",
        "SW1",
        "SE1",
        "E1W",
        "NW1",
      ],
      multiplier: 1,
    },
    {
      key: "inner",
      label: "Inner London (Zones 2-3)",
      prefixes: [
        "E1",
        "E2",
        "E3",
        "E5",
        "E8",
        "E9",
        "E14",
        "N1",
        "N4",
        "N5",
        "N7",
        "N16",
        "N19",
        "NW3",
        "NW5",
        "NW6",
        "NW8",
        "NW10",
        "SE4",
        "SE5",
        "SE8",
        "SE11",
        "SE14",
        "SE15",
        "SE16",
        "SE17",
        "SE22",
        "SW2",
        "SW3",
        "SW4",
        "SW5",
        "SW6",
        "SW7",
        "SW8",
        "SW9",
        "SW10",
        "SW11",
        "SW18",
        "W2",
        "W6",
        "W8",
        "W9",
        "W10",
        "W11",
        "W12",
        "W14",
      ],
      multiplier: 1,
    },
    {
      key: "outer",
      label: "Outer London",
      prefixes: [
        "BR",
        "CR",
        "DA",
        "EN",
        "HA",
        "IG",
        "KT",
        "RM",
        "SM",
        "TW",
        "UB",
        "WD",
      ],
      multiplier: 1.0,
    },
  ],
  default_zone_multiplier: 1,
  updated_at: new Date(0).toISOString(),
};

export const DEFAULT_SETTINGS: Settings = {
  email_auto_send: false,
  followup_1_minutes: 5,
  followup_2_hours: 36,
  business_hours: "Monday to Saturday, 08:00-18:00",
  booking_slots: ["morning", "afternoon", "evening"],
  capacity_per_slot: 2,
  retention_months: 24,
  updated_at: new Date(0).toISOString(),
};

const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
const daysAhead = (d: number) =>
  new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * Demonstration records so every screen in the admin dashboard has
 * something to show before a single real enquiry arrives.
 */
export function seedDatabase(): Database {
  return {
    pricing: DEFAULT_PRICING,
    settings: DEFAULT_SETTINGS,
    leads: [
      {
        id: "lead_demo_1",
        created_at: hoursAgo(3),
        updated_at: hoursAgo(3),
        name: "Priya Raman",
        email: "priya.raman@example.com",
        phone: "+44 7700 900111",
        address: "Unit 4, Mare Street",
        postcode: "E8 1EJ",
        property_type: "office",
        bedrooms: null,
        floor_area_sqft: 2400,
        service_type: "office",
        addons: ["carpet_clean_room"],
        preferred_date: daysAhead(6),
        segment: "business_office",
        source: "google",
        status: "quote_sent",
        quote_low: 280,
        quote_high: 355,
        notes: "Weekly contract enquiry for a 12-desk studio.",
        lawful_basis: "legitimate_interest",
        marketing_consent: true,
        consent_text: "Submitted the website quote form.",
        followup_stage: 0,
        next_followup_at: null,
        followup_paused: false,
      },
      {
        id: "lead_demo_2",
        created_at: hoursAgo(26),
        updated_at: hoursAgo(26),
        name: "Halliwell and Grove Lettings",
        email: "lettings@example.com",
        phone: "+44 7700 900222",
        address: "18 Clapham High Street",
        postcode: "SW4 7UR",
        property_type: "flat",
        bedrooms: 2,
        floor_area_sqft: null,
        service_type: "end_of_tenancy",
        addons: ["oven_deep_clean", "carpet_clean_room"],
        preferred_date: daysAhead(3),
        segment: "estate_agent",
        source: "estate_agent",
        status: "new",
        quote_low: 300,
        quote_high: 382,
        notes: "Managing agent, expects a checkout-standard clean.",
        lawful_basis: "legitimate_interest",
        marketing_consent: true,
        consent_text: "Submitted the website quote form.",
        followup_stage: 1,
        next_followup_at: new Date().toISOString(),
        followup_paused: false,
      },
      {
        id: "lead_demo_3",
        created_at: hoursAgo(50),
        updated_at: hoursAgo(50),
        name: "Daniel Okoye",
        email: "d.okoye@example.com",
        phone: "+44 7700 900333",
        address: "Flat 9, Fortis Green",
        postcode: "N2 9EL",
        property_type: "flat",
        bedrooms: 1,
        floor_area_sqft: null,
        service_type: "domestic",
        addons: [],
        preferred_date: null,
        segment: "homeowner",
        source: "website_chat",
        status: "follow_up",
        quote_low: 84,
        quote_high: 114,
        notes: "Fortnightly domestic clean, comparing providers.",
        lawful_basis: "legitimate_interest",
        marketing_consent: false,
        consent_text: null,
        followup_stage: 2,
        next_followup_at: null,
        followup_paused: false,
      },
    ],
    bookings: [
      {
        id: "booking_demo_1",
        created_at: hoursAgo(20),
        updated_at: hoursAgo(20),
        lead_id: "lead_demo_1",
        customer_name: "Priya Raman",
        email: "priya.raman@example.com",
        phone: "+44 7700 900111",
        address: "Unit 4, Mare Street",
        postcode: "E8 1EJ",
        service_type: "office",
        addons: ["carpet_clean_room"],
        date: daysAhead(6),
        slot: "evening",
        duration_hours: 4.5,
        price: 318,
        price_is_estimate: true,
        status: "confirmed",
        payment_status: "link_sent",
        payment_link: null,
        notes: "Access via the rear entrance after 18:30.",
      },
    ],
    communications: [
      {
        id: "comm_demo_1",
        created_at: hoursAgo(3),
        lead_id: "lead_demo_1",
        booking_id: null,
        channel: "chat",
        direction: "inbound",
        status: "logged",
        subject: null,
        body: "Enquiry captured by the website assistant.",
        template: null,
        to_address: null,
        sent_at: null,
      },
    ],
    agent_actions: [],
    escalations: [
      {
        id: "esc_demo_1",
        created_at: hoursAgo(2),
        resolved_at: null,
        lead_id: null,
        booking_id: null,
        communication_id: null,
        reason: "out_of_area",
        summary: "Enquiry from outside Greater London (Watford, WD17)",
        detail:
          "A visitor asked about an end of tenancy clean in Watford. The assistant politely declined and offered to take details for a callback.",
        status: "open",
        draft_subject: null,
        draft_body: null,
        draft_to: null,
      },
    ],
    ad_drafts: [],
    prospects: [],
    suppressions: [],
    campaigns: [],
  };
}

/**
 * Brings a stored rate card up to the current shape.
 *
 * A configuration saved before a field existed does not grow that field when
 * the code changes - it is JSON sitting in a database. Reading one straight
 * into the engine crashed the quote endpoint with "cannot read properties of
 * undefined", because every service written before tiers existed has no
 * `tiers` array.
 *
 * So every read goes through here. Missing fields are filled from the
 * defaults above, and anything the owner has actually set is left alone. That
 * means no database migration to run, and a deployment cannot be broken by a
 * configuration that predates a release.
 */
export function normalisePricing(stored: Partial<PricingConfig> | null): PricingConfig {
  if (!stored || typeof stored !== "object") return DEFAULT_PRICING;

  const services = DEFAULT_PRICING.services.map((fallback) => {
    const saved = (stored.services ?? []).find(
      (s) => s?.service_type === fallback.service_type,
    );
    if (!saved) return fallback;
    return {
      ...fallback,
      ...saved,
      // Fields added after this card may have been saved.
      approved: typeof saved.approved === "boolean" ? saved.approved : fallback.approved,
      unapproved_reason:
        saved.unapproved_reason === undefined
          ? fallback.unapproved_reason
          : saved.unapproved_reason,
      tiers: Array.isArray(saved.tiers) ? saved.tiers : fallback.tiers,
    };
  });

  // Any service the owner added that the defaults do not know about.
  for (const saved of stored.services ?? []) {
    if (!saved?.service_type) continue;
    if (services.some((s) => s.service_type === saved.service_type)) continue;
    services.push({
      ...saved,
      approved: saved.approved ?? false,
      unapproved_reason: saved.unapproved_reason ?? null,
      tiers: Array.isArray(saved.tiers) ? saved.tiers : [],
    } as PricingConfig["services"][number]);
  }

  return {
    ...DEFAULT_PRICING,
    ...stored,
    services,
    addons: Array.isArray(stored.addons) ? stored.addons : DEFAULT_PRICING.addons,
    zones: Array.isArray(stored.zones) ? stored.zones : DEFAULT_PRICING.zones,
    default_zone_multiplier:
      typeof stored.default_zone_multiplier === "number"
        ? stored.default_zone_multiplier
        : DEFAULT_PRICING.default_zone_multiplier,
  };
}
