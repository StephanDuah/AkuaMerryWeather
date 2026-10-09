import { newId, store } from "@/lib/db";
import { logCommunication } from "@/lib/comms";
import { CLOSED_STATUSES } from "@/lib/types";
import type {
  CustomerSegment,
  Lead,
  LeadSource,
  LeadStatus,
  PropertyType,
  ServiceType,
} from "@/lib/types";

/**
 * Lead capture and the follow-up schedule.
 *
 * UK GDPR note: we collect only what is needed to quote and deliver the
 * clean. The lawful basis recorded against each lead is "legitimate
 * interest" for a business enquiry that has not yet converted, moving to
 * "contract" once a booking exists. The retention sweep in
 * /admin/settings is what eventually removes stale records.
 */

export interface CreateLeadInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postcode?: string | null;
  property_type?: PropertyType | null;
  bedrooms?: number | null;
  floor_area_sqft?: number | null;
  service_type?: ServiceType | null;
  addons?: string[];
  preferred_date?: string | null;
  segment?: CustomerSegment;
  source: LeadSource;
  notes?: string | null;
  quote_low?: number | null;
  quote_high?: number | null;
  marketing_consent?: boolean;
  consent_text?: string | null;
}

/** Minutes/hours the owner has configured, resolved at call time. */
async function followupSchedule() {
  const settings = await store.getSettings();
  return {
    first: settings.followup_1_minutes,
    second: settings.followup_2_hours,
  };
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const schedule = await followupSchedule();
  const now = new Date();
  const lead: Lead = {
    id: newId("lead"),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    name: input.name ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    postcode: input.postcode ? input.postcode.toUpperCase() : null,
    property_type: input.property_type ?? null,
    bedrooms: input.bedrooms ?? null,
    floor_area_sqft: input.floor_area_sqft ?? null,
    service_type: input.service_type ?? null,
    addons: input.addons ?? [],
    preferred_date: input.preferred_date ?? null,
    segment: input.segment ?? "unknown",
    source: input.source,
    status: "new",
    quote_low: input.quote_low ?? null,
    quote_high: input.quote_high ?? null,
    notes: input.notes ?? null,
    lawful_basis: "legitimate_interest",
    marketing_consent: input.marketing_consent ?? false,
    consent_text: input.consent_text ?? null,
    followup_stage: 0,
    next_followup_at: new Date(
      now.getTime() + schedule.first * 60 * 1000,
    ).toISOString(),
    followup_paused: false,
  };

  const saved = await store.insert("leads", lead);
  await logCommunication({
    lead_id: saved.id,
    channel: input.source === "website_chat" ? "chat" : "system",
    direction: "inbound",
    status: "logged",
    body: `Lead captured via ${input.source.replace(/_/g, " ")}.`,
    template: "lead_created",
  });
  return saved;
}

export async function updateLead(
  id: string,
  patch: Partial<Lead>,
): Promise<Lead | null> {
  return store.update("leads", id, {
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

export async function setLeadStatus(
  id: string,
  status: LeadStatus,
): Promise<Lead | null> {
  const patch: Partial<Lead> = {
    status,
    updated_at: new Date().toISOString(),
  };
  // A closed lead - booked, won, lost, unqualified or handed to a human -
  // never receives another automated nudge.
  if (CLOSED_STATUSES.includes(status)) {
    patch.followup_paused = true;
    patch.next_followup_at = null;
  }
  return store.update("leads", id, patch);
}

export async function getLead(id: string): Promise<Lead | null> {
  return store.get("leads", id);
}

export async function listLeads(): Promise<Lead[]> {
  const leads = await store.list("leads");
  return leads.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * Finds an existing lead for the same person before creating a duplicate.
 * Matching on email first, then phone, keeps one history per customer.
 */
export async function findLead(
  email?: string | null,
  phone?: string | null,
): Promise<Lead | null> {
  const leads = await store.list("leads");
  const normalisedPhone = phone ? phone.replace(/[^\d]/g, "").slice(-10) : null;
  return (
    leads.find((lead) => {
      if (email && lead.email && lead.email.toLowerCase() === email.toLowerCase()) {
        return true;
      }
      if (normalisedPhone && lead.phone) {
        return lead.phone.replace(/[^\d]/g, "").slice(-10) === normalisedPhone;
      }
      return false;
    }) ?? null
  );
}

/** Which audience a lead belongs to, inferred from what they told us. */
export function inferSegment(text: string): CustomerSegment {
  const value = text.toLowerCase();
  if (/estate agent|letting agent|lettings|managing agent|property manager/.test(value)) {
    return "estate_agent";
  }
  if (/airbnb|short let|short-term let|holiday let|serviced apartment/.test(value)) {
    return "airbnb_host";
  }
  if (/landlord|portfolio|rental property|buy to let/.test(value)) {
    return "landlord";
  }
  if (/office|company|business|studio|workspace|our team|staff|premises/.test(value)) {
    return "business_office";
  }
  if (/tenant|moving out|my landlord|deposit/.test(value)) {
    return "tenant";
  }
  if (/my home|my house|my flat|household/.test(value)) {
    return "homeowner";
  }
  return "unknown";
}
