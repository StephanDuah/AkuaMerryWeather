import { checkSharedSecret, refuse, safeErrorMessage } from "@/lib/security/secrets";
import { runDailyProspecting } from "@/lib/prospecting/daily";

/**
 * The scheduled prospecting run.
 *
 * Discovery and verification only. This endpoint cannot send anything to
 * anybody: outreach is prepared on the record and approved by the owner by
 * hand, and there is no code path from here to a message.
 *
 * Scheduled once a day. Vercel's free Hobby plan allows one cron run per day,
 * which suits this exactly - see DECISIONS.md and vercel.json. The same URL
 * works from cron-job.org with `?secret=` if the schedule ever moves off
 * Vercel.
 *
 * A source asking us to slow down is reported as a stopped run, not retried.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Discovery plus verification of a dozen records needs longer than default. */
export const maxDuration = 300;


async function handle(request: Request) {
  const auth = checkSharedSecret(request, "CRON_SECRET");
  if (!auth.ok) {
    console.warn(`[merry-cleaners] cron refused: ${auth.reason}`);
    return refuse();
  }
  try {
    const result = await runDailyProspecting();
    return Response.json({
      ok: true,
      ...result,
      contacted: 0,
      note: "Discovery and verification only. Nobody was contacted.",
    });
  } catch (error) {
    console.error("[merry-cleaners] Daily prospecting run failed:", error);
    return Response.json(
      { ok: false, error: safeErrorMessage(error) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
