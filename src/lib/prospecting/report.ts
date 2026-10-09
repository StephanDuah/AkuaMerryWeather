import { store } from "@/lib/db";
import {
  BUSINESS_TYPE_LABELS,
  LEAD_STATUSES_FROM_PROSPECT,
  SOURCE_LABELS,
  type BusinessType,
  type Prospect,
  type ProspectStatus,
  type SourceId,
} from "./types";

/**
 * The owner's prospecting report.
 *
 * The single most important thing this file does is refuse to inflate the
 * numbers. A prospect is an organisation we think might be a customer. A
 * lead is someone who has actually responded. They are counted separately
 * and labelled differently, because conflating them would tell the owner
 * the business is doing better than it is.
 */

export interface ProspectingReport {
  generated_at: string;

  /** Organisations discovered. NOT leads. */
  prospects_total: number;
  prospects_new_this_week: number;
  verified: number;
  outreach_ready: number;
  needs_review: number;
  potentially_inactive: number;
  suppressed: number;

  /** People who have actually responded. This is the real number. */
  actual_leads: number;
  qualified_leads: number;
  became_customers: number;

  by_type: { type: string; label: string; count: number }[];
  by_priority: { priority: string; count: number }[];
  by_borough: { borough: string; count: number }[];
  by_status: { status: string; count: number }[];

  sources_used: { id: SourceId; label: string; count: number }[];

  /** Plain-English summary for the owner, stating the distinction. */
  narrative: string[];
}

