"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { newId, store } from "@/lib/db";
import { createLead, updateLead } from "@/lib/leads";
import { recordAgentAction, newTraceId } from "@/lib/agent/audit";
import { getCampaign } from "@/lib/prospecting/campaigns";
import { normaliseSuppressionIdentifier } from "@/lib/prospecting/dedupe";
import {
  importCandidates,
  runCampaign,
  verifyProspect,
} from "@/lib/prospecting/pipeline";
import { parseProspectCsv } from "@/lib/prospecting/sources/csv";
import {
  LEAD_STATUSES_FROM_PROSPECT,
  PROSPECT_STATUSES,
  type BusinessType,
  type Campaign,
  type Prospect,
  type ProspectStatus,
  type Suppression,
} from "@/lib/prospecting/types";
import type { CustomerSegment } from "@/lib/types";

/**
 * Every mutation the Prospects tab can perform.
 *
 * Each one re-checks the admin session: a server action is a public endpoint,
 * so the check cannot be delegated to the page that renders the form.
 *
 * Two rules are enforced here rather than trusted to the UI. A prospect
 * cannot be given a lead status by hand - the only route to one is
 * `recordProspectResponseAction`, which requires the owner to confirm that
 * the organisation actually got in touch. And a suppression is never
 * deleted casually: removing one is possible, but it is a separate,
 * explicit action.
 */

