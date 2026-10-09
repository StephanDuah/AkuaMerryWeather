import { SOURCE_RELIABILITY } from "./types";
import type { Prospect, ProspectCandidate, Suppression } from "./types";

/**
 * Deduplication and suppression.
 *
 * The same company will legitimately appear on Companies House, on
 * OpenStreetMap and on its own website. That is three pieces of evidence for
 * one organisation, not three prospects. This file decides when two records
 * are the same company, and merges their provenance rather than their
 * contradictions.
 */

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

/** Legal suffixes and noise that should not affect whether names match. */
const NAME_NOISE =
  /\b(limited|ltd|llp|plc|company|co|uk|london|group|holdings|the)\b/gi;

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(NAME_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Registrable domain, ignoring protocol, www and path. */
export function normaliseDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** UK numbers compared on their last nine digits, which survives formatting. */
export function normalisePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

export function normalisePostcode(postcode: string | null): string | null {
  if (!postcode) return null;
  return postcode.toUpperCase().replace(/\s+/g, "") || null;
}

/* ------------------------------------------------------------------ *
 * Matching
 * ------------------------------------------------------------------ */

export interface MatchResult {
  match: Prospect | null;
  /** Why we decided it was the same organisation. */
  reason: string | null;
  confidence: "certain" | "strong" | "likely" | null;
}

/**
 * Finds an existing prospect that is the same organisation.
 *
 * Ordered by how much the evidence proves, strongest first. A company
 * number is definitive; a shared domain is near-definitive; a name match
 * alone is only accepted when the postcode agrees, because "Prime Estates"
 * in Camden and in Croydon are different businesses.
 */
export function findDuplicate(
  candidate: Pick<
    ProspectCandidate,
    "company_name" | "website" | "phone" | "postcode" | "companies_house_number"
  >,
  existing: Prospect[],
): MatchResult {
  const chNumber = candidate.companies_house_number?.trim() || null;
  const domain = normaliseDomain(candidate.website);
  const phone = normalisePhone(candidate.phone);
  const name = normaliseName(candidate.company_name);
  const postcode = normalisePostcode(candidate.postcode);

  // 1. The company register number is definitive.
  if (chNumber) {
    const hit = existing.find((p) => p.companies_house_number === chNumber);
    if (hit) {
      return {
        match: hit,
        reason: `Same Companies House number (${chNumber})`,
        confidence: "certain",
      };
    }
  }

  // 2. A shared web domain is near-definitive for a business.
  if (domain) {
    const hit = existing.find((p) => normaliseDomain(p.website) === domain);
    if (hit) {
      return {
        match: hit,
        reason: `Same website domain (${domain})`,
        confidence: "certain",
      };
    }
  }

  // 3. Same normalised name AND same postcode.
  if (name && postcode) {
    const hit = existing.find(
      (p) =>
        normaliseName(p.company_name) === name &&
        normalisePostcode(p.postcode) === postcode,
    );
    if (hit) {
      return {
        match: hit,
        reason: "Same company name at the same postcode",
        confidence: "strong",
      };
    }
  }

  // 4. Same telephone number.
  if (phone) {
    const hit = existing.find((p) => normalisePhone(p.phone) === phone);
    if (hit) {
      return {
        match: hit,
        reason: "Same telephone number",
        confidence: "strong",
      };
    }
  }

  // 5. Same name in the same borough. Weakest rule we accept, and it is
  //    recorded as "likely" so the owner can disagree.
  if (name && candidate.postcode === null) {
    const hit = existing.find((p) => normaliseName(p.company_name) === name);
    if (hit) {
      return {
        match: hit,
        reason: "Same company name, no postcode to separate them",
        confidence: "likely",
      };
    }
  }

  return { match: null, reason: null, confidence: null };
}

/* ------------------------------------------------------------------ *
 * Merging
 * ------------------------------------------------------------------ */

export interface MergeOutcome {
  prospect: Prospect;
  /** Fields where the sources disagreed, surfaced rather than resolved. */
  conflicts: string[];
}

/**
 * Folds a new candidate into an existing prospect.
 *
 * A field that is already known is not overwritten by a less reliable
 * source; if the two genuinely disagree, that is flagged for a human rather
 * than silently picking one. Guessing which of two addresses is right is
 * exactly the kind of quiet error that makes a database untrustworthy.
 */
export function mergeCandidate(
  existing: Prospect,
  candidate: ProspectCandidate,
  matchReason: string,
): MergeOutcome {
  const conflicts: string[] = [];
  const now = new Date().toISOString();

  /** Fields this source filled in for the first time, with their evidence. */
  const filled: { field: string; value: string }[] = [];

  const take = <K extends keyof ProspectCandidate>(
    field: K,
    current: string | null,
    label: string,
  ): string | null => {
    const incoming = candidate[field] as string | null;
    if (!incoming) return current;
    if (!current) {
      // A gap filled by a second source needs its own line of evidence, or
      // the record would carry a detail with nothing to answer for it.
      filled.push({ field: String(field), value: incoming });
      return incoming;
    }
    if (current.trim().toLowerCase() === incoming.trim().toLowerCase()) {
      return current;
    }
    conflicts.push(`${label}: "${current}" vs "${incoming}" (${candidate.source})`);
    return current;
  };

  const merged: Prospect = {
    ...existing,
    updated_at: now,
    website: take("website", existing.website, "Website"),
    email: take("email", existing.email, "Email"),
    phone: take("phone", existing.phone, "Telephone"),
    address: take("address", existing.address, "Address"),
    postcode: take("postcode", existing.postcode, "Postcode"),
    borough: existing.borough ?? candidate.borough,
    companies_house_number:
      existing.companies_house_number ?? candidate.companies_house_number,
    companies_house_status:
      candidate.companies_house_status ?? existing.companies_house_status,
    sources: [...new Set([...existing.sources, candidate.source])],
    provenance: [
      ...existing.provenance,
      {
        field: "record",
        value: candidate.company_name,
        source: candidate.source,
        source_url: candidate.source_url,
        collected_at: candidate.discovered_at,
        reliability: SOURCE_RELIABILITY[candidate.source],
      },
      // Plus a line for each gap this source filled.
      ...filled.map((entry) => ({
        field: entry.field,
        value: entry.value,
        source: candidate.source,
        source_url: candidate.source_url,
        collected_at: candidate.discovered_at,
        reliability: SOURCE_RELIABILITY[candidate.source],
      })),
    ],
    flags: [
      ...new Set([
        ...existing.flags,
        ...(candidate.flags ?? []),
        ...conflicts.map((c) => `Conflicting data — ${c}`),
      ]),
    ],
    notes: existing.notes,
  };

  merged.flags = [...new Set([...merged.flags, `Merged: ${matchReason}`])];

  return { prospect: merged, conflicts };
}

/* ------------------------------------------------------------------ *
 * Suppression
 * ------------------------------------------------------------------ */

/**
 * Do-not-contact. A permanent block: once something is suppressed it is
 * excluded from every future campaign, not merely hidden from this one.
 */
export function isSuppressed(
  candidate: Pick<
    ProspectCandidate,
    "company_name" | "website" | "email" | "phone" | "companies_house_number"
  >,
  suppressions: Suppression[],
): Suppression | null {
  const domain = normaliseDomain(candidate.website);
  const phone = normalisePhone(candidate.phone);
  const name = normaliseName(candidate.company_name);
  const email = candidate.email?.toLowerCase().trim() ?? null;
  const chNumber = candidate.companies_house_number?.trim() ?? null;

  return (
    suppressions.find((entry) => {
      switch (entry.identifier_type) {
        case "domain":
          return domain !== null && entry.identifier === domain;
        case "email":
          return email !== null && entry.identifier === email;
        case "phone":
          return phone !== null && entry.identifier === phone;
        case "company_name":
          return name !== "" && entry.identifier === name;
        case "ch_number":
          return chNumber !== null && entry.identifier === chNumber;
        default:
          return false;
      }
    }) ?? null
  );
}

/** Normalises an identifier so suppression matches regardless of formatting. */
export function normaliseSuppressionIdentifier(
  value: string,
  type: Suppression["identifier_type"],
): string {
  switch (type) {
    case "domain":
      return normaliseDomain(value) ?? value.toLowerCase().trim();
    case "phone":
      return normalisePhone(value) ?? value.replace(/[^\d]/g, "");
    case "company_name":
      return normaliseName(value);
    case "email":
      return value.toLowerCase().trim();
    default:
      return value.trim();
  }
}