function countBy<T extends string>(
  items: Prospect[],
  pick: (p: Prospect) => T | null,
): { key: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const item of items) {
    const key = pick(item);
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

export async function buildReport(
  options: { testOnly?: boolean } = {},
): Promise<ProspectingReport> {
  const testOnly = options.testOnly ?? false;
  const all = (await store.list("prospects")) as Prospect[];
  const prospects = all.filter((p) => p.is_test === testOnly);
  const suppressions = await store.list("suppressions");

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  // The distinction that matters. A prospect only becomes a lead once it
  // has responded - discovery alone never promotes anything here.
  const leads = prospects.filter((p) =>
    LEAD_STATUSES_FROM_PROSPECT.includes(p.status),
  );

  const verified = prospects.filter(
    (p) => p.verified_at !== null || p.sources.includes("companies_house"),
  );
  const outreachReady = prospects.filter((p) => p.status === "outreach_ready");
  const needsReview = prospects.filter((p) => p.status === "needs_verification");
  const inactive = prospects.filter((p) =>
    p.flags.some((f) => f.toLowerCase().includes("potentially inactive")),
  );

  const sourceCounts = new Map<SourceId, number>();
  for (const prospect of prospects) {
    for (const source of prospect.sources) {
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    }
  }

  const narrative: string[] = [];
  narrative.push(
    `${prospects.length} organisation${prospects.length === 1 ? "" : "s"} discovered. ` +
      `These are prospects, not leads: nobody listed here has contacted Merry Cleaners.`,
  );
  if (outreachReady.length) {
    narrative.push(
      `${outreachReady.length} are verified, have a published business contact route and rate high priority — these are ready for you to approve an approach.`,
    );
  }
  if (needsReview.length) {
    narrative.push(
      `${needsReview.length} need a human look before anything is sent, usually because the location or activity could not be confirmed.`,
    );
  }
  if (inactive.length) {
    narrative.push(
      `${inactive.length} show signs of no longer trading. They have been flagged rather than deleted, in case the signal is wrong.`,
    );
  }
  narrative.push(
    leads.length === 0
      ? "No prospect has responded yet, so there are no leads from this channel. That number stays at zero until somebody actually gets in touch."
      : `${leads.length} have responded and become real leads. Those are handled by the customer-facing assistant from that point on.`,
  );

  return {
    generated_at: new Date().toISOString(),
    prospects_total: prospects.length,
    prospects_new_this_week: prospects.filter((p) => p.created_at >= weekAgo).length,
    verified: verified.length,
    outreach_ready: outreachReady.length,
    needs_review: needsReview.length,
    potentially_inactive: inactive.length,
    suppressed: suppressions.length,

    actual_leads: leads.length,
    qualified_leads: prospects.filter((p) => p.status === "qualified_lead").length,
    became_customers: prospects.filter((p) => p.status === "customer").length,

    by_type: countBy(prospects, (p) => p.business_type).map(({ key, count }) => ({
      type: key,
      label: BUSINESS_TYPE_LABELS[key],
      count,
    })),
    by_priority: countBy(prospects, (p) => p.qualification.priority).map(
      ({ key, count }) => ({ priority: key, count }),
    ),
    by_borough: countBy(prospects, (p) => p.borough).map(({ key, count }) => ({
      borough: key,
      count,
    })),
    by_status: countBy(prospects, (p) => p.status).map(({ key, count }) => ({
      status: key,
      count,
    })),

    sources_used: [...sourceCounts.entries()].map(([id, count]) => ({
      id,
      label: SOURCE_LABELS[id],
      count,
    })),

    narrative,
  };
}

/** CSV export of the prospect list, for the owner or a future CRM. */
export async function exportProspectsCsv(testOnly = false): Promise<string> {
  const all = (await store.list("prospects")) as Prospect[];
  const prospects = all.filter((p) => p.is_test === testOnly);

  const headers = [
    "Company",
    "Business type",
    "Borough",
    "Postcode",
    "Website",
    "Email",
    "Phone",
    "Companies House",
    "Priority",
    "Status",
    "Potential services",
    "Sources",
    "Source URL",
    "Discovered",
    "Verified",
    "Flags",
  ];

  const escape = (value: string | null) => {
    const text = value ?? "";
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const rows = prospects.map((p) =>
    [
      p.company_name,
      BUSINESS_TYPE_LABELS[p.business_type],
      p.borough,
      p.postcode,
      p.website,
      p.email,
      p.phone,
      p.companies_house_number,
      p.qualification.priority,
      p.status,
      p.qualification.potential_services.join(" | "),
      p.sources.join(" | "),
      p.provenance[0]?.source_url ?? null,
      p.discovered_at.slice(0, 10),
      p.verified_at?.slice(0, 10) ?? null,
      p.flags.join(" | "),
    ]
      .map(escape)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

/* ------------------------------------------------------------------ *
 * Feedback loop
 * ------------------------------------------------------------------ */

export interface OutcomeRow {
  type: BusinessType;
  label: string;
  /** On file, whether or not anyone has approached them. */
  prospects: number;
  /** Approaches the owner has recorded. */
  approached: number;
  /** Prospects that became real leads. */
  leads: number;
  /** Leads from this type that went on to book. */
  booked: number;
  /** Null until there is enough to say anything. */
  response_rate: number | null;
}

export interface OutcomeReport {
  rows: OutcomeRow[];
  total_approached: number;
  total_leads: number;
  total_booked: number;
  /** Whether the numbers are yet large enough to draw a conclusion from. */
  enough_data: boolean;
  narrative: string[];
}

/**
 * What is actually working.
 *
 * The honest version of a conversion report. Two things it will not do: it
 * will not compute a percentage from two or three approaches and present it as
 * a rate, and it will not rank business types by a response rate that no data
 * supports. Until there is a real sample it says so, because a made-up rate
 * would send the owner off to prioritise the wrong audience.
 */
export async function buildOutcomes(): Promise<OutcomeReport> {
  const all = (await store.list("prospects")) as Prospect[];
  const prospects = all.filter((p) => !p.is_test);
  const bookings = await store.list("bookings");

  const bookedLeadIds = new Set(
    bookings
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .map((b) => b.lead_id),
  );

  const APPROACHED: ProspectStatus[] = [
    "contacted",
    ...LEAD_STATUSES_FROM_PROSPECT,
  ];

  const types = [...new Set(prospects.map((p) => p.business_type))];
  const rows: OutcomeRow[] = types
    .map((type) => {
      const forType = prospects.filter((p) => p.business_type === type);
      const approached = forType.filter((p) => APPROACHED.includes(p.status));
      const leads = forType.filter((p) => p.lead_id !== null);
      const booked = leads.filter(
        (p) => p.lead_id !== null && bookedLeadIds.has(p.lead_id),
      );
      return {
        type,
        label: BUSINESS_TYPE_LABELS[type],
        prospects: forType.length,
        approached: approached.length,
        leads: leads.length,
        booked: booked.length,
        // A rate needs a sample. Ten approaches is still thin, but below that
        // a percentage is actively misleading.
        response_rate:
          approached.length >= 10
            ? Math.round((leads.length / approached.length) * 100)
            : null,
      };
    })
    .sort((a, b) => b.approached - a.approached || b.prospects - a.prospects);

  const totalApproached = rows.reduce((sum, r) => sum + r.approached, 0);
  const totalLeads = rows.reduce((sum, r) => sum + r.leads, 0);
  const totalBooked = rows.reduce((sum, r) => sum + r.booked, 0);
  const enough = totalApproached >= 10;

  const narrative: string[] = [];
  if (totalApproached === 0) {
    narrative.push(
      "No approach has been recorded yet, so there is nothing to learn from. " +
        "This table fills in as you mark records as contacted and log the ones that reply.",
    );
  } else if (!enough) {
    narrative.push(
      `${totalApproached} approach${totalApproached === 1 ? "" : "es"} recorded and ` +
        `${totalLeads} repl${totalLeads === 1 ? "y" : "ies"}. That is too few to calculate a ` +
        "response rate from — a percentage of five approaches would tell you nothing. " +
        "Rates appear once any audience reaches ten.",
    );
  } else {
    const best = rows.filter((r) => r.response_rate !== null);
    narrative.push(
      `${totalApproached} approaches recorded, ${totalLeads} replies, ${totalBooked} booked.`,
    );
    if (best.length > 0) {
      const top = best[0];
      narrative.push(
        `${top.label} is the audience with the most data behind it: ` +
          `${top.approached} approached, ${top.leads} replied (${top.response_rate}%).`,
      );
    }
    narrative.push(
      "Treat these as a steer, not a verdict. Response rates on small numbers move a lot.",
    );
  }

  return {
    rows,
    total_approached: totalApproached,
    total_leads: totalLeads,
    total_booked: totalBooked,
    enough_data: enough,
    narrative,
  };
}
