/**
 * UK postcode helpers, scoped to Greater London.
 *
 * Merry Cleaners only serves Greater London, so every quote and booking
 * passes through here first. Anything we cannot confidently place inside
 * London is escalated to a human rather than guessed at.
 */

/** Postcode areas that sit wholly (or almost wholly) inside Greater London. */
const CORE_LONDON_AREAS = ["E", "EC", "N", "NW", "SE", "SW", "W", "WC"];

/**
 * Areas that straddle the Greater London boundary. Addresses here are
 * accepted but flagged, because e.g. parts of EN, DA and KT are outside
 * the M25 boundary of Greater London.
 */
const BORDER_LONDON_AREAS = [
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
];

export type LondonCheck =
  | { inLondon: true; certain: true; outward: string; area: string }
  | { inLondon: true; certain: false; outward: string; area: string }
  | { inLondon: false; certain: true; outward: string | null; area: string | null };

const POSTCODE_RE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})?$/i;

export function normalisePostcode(input: string): string {
  return (input || "").toUpperCase().replace(/\s+/g, "").trim();
}

/** Returns the outward code (the part before the space), e.g. "E8" from "E8 1EJ". */
export function outwardCode(input: string): string | null {
  const cleaned = normalisePostcode(input);
  const match = cleaned.match(POSTCODE_RE);
  if (!match) return null;
  return match[1].toUpperCase();
}

/** Returns the alphabetic postcode area, e.g. "SW" from "SW1A". */
export function postcodeArea(input: string): string | null {
  const outward = outwardCode(input);
  if (!outward) return null;
  const letters = outward.match(/^[A-Z]{1,2}/);
  return letters ? letters[0] : null;
}

export function checkLondon(input: string): LondonCheck {
  const outward = outwardCode(input);
  const area = postcodeArea(input);
  if (!outward || !area) {
    return { inLondon: false, certain: true, outward: null, area: null };
  }
  if (CORE_LONDON_AREAS.includes(area)) {
    return { inLondon: true, certain: true, outward, area };
  }
  if (BORDER_LONDON_AREAS.includes(area)) {
    return { inLondon: true, certain: false, outward, area };
  }
  return { inLondon: false, certain: true, outward, area };
}

export function isValidPostcodeFormat(input: string): boolean {
  return outwardCode(input) !== null;
}
