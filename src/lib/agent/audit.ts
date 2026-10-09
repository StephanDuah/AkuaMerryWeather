import { newId, store } from "@/lib/db";
import type {
  AgentAction,
  AgentChannel,
  AgentOutcome,
} from "@/lib/types";

/**
 * Audit trail for agent actions.
 *
 * Every tool the agent runs is recorded: which tool, what it decided, and
 * whether a human was pulled in. This is what makes the system auditable -
 * the owner can answer "why did it say that?" after the fact, which matters
 * both for trust and for UK GDPR accountability.
 *
 * Deliberately NOT stored here: raw message text and unredacted personal
 * data. The summary is a short description; the customer's own details live
 * on the lead record, where the retention and erasure rules apply to them.
 */

export interface RecordActionInput {
  trace_id: string;
  channel: AgentChannel;
  tool: string;
  summary: string;
  outcome: AgentOutcome;
  lead_id?: string | null;
  booking_id?: string | null;
  actor?: string;
  duration_ms?: number | null;
  error?: string | null;
}

/** Trims and strips anything that looks like contact detail from a summary. */
export function redact(text: string, max = 240): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(\+?44\s?7\d{3}|\(?07\d{3}\)?)[\s.-]?\d{3}[\s.-]?\d{3}/g, "[phone]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function newTraceId(): string {
  return newId("trace");
}

export async function recordAgentAction(
  input: RecordActionInput,
): Promise<AgentAction> {
  const action: AgentAction = {
    id: newId("act"),
    created_at: new Date().toISOString(),
    trace_id: input.trace_id,
    channel: input.channel,
    tool: input.tool,
    summary: redact(input.summary),
    outcome: input.outcome,
    lead_id: input.lead_id ?? null,
    booking_id: input.booking_id ?? null,
    actor: input.actor ?? "rules",
    duration_ms: input.duration_ms ?? null,
    error: input.error ? redact(input.error, 300) : null,
  };

  try {
    return await store.insert("agent_actions", action);
  } catch (error) {
    // Auditing must never break the customer-facing path.
    console.error("[merry-cleaners] Failed to record agent action:", error);
    return action;
  }
}

export async function listAgentActions(limit = 200): Promise<AgentAction[]> {
  const actions = await store.list("agent_actions");
  return actions
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function actionsForLead(leadId: string): Promise<AgentAction[]> {
  const actions = await store.list("agent_actions", { lead_id: leadId });
  return actions.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
