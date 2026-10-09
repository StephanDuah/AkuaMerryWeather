import { Resend } from "resend";
import { logCommunication } from "@/lib/comms";
import { BUSINESS } from "@/lib/content";

/**
 * Outbound email.
 *
 * Resend is used when RESEND_API_KEY is present. Without it, messages are
 * written to the communications log with status "queued" and marked as
 * simulated, so the whole follow-up and approval flow can be exercised
 * locally before any account exists.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  lead_id?: string | null;
  booking_id?: string | null;
  template?: string | null;
}

export interface SendEmailResult {
  sent: boolean;
  simulated: boolean;
  error?: string;
}

export function emailConfigured(): boolean {
  // Mock mode disables real sending outright, so a rehearsal can never reach
  // a customer even with Resend fully connected.
  if (process.env.MOCK_MODE === "true") return false;
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!emailConfigured()) {
    await logCommunication({
      lead_id: input.lead_id ?? null,
      booking_id: input.booking_id ?? null,
      channel: "email",
      direction: "outbound",
      status: "queued",
      subject: input.subject,
      body: `[SIMULATED - no email provider configured]\n\n${input.body}`,
      template: input.template ?? null,
      to_address: input.to,
    });
    return { sent: false, simulated: true };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM as string,
      to: input.to,
      replyTo: BUSINESS.email,
      subject: input.subject,
      text: input.body,
    });
    if (error) throw new Error(error.message);

    await logCommunication({
      lead_id: input.lead_id ?? null,
      booking_id: input.booking_id ?? null,
      channel: "email",
      direction: "outbound",
      status: "sent",
      subject: input.subject,
      body: input.body,
      template: input.template ?? null,
      to_address: input.to,
      sent_at: new Date().toISOString(),
    });
    return { sent: true, simulated: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logCommunication({
      lead_id: input.lead_id ?? null,
      booking_id: input.booking_id ?? null,
      channel: "email",
      direction: "outbound",
      status: "failed",
      subject: input.subject,
      body: `[FAILED TO SEND: ${message}]\n\n${input.body}`,
      template: input.template ?? null,
      to_address: input.to,
    });
    return { sent: false, simulated: false, error: message };
  }
}
