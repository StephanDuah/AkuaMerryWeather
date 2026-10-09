import type { PricingConfig, ServiceType } from "@/lib/types";
import { checkLondon, outwardCode } from "@/lib/postcode";

/**
 * The pricing engine.
 *
 * Every number it uses comes from the stored PricingConfig, which the
 * owner edits at /admin/pricing. The engine never invents a figure: if it
 * lacks the information it needs, it says so and the caller escalates to
 * a human instead of quoting.
 */

export interface QuoteInput {
  service_type: ServiceType;
  postcode: string;
  bedrooms?: number | null;
  floor_area_sqft?: number | null;
  addons?: string[];
  /**
   * Which variant of the service, where one exists - a regular maintenance
   * clean or a one-off deep clean. Defaults to the first tier on the rate
   * card, which is the everyday one.
   */
  tier?: string | null;
}

export interface QuoteLineItem {
  label: string;
  amount: number;
  kind: "base" | "size" | "addon" | "zone" | "minimum";
}

export interface QuoteResult {
  ok: true;
  service_type: ServiceType;
  service_label: string;
  currency: "GBP";
  /** Midpoint estimate before the range is applied. */
  estimate: number;
  low: number;
  high: number;
  duration_hours: number;
  zone_key: string;
  zone_label: string;
  zone_multiplier: number;
  /** True when the postcode area straddles the Greater London boundary. */
  zone_needs_confirmation: boolean;
  line_items: QuoteLineItem[];
  addons: string[];
  /** Which variant was priced, when the service has more than one. */
  tier_key: string | null;
  tier_label: string | null;
  /** True when the figure came from the published list rather than a formula. */
  from_price_list: boolean;
  vat_note: string;
  disclaimer: string;
}

export interface QuoteRefusal {
  ok: false;
  /** Machine-readable reason, used to decide whether to escalate. */
  reason:
    | "unknown_service"
    | "missing_postcode"
    | "outside_london"
    | "missing_size"
    | "invalid_size"
    | "size_not_on_price_list"
    | "pricing_not_approved";
  message: string;
  /** Fields the customer still needs to supply. */
  missing: string[];
}

/**
 * Shown with a price taken straight from the business's own list. It is a
 * price, not an estimate, so it does not hedge - but it still allows for a
 * property that turns out not to match what was described.
 */
export const PRICE_LIST_DISCLAIMER =
  "This is our published price for a property of this size. If the property " +
  "turns out to be materially different from the description, we will agree " +
  "any change with you before we start.";

export const QUOTE_DISCLAIMER =
  "This is an estimate based on the details provided. The final price is " +
  "confirmed by our team once we have reviewed the property and scope.";

export function resolveZone(pricing: PricingConfig, postcode: string) {
  const outward = outwardCode(postcode);
  if (!outward) {
    return {
      key: "unknown",
      label: "Unrecognised postcode",
      multiplier: pricing.default_zone_multiplier,
      matched: false,
    };
  }
  // Longest prefix wins, so "SW1" beats "SW" and "EC1" beats "E".
  let best: { key: string; label: string; multiplier: number; length: number } | null =
    null;
  for (const zone of pricing.zones) {
    for (const prefix of zone.prefixes) {
      const p = prefix.toUpperCase();
      if (outward.startsWith(p) && (!best || p.length > best.length)) {
        best = {
          key: zone.key,
          label: zone.label,
          multiplier: zone.multiplier,
          length: p.length,
        };
      }
    }
  }
  if (best) {
    return {
      key: best.key,
      label: best.label,
      multiplier: best.multiplier,
      matched: true,
    };
  }
  return {
    key: "london_default",
    label: "Greater London (standard rate)",
    multiplier: pricing.default_zone_multiplier,
    matched: false,
  };
}

const round = (value: number) => Math.round(value);

export const UNAPPROVED_PRICING_MESSAGE =
  "I have everything I need for your quote. Our rates are confirmed by a " +
  "member of the team rather than quoted automatically, so they will come " +
  "back to you shortly with the figure.";

export interface QuoteOptions {
  /**
   * Set only for internal, owner-facing calculations. Customer-facing paths
   * must leave this false so unapproved placeholder rates can never be
   * presented as a quotation. See BUSINESS_RULES.md.
   */
  allowUnapproved?: boolean;
}

