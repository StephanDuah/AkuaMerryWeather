import { checkSharedSecret, refuse } from "@/lib/security/secrets";
import { findExpiredLeads, runRetentionSweep } from "@/lib/retention";

/**
 * UK GDPR retention sweep.
 *
 * GET reports what is due for erasure; POST performs it. Running this on a
 * schedule is what keeps the retention promise in the privacy notice true.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request: Request) {
  const auth = checkSharedSecret(request, "CRON_SECRET");
  if (!auth.ok) {
    console.warn(`[merry-cleaners] cron refused: ${auth.reason}`);
    return refuse();
  }
  const due = await findExpiredLeads();
  return Response.json({
    ok: true,
    due_for_erasure: due.length,
    leads: due.map((candidate) => ({
      id: candidate.lead.id,
      months_since_last_activity: candidate.months_old,
      has_bookings: candidate.has_bookings,
    })),
  });
}

export async function POST(request: Request) {
  const auth = checkSharedSecret(request, "CRON_SECRET");
  if (!auth.ok) {
    console.warn(`[merry-cleaners] cron refused: ${auth.reason}`);
    return refuse();
  }
  const result = await runRetentionSweep();
  return Response.json({ ok: true, ...result });
}
