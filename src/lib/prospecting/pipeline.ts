import { newId, store } from "@/lib/db";
import { recordAgentAction, newTraceId } from "@/lib/agent/audit";
import { overpassAdapter } from "./sources/overpass";
import { companiesHouseAdapter, verifyWithCompaniesHouse } from "./sources/companiesHouse";
import { csvAdapter } from "./sources/csv";
import { isGenericMailbox, verifyWebsite } from "./sources/website";
import { classify, qualify, initialStatus, serviceFit } from "./qualify";
import { findDuplicate, isSuppressed, mergeCandidate } from "./dedupe";
import {
  SOURCE_RELIABILITY,
  type Campaign,
  type Prospect,
  type ProspectCandidate,
  type RunSummary,
  type SourceAdapter,
  type SourceId,
  type Suppression,
} from "./types";

/**
 * The prospecting pipeline.
 *
 *   discover → suppress → deduplicate → classify → verify → qualify → store
 *
 * Discovery is done by adapters; everything after that happens here, once,
 * so behaviour cannot drift between sources. Each stage records what it did
 * in the same audit trail the customer-facing agent uses.
 */

export const ADAPTERS: Record<SourceId, SourceAdapter | null> = {
  openstreetmap: overpassAdapter,
  companies_house: companiesHouseAdapter,
  manual_csv: csvAdapter,
  official_website: null, // Verification only, not a discovery source.
  manual_entry: null,
  future_paid: null,
};

export function availableSources(): {
  id: SourceId;
  label: string;
  available: boolean;
  reason: string | null;
  reliability: string;
}[] {
  return (Object.entries(ADAPTERS) as [SourceId, SourceAdapter | null][])
    .filter(([, adapter]) => adapter !== null)
    .map(([id, adapter]) => ({
      id,
      label: adapter!.label,
      available: adapter!.available(),
      reason: adapter!.unavailableReason(),
      reliability: SOURCE_RELIABILITY[id].replace(/_/g, " "),
    }));
}

/* ------------------------------------------------------------------ *
 * Building a prospect
 * ------------------------------------------------------------------ */

function buildProspect(
  candidate: ProspectCandidate,
  campaignId: string | null,
  isTest: boolean,
): Prospect {
  const businessType = classify(candidate);
  const now = new Date().toISOString();
  const extraFlags: string[] = [];

  // A prospect record holds an organisation's published business route and
  // never an individual's address, whichever source offered it - including a
  // list the owner imported themselves. A named person's work address is
  // their personal data, and this system has no lawful basis to keep it.
  let email = candidate.email;
  if (email && !isGenericMailbox(email)) {
    extraFlags.push(
      `An email address naming an individual (${email}) was supplied for this organisation and has not been stored. Use its general business route instead.`,
    );
    email = null;
  }

  const qualifyInput = {
    company_name: candidate.company_name,
    business_type: businessType,
    borough: candidate.borough,
    postcode: candidate.postcode,
    website: candidate.website,
    email,
    phone: candidate.phone,
    contact_form_url: null,
    sources: [candidate.source],
    companies_house_status: candidate.companies_house_status,
  };

  const qualification = qualify(qualifyInput);

  return {
    id: newId("prospect"),
    created_at: now,
    updated_at: now,
    company_name: candidate.company_name,
    trading_name: null,
    business_type: businessType,
    website: candidate.website,
    email,
    phone: candidate.phone,
    contact_form_url: null,
    address: candidate.address,
    postcode: candidate.postcode,
    borough: candidate.borough,
    companies_house_number: candidate.companies_house_number,
    companies_house_status: candidate.companies_house_status,
    sources: [candidate.source],
    // One line of evidence per field we actually store, not just the name.
    // Anything on a prospect record has to be answerable for: the owner is
    // going to contact these organisations on the strength of it.
    provenance: (
      [
        ["company_name", candidate.company_name],
        ["website", candidate.website],
        ["email", email],
        ["phone", candidate.phone],
        ["address", candidate.address],
        ["postcode", candidate.postcode],
        ["borough", candidate.borough],
        ["companies_house_number", candidate.companies_house_number],
        ["companies_house_status", candidate.companies_house_status],
      ] as [string, string | null][]
    )
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([field, value]) => ({
        field,
        value,
        source: candidate.source,
        source_url: candidate.source_url,
        collected_at: candidate.discovered_at,
        reliability: SOURCE_RELIABILITY[candidate.source],
      })),
    discovered_at: candidate.discovered_at,
    verified_at: null,
    last_checked_at: now,
    qualification,
    status: initialStatus(qualification, qualifyInput),
    lead_id: null,
    flags: [...(candidate.flags ?? []), ...extraFlags],
    notes: null,
    is_test: isTest,
    campaign_id: campaignId,
  };
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */

/**
 * Enriches a prospect from its own website and, where a company number is
 * known, from the official register. Re-qualifies afterwards, because new
 * evidence should change the assessment.
 */
export async function verifyProspect(prospectId: string): Promise<Prospect | null> {
  const prospect = await store.get("prospects", prospectId);
  if (!prospect) return null;

  const traceId = newTraceId();
  const flags = [...prospect.flags];
  const provenance = [...prospect.provenance];
  const sources = [...prospect.sources];
  let email = prospect.email;
  let phone = prospect.phone;
  let contactForm = prospect.contact_form_url;
  let businessType = prospect.business_type;
  let chStatus = prospect.companies_house_status;
  let websiteReachable: boolean | undefined;
  const inactive: string[] = [];

  // 1. The official register, where we have a number.
  if (prospect.companies_house_number && companiesHouseAdapter.available()) {
    const official = await verifyWithCompaniesHouse(prospect.companies_house_number);
    if (official?.found) {
      chStatus = official.status ?? chStatus;
      if (official.business_type) businessType = official.business_type;
      if (official.status && official.status !== "active") {
        inactive.push(`Companies House status: ${official.status}`);
      }
      sources.push("companies_house");
      provenance.push({
        field: "companies_house_status",
        value: official.status ?? "unknown",
        source: "companies_house",
        source_url: official.source_url,
        collected_at: new Date().toISOString(),
        reliability: "very_high",
      });
    } else if (official && !official.found) {
      flags.push("Company number not found on the register");
    }
  }

  // A record must never hold an individual's address, including one captured
  // before that rule existed. Checking it here means every re-verification
  // cleans up what it finds rather than leaving it for someone to notice.
  if (email && !isGenericMailbox(email)) {
    const removed = email;
    flags.push(
      `Removed ${removed} from this record: it names an individual rather than being a general business mailbox. Use the contact form or phone number instead.`,
    );
    email = null;
    // Its evidence goes with it, so the record does not keep a line pointing
    // at a value that is no longer there.
    for (let i = provenance.length - 1; i >= 0; i -= 1) {
      if (provenance[i].field === "email" && provenance[i].value === removed) {
        provenance.splice(i, 1);
      }
    }
  }

  // 2. The company's own website.
  if (prospect.website) {
    const site = await verifyWebsite(prospect.website);
    websiteReachable = site.reachable;

    if (site.skipped_reason) {
      flags.push(`Website not checked — ${site.skipped_reason}`);
    }
    if (site.reachable) {
      sources.push("official_website");
      const tookEmail = email === null && site.email !== null;
      const tookPhone = phone === null && site.phone !== null;
      const tookForm = contactForm === null && site.contact_form_url !== null;
      email = email ?? site.email;
      phone = phone ?? site.phone;
      contactForm = contactForm ?? site.contact_form_url;
      if (site.business_type_hint) businessType = site.business_type_hint;
      inactive.push(...site.inactive_signals);
      provenance.push({
        field: "website",
        value: site.title ?? prospect.website,
        source: "official_website",
        source_url: site.source_url,
        collected_at: site.checked_at,
        reliability: "high",
      });

      // Every detail taken off the page gets its own line of evidence, not
      // just the page itself. Without this the owner could see an email on a
      // record with no way to tell where it came from.
      if (tookEmail && site.email) {
        provenance.push({
          field: "email",
          value: site.email,
          source: "official_website",
          source_url: site.source_url,
          collected_at: site.checked_at,
          reliability: site.email_on_own_domain ? "high" : "low",
        });
        if (!site.email_on_own_domain) {
          // It was published on their page, so it is not invented - but it is
          // not on their domain either, and we do not assert it is theirs.
          flags.push(
            `Email ${site.email} was found on the page but does not use this company's own domain — confirm it belongs to them before using it`,
          );
        }
      }
      if (site.personal_email_withheld) {
        // A named person's work address is their personal data. We note that
        // one is published rather than copying it onto this record.
        flags.push(
          "The only email address published on the site names an individual, so it has not been stored. Use the contact form or the phone number, or look at the site yourself.",
        );
      }
      if (tookPhone && site.phone) {
        provenance.push({
          field: "phone",
          value: site.phone,
          source: "official_website",
          source_url: site.source_url,
          collected_at: site.checked_at,
          reliability: "high",
        });
      }
      if (tookForm && site.contact_form_url) {
        provenance.push({
          field: "contact_form_url",
          value: site.contact_form_url,
          source: "official_website",
          source_url: site.source_url,
          collected_at: site.checked_at,
          reliability: "high",
        });
      }
    } else if (!site.skipped_reason) {
      inactive.push("Website did not respond");
    }
  }

  if (inactive.length > 0) {
    flags.push("Potentially inactive — requires review");
  }

  const qualifyInput = {
    company_name: prospect.company_name,
    business_type: businessType,
    borough: prospect.borough,
    postcode: prospect.postcode,
    website: prospect.website,
    email,
    phone,
    contact_form_url: contactForm,
    sources: [...new Set(sources)],
    companies_house_status: chStatus,
    website_reachable: websiteReachable,
    inactive_signals: inactive,
  };

  const qualification = qualify(qualifyInput);
  const now = new Date().toISOString();

  const updated = await store.update("prospects", prospect.id, {
    email,
    phone,
    contact_form_url: contactForm,
    business_type: businessType,
    companies_house_status: chStatus,
    sources: [...new Set(sources)],
    provenance,
    flags: [...new Set(flags)],
    qualification,
    status: initialStatus(qualification, qualifyInput),
    verified_at: now,
    last_checked_at: now,
    updated_at: now,
  });

  await recordAgentAction({
    trace_id: traceId,
    channel: "system",
    tool: "verify_prospect",
    summary: `${prospect.company_name}: ${qualification.priority} priority, ${inactive.length} inactivity signal(s)`,
    outcome: inactive.length ? "refused" : "ok",
    actor: "prospecting",
  });

  return updated;
}