async function assertAdmin() {
  if (!(await isAdmin())) {
    throw new Error("Not authorised.");
  }
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function flag(form: FormData, key: string): boolean {
  return form.get(key) === "on" || form.get(key) === "true";
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Where to send the owner back to, preserving their filters. */
function backTo(form: FormData): string {
  const from = text(form, "from");
  return from.startsWith("/admin/prospects") ? from : "/admin/prospects";
}

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

/**
 * Runs one stored campaign, optionally narrowed to a single borough.
 *
 * The borough override is how the systematic sweep works: the owner picks
 * the same campaign and works down the borough list, one area per run. That
 * keeps each run small, which is also what keeps us inside the free usage
 * OpenStreetMap expects.
 */
export async function runCampaignAction(form: FormData) {
  await assertAdmin();
  const campaignId = text(form, "campaign_id");
  const borough = text(form, "borough");
  const limit = clampInt(text(form, "limit"), 1, 50, 15);
  const verify = flag(form, "verify");

  const stored = campaignId ? await getCampaign(campaignId) : null;
  if (!stored) {
    redirect("/admin/prospects?problem=No+such+campaign.");
  }

  const campaign: Campaign = borough
    ? { ...stored, boroughs: [borough] }
    : stored;

  let query = `ran=${encodeURIComponent(stored.id)}`;
  try {
    const summary = await runCampaign({ campaign, limit, verify });
    const parts = [
      `${summary.candidates_found} found`,
      `${summary.new_prospects} new`,
      `${summary.duplicates_merged} merged into records already on file`,
      `${summary.suppressed} skipped as do-not-contact`,
    ];
    if (summary.verified) parts.push(`${summary.verified} verified`);
    if (summary.needs_review) parts.push(`${summary.needs_review} need a human look`);
    query += `&result=${encodeURIComponent(parts.join(" · "))}`;
    if (summary.errors.length) {
      query += `&problem=${encodeURIComponent(summary.errors.join(" "))}`;
    }
  } catch (error) {
    query += `&problem=${encodeURIComponent(
      error instanceof Error ? error.message : String(error),
    )}`;
  }

  revalidatePath("/admin/prospects");
  redirect(`/admin/prospects?${query}`);
}

/* ------------------------------------------------------------------ *
 * CSV import
 * ------------------------------------------------------------------ */

/**
 * Imports a list the owner pasted or exported themselves.
 *
 * This exists because several obvious directories prohibit automated
 * extraction in their terms. Rather than scrape them, the owner can copy out
 * what they are entitled to and paste it here, and the row is recorded as
 * having come from them.
 */
export async function importProspectsCsvAction(form: FormData) {
  await assertAdmin();
  const csv = text(form, "csv");
  const sourceLabel = text(form, "source_label");

  if (csv.length < 10) {
    redirect("/admin/prospects?problem=Nothing+to+import.+Paste+a+CSV+with+a+header+row.");
  }

  let query = "imported=1";
  try {
    const { candidates, skipped, headers } = parseProspectCsv(csv, {
      sourceLabel: sourceLabel || undefined,
    });
    const summary = await importCandidates(candidates, { markAsTest: false });
    const parts = [
      `${summary.new_prospects} added`,
      `${summary.duplicates_merged} merged into records already on file`,
      `${summary.suppressed} skipped as do-not-contact`,
      `${skipped.length} row${skipped.length === 1 ? "" : "s"} rejected`,
    ];
    query += `&result=${encodeURIComponent(parts.join(" · "))}`;
    if (skipped.length) {
      const reasons = [...new Set(skipped.map((s) => s.reason))].slice(0, 4);
      query += `&rejected=${encodeURIComponent(reasons.join(" | "))}`;
    }
    if (headers.length === 0) {
      query += "&problem=No+header+row+was+recognised.";
    }
  } catch (error) {
    query += `&problem=${encodeURIComponent(
      error instanceof Error ? error.message : String(error),
    )}`;
  }

  revalidatePath("/admin/prospects");
  redirect(`/admin/prospects?${query}`);
}

/* ------------------------------------------------------------------ *
 * A single prospect
 * ------------------------------------------------------------------ */

export async function verifyProspectAction(form: FormData) {
  await assertAdmin();
  const id = text(form, "id");
  if (!id) return;
  const prospect = await verifyProspect(id);
  revalidatePath("/admin/prospects");
  revalidatePath(`/admin/prospects/${id}`);
  if (!prospect) {
    redirect("/admin/prospects?problem=That+prospect+no+longer+exists.");
  }
}

export async function saveProspectNotesAction(form: FormData) {
  await assertAdmin();
  const id = text(form, "id");
  const notes = text(form, "notes");
  if (!id) return;
  await store.update("prospects", id, {
    notes: notes || null,
    updated_at: new Date().toISOString(),
  });
  revalidatePath(`/admin/prospects/${id}`);
}

/**
 * Moves a prospect along the pipeline by hand.
 *
 * Statuses that mean "this is now a lead" are refused here. Nobody becomes a
 * lead because a dropdown was changed; they become one when they reply, which
 * is recorded by the action below.
 */
export async function setProspectStatusAction(form: FormData) {
  await assertAdmin();
  const id = text(form, "id");
  const status = text(form, "status") as ProspectStatus;
  if (!id || !PROSPECT_STATUSES.includes(status)) return;

  if (LEAD_STATUSES_FROM_PROSPECT.includes(status)) {
    redirect(
      `/admin/prospects/${id}?problem=${encodeURIComponent(
        "That status means the organisation has been in touch. Use “They got in touch” below, which creates the lead record properly.",
      )}`,
    );
  }

  await store.update("prospects", id, {
    status,
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/admin/prospects");
  revalidatePath(`/admin/prospects/${id}`);
}

/** Records that an approach was made, so the next run does not repeat it. */
export async function markContactedAction(form: FormData) {
  await assertAdmin();
  const id = text(form, "id");
  const channel = text(form, "channel") || "email";
  if (!id) return;

  const prospect = await store.get("prospects", id);
  if (!prospect) return;

  const stamp = new Date().toISOString();
  await store.update("prospects", id, {
    status: "contacted",
    last_checked_at: stamp,
    updated_at: stamp,
    notes: [
      prospect.notes,
      `Approached by ${channel} on ${stamp.slice(0, 10)} (recorded by the owner).`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  await recordAgentAction({
    trace_id: newTraceId(),
    channel: "system",
    tool: "record_prospect_outreach",
    summary: `Owner recorded an approach to a prospect by ${channel}.`,
    outcome: "ok",
    actor: "owner",
    error: null,
  });

  revalidatePath("/admin/prospects");
  revalidatePath(`/admin/prospects/${id}`);
}

const SEGMENT_FOR_TYPE: Record<BusinessType, CustomerSegment> = {
  estate_agent: "estate_agent",
  letting_agent: "estate_agent",
  property_management: "landlord",
  landlord_operator: "landlord",
  short_let_management: "airbnb_host",
  commercial_office: "business_office",
  coworking_space: "business_office",
  restaurant: "business_office",
  retail: "business_office",
  hospitality: "business_office",
  construction_property: "business_office",
  other_business: "business_office",
  irrelevant: "unknown",
};

/**
 * The prospect-to-lead boundary, crossed in exactly one place.
 *
 * The owner confirms that the organisation got in touch. Only then is a lead
 * record created, and only then does this prospect count towards the lead
 * numbers. The two records point at each other afterwards, so the report can
 * say honestly how many leads prospecting actually produced.
 *
 * Follow-up automation is paused on the new lead. Chasing somebody we
 * approached first should be the owner's decision, not a timer's.
 */
export async function recordProspectResponseAction(form: FormData) {
  await assertAdmin();
  const id = text(form, "id");
  if (!id) return;

  const prospect = await store.get("prospects", id);
  if (!prospect) {
    redirect("/admin/prospects?problem=That+prospect+no+longer+exists.");
  }
  if (prospect.lead_id) {
    redirect(`/admin/leads/${prospect.lead_id}`);
  }

  const contactName = text(form, "contact_name");
  const email = text(form, "email") || prospect.email;
  const phone = text(form, "phone") || prospect.phone;
  const summary = text(form, "summary");

  const lead = await createLead({
    name: contactName || prospect.company_name,
    email: email || null,
    phone: phone || null,
    address: prospect.address,
    postcode: prospect.postcode,
    segment: SEGMENT_FOR_TYPE[prospect.business_type],
    source: "prospecting",
    notes: [
      `Came from prospecting. Organisation: ${prospect.company_name}${
        prospect.borough ? ` (${prospect.borough})` : ""
      }.`,
      summary ? `What they said: ${summary}` : null,
      `Prospect record: ${prospect.id}`,
    ]
      .filter(Boolean)
      .join("\n"),
    marketing_consent: false,
  });

  // They approached us in reply to us, so let the owner drive the next step.
  await updateLead(lead.id, { followup_paused: true });

  const stamp = new Date().toISOString();
  await store.update("prospects", prospect.id, {
    status: "responded",
    lead_id: lead.id,
    updated_at: stamp,
    last_checked_at: stamp,
  });

  await recordAgentAction({
    trace_id: newTraceId(),
    channel: "system",
    tool: "prospect_became_lead",
    summary: `A prospect responded and was linked to a new lead record. Follow-up automation left paused.`,
    outcome: "ok",
    actor: "owner",
    lead_id: lead.id,
    error: null,
  });

  revalidatePath("/admin/prospects");
  revalidatePath("/admin/leads");
  redirect(`/admin/leads/${lead.id}`);
}

export async function deleteProspectAction(form: FormData) {
  await assertAdmin();
  const id = text(form, "id");
  if (!id) return;
  await store.remove("prospects", id);
  revalidatePath("/admin/prospects");
  redirect("/admin/prospects?result=Prospect+deleted.");
}

/* ------------------------------------------------------------------ *
 * Do not contact
 * ------------------------------------------------------------------ */

/**
 * Adds a permanent do-not-contact entry and marks anything on file that
 * matches it.
 *
 * Matching records are marked rather than deleted, so that if the same
 * organisation is discovered again the owner can see it was excluded and
 * why, instead of wondering where it went.
 */
export async function addSuppressionAction(form: FormData) {
  await assertAdmin();
  const identifier = text(form, "identifier");
  const identifierType = text(form, "identifier_type") as Suppression["identifier_type"];
  const reason = text(form, "reason") || "Asked not to be contacted";
  const prospectId = text(form, "prospect_id");

  const valid: Suppression["identifier_type"][] = [
    "domain",
    "email",
    "phone",
    "company_name",
    "ch_number",
  ];
  if (identifier.length < 2 || !valid.includes(identifierType)) {
    redirect("/admin/prospects/suppressions?problem=Enter+what+to+suppress+and+its+type.");
  }

  const normalised = normaliseSuppressionIdentifier(identifier, identifierType);
  const existing = (await store.list("suppressions")) as Suppression[];
  if (
    existing.some(
      (entry) =>
        entry.identifier === normalised && entry.identifier_type === identifierType,
    )
  ) {
    redirect("/admin/prospects/suppressions?result=Already+on+the+list.");
  }

  await store.insert("suppressions", {
    id: newId("supp"),
    created_at: new Date().toISOString(),
    identifier: normalised,
    identifier_type: identifierType,
    reason,
    created_by: "owner",
    source: "dashboard",
  } satisfies Suppression);

  const all = (await store.list("prospects")) as Prospect[];
  let marked = 0;
  for (const prospect of all) {
    const matches =
      (identifierType === "domain" &&
        (prospect.website ?? "").toLowerCase().includes(normalised)) ||
      (identifierType === "email" &&
        (prospect.email ?? "").toLowerCase() === normalised) ||
      (identifierType === "phone" &&
        (prospect.phone ?? "").replace(/\D/g, "").endsWith(normalised.replace(/\D/g, ""))) ||
      (identifierType === "company_name" &&
        prospect.company_name.toLowerCase().includes(normalised)) ||
      (identifierType === "ch_number" &&
        prospect.companies_house_number === normalised);
    if (!matches) continue;
    await store.update("prospects", prospect.id, {
      status: "do_not_contact",
      flags: [...new Set([...prospect.flags, `Suppressed: ${reason}`])],
      updated_at: new Date().toISOString(),
    });
    marked += 1;
  }

  await recordAgentAction({
    trace_id: newTraceId(),
    channel: "system",
    tool: "add_suppression",
    summary: `Do-not-contact entry added by the owner. ${marked} record${marked === 1 ? "" : "s"} on file marked.`,
    outcome: "ok",
    actor: "owner",
    error: null,
  });

  revalidatePath("/admin/prospects");
  revalidatePath("/admin/prospects/suppressions");
  if (prospectId) {
    redirect(`/admin/prospects/${prospectId}`);
  }
  redirect(
    `/admin/prospects/suppressions?result=${encodeURIComponent(
      `Added. ${marked} record${marked === 1 ? "" : "s"} on file marked do-not-contact.`,
    )}`,
  );
}

/**
 * Removes a suppression.
 *
 * Kept deliberately separate and unglamorous. Records the organisation was
 * marked against are left as they are: lifting the block does not restore a
 * prospect to the pipeline on its own.
 */
export async function removeSuppressionAction(form: FormData) {
  await assertAdmin();
  const id = text(form, "id");
  if (!id) return;
  await store.remove("suppressions", id);
  await recordAgentAction({
    trace_id: newTraceId(),
    channel: "system",
    tool: "remove_suppression",
    summary: "A do-not-contact entry was removed by the owner.",
    outcome: "ok",
    actor: "owner",
    error: null,
  });
  revalidatePath("/admin/prospects/suppressions");
  redirect("/admin/prospects/suppressions?result=Removed.");
}

/* ------------------------------------------------------------------ *
 * Test data
 * ------------------------------------------------------------------ */

/** Deletes every record marked as test data. Real prospects are untouched. */
export async function purgeTestProspectsAction(form: FormData) {
  await assertAdmin();
  const all = (await store.list("prospects")) as Prospect[];
  let removed = 0;
  for (const prospect of all.filter((p) => p.is_test)) {
    await store.remove("prospects", prospect.id);
    removed += 1;
  }
  const suppressions = (await store.list("suppressions")) as Suppression[];
  for (const entry of suppressions.filter((s) => s.reason === "Test suppression")) {
    await store.remove("suppressions", entry.id);
    removed += 1;
  }
  revalidatePath("/admin/prospects");
  redirect(
    `${backTo(form).split("?")[0]}?result=${encodeURIComponent(
      `${removed} test record${removed === 1 ? "" : "s"} removed.`,
    )}`,
  );
}