export function calculateQuote(
  input: QuoteInput,
  pricing: PricingConfig,
  options: QuoteOptions = {},
): QuoteResult | QuoteRefusal {
  const service = pricing.services.find(
    (s) => s.service_type === input.service_type,
  );
  if (!service) {
    return {
      ok: false,
      reason: "unknown_service",
      message:
        "We offer office cleaning, end of tenancy cleaning and domestic cleaning only.",
      missing: ["service_type"],
    };
  }

  // Whether this particular service may be quoted. A rate card can cover one
  // service and not another; approving the card as a whole must not switch on
  // a service whose figures are still placeholders.
  const serviceApproved = pricing.approved && service.approved;

  if (!input.postcode || !input.postcode.trim()) {
    return {
      ok: false,
      reason: "missing_postcode",
      message: "We price by London postcode, so we need the postcode first.",
      missing: ["postcode"],
    };
  }

  const london = checkLondon(input.postcode);
  if (!london.inLondon) {
    return {
      ok: false,
      reason: "outside_london",
      message:
        "We currently serve Greater London only, so we are not able to quote for this address.",
      missing: [],
    };
  }

  const isOffice = input.service_type === "office";

  /* ---- published price list, where the business has given us one ------ *
   * Used verbatim. A straight-line fit to Merry Cleaners' own list was out
   * by up to £17, and a quote that does not match the list the customer was
   * shown is worse than no quote at all.                                  */
  const tier =
    service.tiers.length > 0
      ? service.tiers.find((t) => t.key === input.tier) ?? service.tiers[0]
      : null;

  if (tier) {
    const bedrooms = input.bedrooms ?? null;
    if (bedrooms === null || bedrooms === undefined) {
      return {
        ok: false,
        reason: "missing_size",
        message: "To price this clean we need the number of bedrooms.",
        missing: ["bedrooms"],
      };
    }

    const row = tier.price_by_bedrooms.find((r) => r.bedrooms === bedrooms);
    if (!row) {
      const sizes = tier.price_by_bedrooms.map((r) => r.bedrooms);
      const largest = Math.max(...sizes);
      return {
        ok: false,
        reason: "size_not_on_price_list",
        message:
          bedrooms > largest
            ? `Our published prices run up to ${largest} bedrooms. For a property of that size we prepare a tailored quote, and a member of the team will come back to you with it shortly.`
            : "We prepare a tailored quote for a property of that size, and a member of the team will come back to you shortly.",
        missing: [],
      };
    }

    const listed: QuoteLineItem[] = [
      {
        label: `${tier.label}, ${bedrooms} bedroom${bedrooms === 1 ? "" : "s"}`,
        amount: row.price,
        kind: "base",
      },
    ];

    let total = row.price;
    const chosen: string[] = [];
    for (const key of input.addons ?? []) {
      const addon = pricing.addons.find((a) => a.key === key);
      if (!addon || !addon.applies_to.includes(input.service_type)) continue;
      chosen.push(addon.key);
      const amount =
        addon.mode === "flat" ? addon.amount : total * (addon.amount - 1);
      total += amount;
      listed.push({ label: addon.label, amount, kind: "addon" });
    }

    const listZone = resolveZone(pricing, input.postcode);
    if (listZone.multiplier !== 1) {
      const uplift = total * (listZone.multiplier - 1);
      total += uplift;
      listed.push({ label: `${listZone.label} adjustment`, amount: uplift, kind: "zone" });
    }

    if (!serviceApproved && !options.allowUnapproved) {
      return {
        ok: false,
        reason: "pricing_not_approved",
        message: UNAPPROVED_PRICING_MESSAGE,
        missing: [],
      };
    }

    // A published price is exact, so there is no range around it.
    return {
      ok: true,
      service_type: input.service_type,
      service_label: service.label,
      currency: "GBP",
      estimate: round(total),
      low: round(total),
      high: round(total),
      duration_hours: row.hours,
      zone_key: listZone.key,
      zone_label: listZone.label,
      zone_multiplier: listZone.multiplier,
      zone_needs_confirmation: !london.certain || !listZone.matched,
      line_items: listed.map((item) => ({
        ...item,
        amount: Math.round(item.amount * 100) / 100,
      })),
      addons: chosen,
      tier_key: tier.key,
      tier_label: tier.label,
      from_price_list: true,
      vat_note: pricing.vat_note,
      disclaimer: PRICE_LIST_DISCLAIMER,
    };
  }

  const lineItems: QuoteLineItem[] = [
    { label: `${service.label} base charge`, amount: service.base_price, kind: "base" },
  ];

  let units = 0;
  if (isOffice) {
    const sqft = input.floor_area_sqft ?? 0;
    if (!sqft) {
      return {
        ok: false,
        reason: "missing_size",
        message:
          "To price an office clean we need the approximate floor area in square feet.",
        missing: ["floor_area_sqft"],
      };
    }
    if (sqft < 100 || sqft > 100000) {
      return {
        ok: false,
        reason: "invalid_size",
        message:
          "That floor area is outside the range we can quote automatically. A member of the team will confirm the price.",
        missing: [],
      };
    }
    units = sqft / 1000;
    lineItems.push({
      label: `Floor area (${sqft.toLocaleString("en-GB")} sq ft)`,
      amount: units * service.per_1000_sqft,
      kind: "size",
    });
  } else {
    const bedrooms = input.bedrooms ?? null;
    if (bedrooms === null || bedrooms === undefined) {
      return {
        ok: false,
        reason: "missing_size",
        message: "To price this clean we need the number of bedrooms.",
        missing: ["bedrooms"],
      };
    }
    if (bedrooms < 0 || bedrooms > 10) {
      return {
        ok: false,
        reason: "invalid_size",
        message:
          "For properties of that size we prepare a bespoke quote rather than an automatic estimate.",
        missing: [],
      };
    }
    units = bedrooms;
    lineItems.push({
      label:
        bedrooms === 0
          ? "Studio property"
          : `${bedrooms} bedroom${bedrooms === 1 ? "" : "s"}`,
      amount: bedrooms * service.per_bedroom,
      kind: "size",
    });
  }

  let subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  const requestedAddons = input.addons ?? [];
  const validAddons: string[] = [];
  const multiplierAddons: { label: string; amount: number }[] = [];

  for (const key of requestedAddons) {
    const addon = pricing.addons.find((a) => a.key === key);
    if (!addon || !addon.applies_to.includes(input.service_type)) continue;
    validAddons.push(addon.key);
    if (addon.mode === "flat") {
      subtotal += addon.amount;
      lineItems.push({ label: addon.label, amount: addon.amount, kind: "addon" });
    } else {
      multiplierAddons.push({ label: addon.label, amount: addon.amount });
    }
  }

  for (const m of multiplierAddons) {
    const uplift = subtotal * (m.amount - 1);
    subtotal += uplift;
    lineItems.push({ label: m.label, amount: uplift, kind: "addon" });
  }

  const zone = resolveZone(pricing, input.postcode);
  const zoneUplift = subtotal * (zone.multiplier - 1);
  subtotal += zoneUplift;
  lineItems.push({
    label: `${zone.label} adjustment`,
    amount: zoneUplift,
    kind: "zone",
  });

  if (subtotal < service.minimum_price) {
    lineItems.push({
      label: "Minimum call-out adjustment",
      amount: service.minimum_price - subtotal,
      kind: "minimum",
    });
    subtotal = service.minimum_price;
  }

  // Everything needed is now present. If the owner has not approved the
  // rate card, we stop here: the details are captured, but no figure is
  // stated to the customer.
  if (!serviceApproved && !options.allowUnapproved) {
    return {
      ok: false,
      reason: "pricing_not_approved",
      message: UNAPPROVED_PRICING_MESSAGE,
      missing: [],
    };
  }

  const spread = service.range_spread;
  const durationHours =
    Math.round((service.base_hours + service.hours_per_unit * units) * 2) / 2;

  return {
    ok: true,
    service_type: input.service_type,
    service_label: service.label,
    currency: "GBP",
    estimate: round(subtotal),
    low: round(subtotal * (1 - spread)),
    high: round(subtotal * (1 + spread)),
    duration_hours: Math.max(durationHours, 1),
    zone_key: zone.key,
    zone_label: zone.label,
    zone_multiplier: zone.multiplier,
    zone_needs_confirmation: !london.certain || !zone.matched,
    line_items: lineItems.map((item) => ({
      ...item,
      amount: Math.round(item.amount * 100) / 100,
    })),
    addons: validAddons,
    tier_key: null,
    tier_label: null,
    from_price_list: false,
    vat_note: pricing.vat_note,
    disclaimer: QUOTE_DISCLAIMER,
  };
}

export function formatGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}
