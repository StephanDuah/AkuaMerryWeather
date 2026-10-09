import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { newId, store } from "@/lib/db";
import {
  availableSources,
  importCandidates,
  runCampaign,
  verifyProspect,
} from "@/lib/prospecting/pipeline";
import { parseProspectCsv } from "@/lib/prospecting/sources/csv";
import { normaliseSuppressionIdentifier } from "@/lib/prospecting/dedupe";
import { buildReport, exportProspectsCsv } from "@/lib/prospecting/report";
import { listCampaigns } from "@/lib/prospecting/campaigns";
import type {
  BusinessType,
  Campaign,
  Prospect,
  Suppression,
} from "@/lib/prospecting/types";

/**
 * Prospecting API.
 *
 * Every route here is owner-only: prospecting data is commercially
 * sensitive and, where it touches named individuals, personal. There is no
 * public surface to any of it.
 *
 * Routed through one handler on `?action=` so the whole feature sits behind
 * a single authorisation check rather than eight.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUSINESS_TYPES = [
  "estate_agent",
  "letting_agent",
  "property_management",
  "commercial_office",
  "coworking_space",
  "restaurant",
  "retail",
  "hospitality",
  "short_let_management",
  "landlord_operator",
  "construction_property",
  "other_business",
] as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { action } = await context.params;
  const url = new URL(request.url);
  const testOnly = url.searchParams.get("test") === "1";

  switch (action) {
    case "sources":
      return Response.json({ ok: true, sources: availableSources() });

    case "campaigns":
      return Response.json({ ok: true, campaigns: await listCampaigns() });

    case "prospects": {
      const all = (await store.list("prospects")) as Prospect[];
      const filtered = all.filter((p) => p.is_test === testOnly);
      return Response.json({
        ok: true,
        count: filtered.length,
        prospects: filtered
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 300),
      });
    }

    case "report":
      return Response.json({
        ok: true,
        report: await buildReport({ testOnly }),
      });

    /* ---- CSV download for the owner, or for a future CRM ---- */
    case "export": {
      const csv = await exportProspectsCsv(testOnly);
      const stamp = new Date().toISOString().slice(0, 10);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="merry-cleaners-prospects${
            testOnly ? "-TEST-DATA" : ""
          }-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    default:
      return Response.json({ ok: false, error: "Unknown action." }, { status: 404 });
  }
}

const discoverSchema = z.object({
  businessTypes: z.array(z.enum(BUSINESS_TYPES)).min(1).max(6),
  borough: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(50).default(15),
  verify: z.boolean().default(false),
  markAsTest: z.boolean().default(false),
});

const importSchema = z.object({
  csv: z.string().min(10).max(2_000_000),
  markAsTest: z.boolean().default(false),
  sourceLabel: z.string().max(200).optional(),
});

const suppressSchema = z.object({
  identifier: z.string().min(2).max(200),
  identifier_type: z.enum(["domain", "email", "phone", "company_name", "ch_number"]),
  reason: z.string().min(2).max(300),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { action } = await context.params;
  const payload = await request.json().catch(() => ({}));

  switch (action) {
    /* ---- discovery from live sources ---- */
    case "discover": {
      const parsed = discoverSchema.safeParse(payload);
      if (!parsed.success) {
        return Response.json(
          { ok: false, error: "Invalid discovery request." },
          { status: 400 },
        );
      }
      const { businessTypes, borough, limit, verify, markAsTest } = parsed.data;

      const campaign: Campaign = {
        id: "adhoc",
        created_at: new Date().toISOString(),
        name: `Ad-hoc: ${businessTypes.join(", ")}${borough ? ` in ${borough}` : ""}`,
        description: "Run from the dashboard",
        target_types: businessTypes as BusinessType[],
        boroughs: borough ? [borough] : [],
        sources: ["openstreetmap", "companies_house"],
        enabled: true,
        last_run_at: null,
        last_run_summary: null,
      };

      try {
        const summary = await runCampaign({ campaign, limit, verify, markAsTest });
        const all = (await store.list("prospects")) as Prospect[];
        // Only what this run discovered, so the sample reflects the run
        // rather than whatever else is already on file.
        const sample = all
          .filter((p) => p.is_test === markAsTest && p.campaign_id === "adhoc")
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 8)
          .map((p) => ({
            company_name: p.company_name,
            business_type: p.business_type,
            borough: p.borough,
            website: p.website,
            priority: p.qualification.priority,
            status: p.status,
            source_url: p.provenance[0]?.source_url ?? null,
          }));
        return Response.json({ ok: true, summary, sample });
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          { status: 502 },
        );
      }
    }

    /* ---- CSV import, for sources that prohibit automated access ---- */
    case "import": {
      const parsed = importSchema.safeParse(payload);
      if (!parsed.success) {
        return Response.json({ ok: false, error: "Invalid CSV payload." }, { status: 400 });
      }
      const { candidates, skipped, headers } = parseProspectCsv(parsed.data.csv, {
        sourceLabel: parsed.data.sourceLabel,
      });
      const summary = await importCandidates(candidates, {
        markAsTest: parsed.data.markAsTest,
      });
      return Response.json({ ok: true, summary, skipped, headers });
    }

    /* ---- verification of a single prospect ---- */
    case "verify": {
      const id = typeof payload.id === "string" ? payload.id : null;
      if (!id) return Response.json({ ok: false, error: "No id." }, { status: 400 });
      const prospect = await verifyProspect(id);
      return Response.json({ ok: Boolean(prospect), prospect });
    }

    /* ---- do-not-contact ---- */
    case "suppress": {
      const parsed = suppressSchema.safeParse(payload);
      if (!parsed.success) {
        return Response.json({ ok: false, error: "Invalid suppression." }, { status: 400 });
      }
      const { identifier, identifier_type, reason } = parsed.data;
      const entry: Suppression = {
        id: newId("supp"),
        created_at: new Date().toISOString(),
        identifier: normaliseSuppressionIdentifier(identifier, identifier_type),
        identifier_type,
        reason,
        created_by: "owner",
        source: "dashboard",
      };
      await store.insert("suppressions", entry);

      // Anything already on file that matches is marked, not deleted -
      // the owner may need to see why it was excluded.
      const all = (await store.list("prospects")) as Prospect[];
      let marked = 0;
      for (const prospect of all) {
        const matches =
          (identifier_type === "domain" &&
            prospect.website?.toLowerCase().includes(entry.identifier)) ||
          (identifier_type === "email" && prospect.email?.toLowerCase() === entry.identifier) ||
          (identifier_type === "ch_number" &&
            prospect.companies_house_number === entry.identifier);
        if (matches) {
          await store.update("prospects", prospect.id, {
            status: "do_not_contact",
            flags: [...new Set([...prospect.flags, `Suppressed: ${reason}`])],
          });
          marked += 1;
        }
      }
      return Response.json({ ok: true, suppression: entry, marked });
    }

    /* ---- remove synthetic test data ---- */
    case "purge-test": {
      if (payload.confirm !== true) {
        return Response.json({ ok: false, error: "Confirmation required." }, { status: 400 });
      }
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
      return Response.json({ ok: true, removed });
    }

    default:
      return Response.json({ ok: false, error: "Unknown action." }, { status: 404 });
  }
}