/* ------------------------------------------------------------------ *
 * Running a campaign
 * ------------------------------------------------------------------ */

export interface RunOptions {
  campaign: Campaign;
  limit?: number;
  /** Verify each new prospect against its website and the register. */
  verify?: boolean;
  markAsTest?: boolean;
}

export async function runCampaign(options: RunOptions): Promise<RunSummary> {
  const { campaign, limit = 25, verify = false, markAsTest = false } = options;
  const startedAt = new Date().toISOString();
  const traceId = newTraceId();

  const summary: RunSummary = {
    campaign: campaign.name,
    started_at: startedAt,
    finished_at: startedAt,
    sources_used: [],
    candidates_found: 0,
    duplicates_merged: 0,
    suppressed: 0,
    new_prospects: 0,
    updated_prospects: 0,
    verified: 0,
    potentially_inactive: 0,
    needs_review: 0,
    by_type: {},
    by_priority: { high: 0, medium: 0, low: 0 },
    errors: [],
  };

  const suppressions = (await store.list("suppressions")) as Suppression[];
  const boroughs = campaign.boroughs.length ? campaign.boroughs : [undefined];

  // 1. Discover.
  const candidates: ProspectCandidate[] = [];
  for (const sourceId of campaign.sources) {
    const adapter = ADAPTERS[sourceId];
    if (!adapter || !adapter.available()) continue;

    for (const borough of boroughs) {
      if (candidates.length >= limit) break;
      try {
        const found = await adapter.search({
          businessTypes: campaign.target_types,
          borough,
          limit: limit - candidates.length,
        });
        candidates.push(...found);
        if (found.length && !summary.sources_used.includes(sourceId)) {
          summary.sources_used.push(sourceId);
        }
      } catch (error) {
        // A source asking us to stop is respected, not retried harder.
        summary.errors.push(
          `${adapter.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
        break;
      }
    }
  }

  summary.candidates_found = candidates.length;

  // 2. Suppress, deduplicate, classify, store.
  for (const candidate of candidates) {
    const blocked = isSuppressed(candidate, suppressions);
    if (blocked) {
      summary.suppressed += 1;
      continue;
    }

    const existing = (await store.list("prospects")) as Prospect[];
    const pool = existing.filter((p) => p.is_test === markAsTest);
    const duplicate = findDuplicate(candidate, pool);

    if (duplicate.match) {
      const { prospect: merged } = mergeCandidate(
        duplicate.match,
        candidate,
        duplicate.reason ?? "matched",
      );
      await store.update("prospects", merged.id, merged);
      summary.duplicates_merged += 1;
      summary.updated_prospects += 1;
      continue;
    }

    const prospect = buildProspect(candidate, campaign.id, markAsTest);
    await store.insert("prospects", prospect);
    summary.new_prospects += 1;
    summary.by_type[prospect.business_type] =
      (summary.by_type[prospect.business_type] ?? 0) + 1;
    summary.by_priority[prospect.qualification.priority] += 1;

    if (verify) {
      const verified = await verifyProspect(prospect.id);
      if (verified) {
        summary.verified += 1;
        if (verified.flags.some((f) => f.includes("Potentially inactive"))) {
          summary.potentially_inactive += 1;
        }
      }
    }

    if (prospect.status === "needs_verification") summary.needs_review += 1;
  }

  summary.finished_at = new Date().toISOString();

  await store.update("campaigns", campaign.id, {
    last_run_at: summary.finished_at,
    last_run_summary: `${summary.new_prospects} new, ${summary.duplicates_merged} merged, ${summary.suppressed} suppressed`,
  });

  await recordAgentAction({
    trace_id: traceId,
    channel: "system",
    tool: "run_prospecting_campaign",
    summary: `${campaign.name}: ${summary.candidates_found} found, ${summary.new_prospects} new, ${summary.duplicates_merged} merged`,
    outcome: summary.errors.length ? "refused" : "ok",
    actor: "prospecting",
    error: summary.errors.join("; ") || null,
  });

  return summary;
}

/* ------------------------------------------------------------------ *
 * Importing
 * ------------------------------------------------------------------ */

export async function importCandidates(
  candidates: ProspectCandidate[],
  options: { markAsTest?: boolean; campaignId?: string | null } = {},
): Promise<RunSummary> {
  const startedAt = new Date().toISOString();
  const markAsTest = options.markAsTest ?? false;

  const summary: RunSummary = {
    campaign: "CSV import",
    started_at: startedAt,
    finished_at: startedAt,
    sources_used: ["manual_csv"],
    candidates_found: candidates.length,
    duplicates_merged: 0,
    suppressed: 0,
    new_prospects: 0,
    updated_prospects: 0,
    verified: 0,
    potentially_inactive: 0,
    needs_review: 0,
    by_type: {},
    by_priority: { high: 0, medium: 0, low: 0 },
    errors: [],
  };

  const suppressions = (await store.list("suppressions")) as Suppression[];

  for (const candidate of candidates) {
    if (isSuppressed(candidate, suppressions)) {
      summary.suppressed += 1;
      continue;
    }

    const existing = (await store.list("prospects")) as Prospect[];
    const duplicate = findDuplicate(
      candidate,
      existing.filter((p) => p.is_test === markAsTest),
    );

    if (duplicate.match) {
      const { prospect: merged } = mergeCandidate(
        duplicate.match,
        candidate,
        duplicate.reason ?? "matched",
      );
      await store.update("prospects", merged.id, merged);
      summary.duplicates_merged += 1;
      summary.updated_prospects += 1;
      continue;
    }

    const prospect = buildProspect(candidate, options.campaignId ?? null, markAsTest);
    await store.insert("prospects", prospect);
    summary.new_prospects += 1;
    summary.by_type[prospect.business_type] =
      (summary.by_type[prospect.business_type] ?? 0) + 1;
    summary.by_priority[prospect.qualification.priority] += 1;
    if (prospect.status === "needs_verification") summary.needs_review += 1;
  }

  summary.finished_at = new Date().toISOString();
  return summary;
}

/** Explains why a prospect could be a customer, in the owner's words. */
export function explainFit(prospect: Prospect): string {
  const fit = serviceFit(prospect.business_type);
  return fit.reason;
}
