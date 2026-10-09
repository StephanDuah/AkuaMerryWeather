import { store } from "@/lib/db";
import { recordAgentAction, newTraceId } from "@/lib/agent/audit";
import { BOROUGHS } from "./boroughs";
import { listCampaigns } from "./campaigns";
import { runCampaign } from "./pipeline";
import type { Campaign, Prospect, RunSummary } from "./types";

/**
 * The daily prospecting run.
 *
 * One enabled campaign, one borough, once a day. Deliberately small, for
 * three reasons:
 *
 *  - The free sources ask for restraint. OpenStreetMap's Overpass API is
 *    donated infrastructure and rate-limits by address; a nightly run of a
 *    dozen queries is a fair use of it, a sweep of all 33 boroughs is not.
 *  - Prospects are worth nothing in bulk. The owner reads each record and
 *    approves each approach by hand, so a hundred a night would only build a
 *    backlog that makes the whole list feel worthless.
 *  - A small run is cheap to reason about when something goes wrong.
 *
 * Coverage comes from rotation, not volume. Which slice runs today is worked
 * out from the date rather than from a stored cursor: the borough advances
 * each day, and the campaign advances each time the borough list wraps. That
 * keeps this stateless, which matters more than strict sequencing here - a
 * missed night, a redeploy or two instances firing at once cannot corrupt a
 * position, and the rotation still reaches every borough. One pass over
 * London takes about a month, which is roughly the rate at which the
 * underlying public records actually change.
 *
 * Nothing here contacts anybody. The run discovers and verifies; every
 * approach still waits for the owner to read the record and approve it.
 */

/** How many organisations one nightly run may look at. */
export const DAILY_LIMIT = 12;

/** Days since the epoch: the rotation's clock. */
function dayNumber(now = new Date()): number {
  return Math.floor(now.getTime() / 86_400_000);
}

/** Which campaign and borough belong to a given day. */
export function sliceForDay(
  campaigns: Campaign[],
  day = dayNumber(),
): { campaign: Campaign; borough: string; boroughs: string[]; position: number } | null {
  const enabled = campaigns.filter((c) => c.enabled);
  if (enabled.length === 0) return null;

  // Borough list is the campaign's own where it names one, otherwise all of
  // London in the order boroughs.ts defines - central first, where the
  // density of agents and offices is highest.
  const first = enabled[0];
  const listFor = (campaign: Campaign) =>
    campaign.boroughs.length ? campaign.boroughs : BOROUGHS.map((b) => b.name);

  // The campaign turns over once per full borough pass, so both rotate.
  const passLength = listFor(first).length;
  const campaign = enabled[Math.floor(day / passLength) % enabled.length];
  const boroughs = listFor(campaign);
  const position = day % boroughs.length;

  return { campaign, borough: boroughs[position], boroughs, position };
}

export interface DailyRunResult {
  ran: boolean;
  /** Why nothing ran, when nothing did. */
  reason: string | null;
  campaign: string | null;
  borough: string | null;
  summary: RunSummary | null;
  /** Plain-English line for the owner's report. */
  narrative: string;
}

/**
 * Runs today's slice.
 *
 * Returns rather than throws when there is nothing to do, so the scheduled
 * endpoint can report a quiet night as a success instead of a failure.
 */
export async function runDailyProspecting(
  options: { limit?: number; verify?: boolean; day?: number } = {},
): Promise<DailyRunResult> {
  const limit = options.limit ?? DAILY_LIMIT;
  const verify = options.verify ?? true;
  const traceId = newTraceId();

  const slice = sliceForDay(await listCampaigns(), options.day);
  if (!slice) {
    return {
      ran: false,
      reason: "No prospecting campaign is switched on.",
      campaign: null,
      borough: null,
      summary: null,
      narrative: "Nothing ran: no prospecting campaign is switched on.",
    };
  }

  let summary: RunSummary | null = null;
  let error: string | null = null;
  try {
    summary = await runCampaign({
      campaign: { ...slice.campaign, boroughs: [slice.borough] },
      limit,
      verify,
      markAsTest: false,
    });
  } catch (caught) {
    // A source asking us to stop is not a failure to work around. The run
    // ends, and tomorrow's slice is a different borough anyway.
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const narrative = error
    ? `${slice.campaign.name} in ${slice.borough}: the run stopped early — ${error}. Nothing was retried; the sweep moves on tomorrow.`
    : `${slice.campaign.name} in ${slice.borough}: ${summary?.candidates_found ?? 0} looked at, ` +
      `${summary?.new_prospects ?? 0} new, ${summary?.duplicates_merged ?? 0} already on file, ` +
      `${summary?.suppressed ?? 0} skipped as do-not-contact. Nobody was contacted.`;

  await recordAgentAction({
    trace_id: traceId,
    channel: "system",
    tool: "daily_prospecting_run",
    summary: narrative,
    outcome: error ? "error" : "ok",
    actor: "prospecting",
    error,
  });

  return {
    ran: !error,
    reason: error,
    campaign: slice.campaign.name,
    borough: slice.borough,
    summary,
    narrative,
  };
}

/** Where the sweep is up to, for the dashboard. */
export async function dailyProgress(): Promise<{
  today_campaign: string | null;
  today_borough: string | null;
  tomorrow_borough: string | null;
  position: number;
  boroughs_total: number;
  last_run_at: string | null;
  last_run_summary: string | null;
  prospects_from_campaigns: number;
}> {
  const campaigns = await listCampaigns();
  const today = sliceForDay(campaigns);
  const tomorrow = sliceForDay(campaigns, dayNumber() + 1);

  const ranCampaigns = campaigns
    .filter((c) => c.last_run_at)
    .sort((a, b) => (b.last_run_at ?? "").localeCompare(a.last_run_at ?? ""));

  const all = (await store.list("prospects")) as Prospect[];
  const fromCampaigns = all.filter(
    (p) => !p.is_test && p.campaign_id !== null && p.campaign_id !== "adhoc",
  ).length;

  return {
    today_campaign: today?.campaign.name ?? null,
    today_borough: today?.borough ?? null,
    tomorrow_borough: tomorrow?.borough ?? null,
    position: today ? today.position + 1 : 0,
    boroughs_total: today?.boroughs.length ?? 0,
    last_run_at: ranCampaigns[0]?.last_run_at ?? null,
    last_run_summary: ranCampaigns[0]?.last_run_summary ?? null,
    prospects_from_campaigns: fromCampaigns,
  };
}
