import { logCommunication } from "@/lib/comms";

/**
 * WhatsApp Business Cloud API (Meta).
 *
 * Chosen over Twilio because Meta's Cloud API has a genuinely free tier at
 * the volumes a new business sees, whereas Twilio charges per message from
 * the first one. Until the owner completes Meta Business verification the
 * calls are simulated and logged, so nothing else in the system has to
 * change when the credentials arrive.
 */

const GRAPH_VERSION = "v21.0";

export function whatsappConfigured(): boolean {
  if (process.env.MOCK_MODE === "true") return false;
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN,
  );
}

export interface WhatsAppInput {
  to: string;
  body: string;
  lead_id?: string | null;
  booking_id?: string | null;
  template?: string | null;
}

export interface WhatsAppResult {
  sent: boolean;
  simulated: boolean;
  error?: string;
}

/** Meta expects E.164 without the leading plus or any punctuation. */
function toE164(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("44")) return digits;
  if (digits.startsWith("0")) return `44${digits.slice(1)}`;
  return digits;
}

export async function sendWhatsApp(
  input: WhatsAppInput,
): Promise<WhatsAppResult> {
  if (!whatsappConfigured()) {
    await logCommunication({
      lead_id: input.lead_id ?? null,
      booking_id: input.booking_id ?? null,
      channel: "whatsapp",
      direction: "outbound",
      status: "queued",
      body: `[SIMULATED - WhatsApp not connected]\n\n${input.body}`,
      template: input.template ?? null,
      to_address: input.to,
    });
    return { sent: false, simulated: true };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toE164(input.to),
          type: "text",
          text: { preview_url: false, body: input.body },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`WhatsApp API returned ${response.status}: ${await response.text()}`);
    }

    await logCommunication({
      lead_id: input.lead_id ?? null,
      booking_id: input.booking_id ?? null,
      channel: "whatsapp",
      direction: "outbound",
      status: "sent",
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
      channel: "whatsapp",
      direction: "outbound",
      status: "failed",
      body: `[FAILED: ${message}]\n\n${input.body}`,
      template: input.template ?? null,
      to_address: input.to,
    });
    return { sent: false, simulated: false, error: message };
  }
}
