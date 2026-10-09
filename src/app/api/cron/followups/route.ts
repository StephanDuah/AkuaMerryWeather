import { checkSharedSecret, refuse, safeErrorMessage } from "@/lib/security/secrets";
import { runFollowUps } from "@/lib/followups";

/**
 * Scheduled follow-up sweep.
 *
 * Vercel's free Hobby plan runs cron jobs once a day, which is not often
 * enough for a five-minute first follow-up. In development the browser-side
 * ticker in the admin dashboard calls this endpoint; in production the
 * recommended free arrangement is a five-minute schedule on cron-job.org
 * calling this URL with the CRON_SECRET. See DECISIONS.md.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


async function handle(request: Request) {
  const auth = checkSharedSecret(request, "CRON_SECRET");
  if (!auth.ok) {
    console.warn(`[merry-cleaners] cron refused: ${auth.reason}`);
    return refuse();
  }
  try {
    const result = await runFollowUps();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[merry-cleaners] Follow-up sweep failed:", error);
    return Response.json(
      { ok: false, error: safeErrorMessage(error) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
