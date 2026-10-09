import { getAvailability, SLOT_LABELS } from "@/lib/booking";

/** Free booking slots, used by the website and by the assistant. */

import { rateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "read", "Too many requests. Please wait a moment.");
  if (limited) return limited;

  const url = new URL(request.url);
  const raw = Number(url.searchParams.get("days") ?? 14);
  // Reject anything non-numeric rather than letting NaN through.
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 45) : 14;
  const slots = await getAvailability(days);
  return Response.json({
    ok: true,
    slot_labels: SLOT_LABELS,
    slots: slots.filter((slot) => slot.available),
  });
}
