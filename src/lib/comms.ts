import { newId, store } from "@/lib/db";
import type {
  Communication,
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  Escalation,
  EscalationReason,
} from "@/lib/types";

/**
 * Communications log and escalations inbox.
 *
 * Every message in or out of the business is written to the communications
 * log against the lead it belongs to, which is what makes the lead history
 * in the admin dashboard complete.
 */

export interface LogInput {
  lead_id?: string | null;
  booking_id?: string | null;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  status?: CommunicationStatus;
  subject?: string | null;
  body: string;
  template?: string | null;
  to_address?: string | null;
  sent_at?: string | null;
}

export async function logCommunication(input: LogInput): Promise<Communication> {
  const record: Communication = {
    id: newId("comm"),
    created_at: new Date().toISOString(),
    lead_id: input.lead_id ?? null,
    booking_id: input.booking_id ?? null,
    channel: input.channel,
    direction: input.direction,
    status: input.status ?? "logged",
    subject: input.subject ?? null,
    body: input.body,
    template: input.template ?? null,
    to_address: input.to_address ?? null,
    sent_at: input.sent_at ?? null,
  };
  return store.insert("communications", record);
}

export interface EscalationInput {
  reason: EscalationReason;
  summary: string;
  detail: string;
  lead_id?: string | null;
  booking_id?: string | null;
  communication_id?: string | null;
  draft_subject?: string | null;
  draft_body?: string | null;
  draft_to?: string | null;
}

/**
 * Raises an item for the owner's attention. Anything the system is not
 * confident about ends up here rather than in front of a customer.
 */
export async function createEscalation(
  input: EscalationInput,
): Promise<Escalation> {
  const record: Escalation = {
    id: newId("esc"),
    created_at: new Date().toISOString(),
    resolved_at: null,
    lead_id: input.lead_id ?? null,
    booking_id: input.booking_id ?? null,
    communication_id: input.communication_id ?? null,
    reason: input.reason,
    summary: input.summary,
    detail: input.detail,
    status: "open",
    draft_subject: input.draft_subject ?? null,
    draft_body: input.draft_body ?? null,
    draft_to: input.draft_to ?? null,
  };
  return store.insert("escalations", record);
}

export async function resolveEscalation(id: string): Promise<Escalation | null> {
  return store.update("escalations", id, {
    status: "resolved",
    resolved_at: new Date().toISOString(),
  });
}

export async function leadHistory(leadId: string): Promise<Communication[]> {
  const all = await store.list("communications", { lead_id: leadId });
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
