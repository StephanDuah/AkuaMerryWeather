import { store } from "@/lib/db";
import { createEscalation, logCommunication } from "@/lib/comms";
import { followUpOne, followUpTwo } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { sendWhatsApp, whatsappConfigured } from "@/lib/integrations/whatsapp";
import type { Lead } from "@/lib/types";

/**
 * Lead follow-up automation.
 *
 * Cadence (configurable in /admin/settings):
 *   Stage 1 - five minutes after an enquiry that has not converted, a short
 *             thank-you confirming the enquiry reached us.
 *   Stage 2 - 36 hours later, one polite check-in. Then we stop.
 *
 * Two nudges is the limit by design: a premium brand does not chase. A lead
 * that books, is marked lost, or replies is taken out of the sequence.
 */

const ELIGIBLE_STATUSES = new Set([
  "new",
  "contacted",
  "qualified",
  "quote_requested",
  "quote_sent",
  "follow_up",
]);

export interface FollowUpRun {
  considered: number;
  sent: number;
  skipped: number;
  escalated: number;
  details: { lead_id: string; action: string }[];
}

export async function runFollowUps(now = new Date()): Promise<FollowUpRun> {
  const settings = await store.getSettings();
  const leads = await store.list("leads");
  const run: FollowUpRun = {
    considered: 0,
    sent: 0,
    skipped: 0,
    escalated: 0,
    details: [],
  };

  for (const lead of leads) {
    if (lead.followup_paused) continue;
    if (!ELIGIBLE_STATUSES.has(lead.status)) continue;
    if (!lead.next_followup_at) continue;
    if (new Date(lead.next_followup_at) > now) continue;

    run.considered += 1;

    if (lead.followup_stage >= 2) {
      await store.update("leads", lead.id, {
        next_followup_at: null,
        followup_paused: true,
      });
      run.skipped += 1;
      continue;
    }

    const stage = lead.followup_stage === 0 ? 1 : 2;
    const content = stage === 1 ? followUpOne(lead) : followUpTwo(lead);

    if (!lead.email) {
      await handleNoEmail(lead, stage, run);
      continue;
    }

    await sendEmail({
      to: lead.email,
      subject: content.subject,
      body: content.body,
      lead_id: lead.id,
      template: `followup_${stage}`,
    });

    await store.update("leads", lead.id, {
      followup_stage: stage as 1 | 2,
      status: "follow_up",
      updated_at: new Date().toISOString(),
      next_followup_at:
        stage === 1
          ? new Date(
              now.getTime() + settings.followup_2_hours * 60 * 60 * 1000,
            ).toISOString()
          : null,
      followup_paused: stage === 2,
    });

    run.sent += 1;
    run.details.push({ lead_id: lead.id, action: `followup_${stage}_sent` });
  }

  return run;
}

/**
 * A lead with a telephone number but no email address still deserves a
 * follow-up. WhatsApp is used where it is configured; otherwise the owner
 * is asked to make the call themselves.
 */
async function handleNoEmail(lead: Lead, stage: number, run: FollowUpRun) {
  if (lead.phone && whatsappConfigured()) {
    await sendWhatsApp({
      to: lead.phone,
      body:
        "Thank you for your enquiry with Merry Cleaners. Your details have reached our team and we will be in touch shortly to confirm everything.",
      lead_id: lead.id,
      template: `followup_${stage}_whatsapp`,
    });
    await store.update("leads", lead.id, {
      followup_stage: stage as 1 | 2,
      status: "follow_up",
      next_followup_at: null,
      followup_paused: stage === 2,
    });
    run.sent += 1;
    run.details.push({ lead_id: lead.id, action: `followup_${stage}_whatsapp` });
    return;
  }

  await createEscalation({
    reason: "manual",
    summary: `Follow-up needed by telephone: ${lead.name ?? "unnamed enquiry"}`,
    detail:
      `This lead has no email address, so the automated follow-up could not be sent. ` +
      `Telephone: ${lead.phone ?? "not supplied"}. Service: ${lead.service_type ?? "not stated"}.`,
    lead_id: lead.id,
  });
  await logCommunication({
    lead_id: lead.id,
    channel: "system",
    direction: "outbound",
    body: "Automated follow-up could not be sent: no email address on file.",
    template: `followup_${stage}_blocked`,
  });
  await store.update("leads", lead.id, {
    followup_stage: stage as 1 | 2,
    next_followup_at: null,
    followup_paused: true,
  });
  run.escalated += 1;
  run.details.push({ lead_id: lead.id, action: "escalated_no_email" });
}
