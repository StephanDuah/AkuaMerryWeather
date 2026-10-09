import { store } from "@/lib/db";
import type { Lead } from "@/lib/types";

/**
 * UK GDPR retention and erasure.
 *
 * Data minimisation is handled at capture (we ask only for what a quote and
 * a clean require). This module handles the other half: getting rid of data
 * once it no longer has a purpose, and honouring a deletion request.
 *
 * Lawful basis recorded on each lead:
 *   - legitimate_interest for an unconverted business enquiry
 *   - contract once a booking exists
 * Retention default is 24 months from last contact, which the owner can
 * change in /admin/settings.
 */

export interface RetentionCandidate {
  lead: Lead;
  last_activity: string;
  months_old: number;
  has_bookings: boolean;
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
  );
}

export async function findExpiredLeads(
  now = new Date(),
): Promise<RetentionCandidate[]> {
  const settings = await store.getSettings();
  const leads = await store.list("leads");
  const bookings = await store.list("bookings");

  return leads
    .map((lead) => {
      const leadBookings = bookings.filter((b) => b.lead_id === lead.id);
      const dates = [
        lead.updated_at,
        lead.created_at,
        ...leadBookings.map((b) => b.date),
      ].filter(Boolean);
      const last = dates.sort().at(-1) ?? lead.created_at;
      return {
        lead,
        last_activity: last,
        months_old: monthsBetween(new Date(last), now),
        has_bookings: leadBookings.length > 0,
      };
    })
    .filter((candidate) => candidate.months_old >= settings.retention_months);
}

/**
 * Erases a lead and everything attached to it. Used both by the retention
 * sweep and by the "delete this record" control in the admin dashboard,
 * which is how a subject erasure request is honoured.
 */
export async function eraseLead(leadId: string): Promise<{
  lead: boolean;
  communications: number;
  escalations: number;
  bookings: number;
}> {
  const communications = await store.list("communications", { lead_id: leadId });
  const escalations = await store.list("escalations", { lead_id: leadId });
  const bookings = await store.list("bookings", { lead_id: leadId });

  for (const item of communications) await store.remove("communications", item.id);
  for (const item of escalations) await store.remove("escalations", item.id);
  for (const item of bookings) await store.remove("bookings", item.id);
  const removed = await store.remove("leads", leadId);

  return {
    lead: removed,
    communications: communications.length,
    escalations: escalations.length,
    bookings: bookings.length,
  };
}

export async function runRetentionSweep(): Promise<{ erased: number }> {
  const expired = await findExpiredLeads();
  for (const candidate of expired) {
    await eraseLead(candidate.lead.id);
  }
  return { erased: expired.length };
}
