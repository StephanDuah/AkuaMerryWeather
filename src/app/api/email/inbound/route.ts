import { checkSharedSecret, refuse, safeErrorMessage } from "@/lib/security/secrets";
import { z } from "zod";
import { handleInboundEmail } from "@/lib/email/inbound";

/**
 * Inbound email webhook.
 *
 * Point an email forwarding service at this URL (see SETUP_REQUIRED.md).
 * Until one is connected, the same endpoint can be posted to by hand from
 * the admin dashboard to test the classification and drafting flow.
 */

export const runtime = "nodejs";

const schema = z.object({
  from: z.string().email(),
  from_name: z.string().max(120).nullable().optional(),
  subject: z.string().max(300),
  body: z.string().min(1).max(20000),
});


export async function POST(request: Request) {
  const auth = checkSharedSecret(request, "EMAIL_WEBHOOK_SECRET");
  if (!auth.ok) {
    console.warn(`[merry-cleaners] inbound email refused: ${auth.reason}`);
    return refuse();
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Expected from, subject and body." },
      { status: 400 },
    );
  }

  try {
    const result = await handleInboundEmail(parsed.data);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[merry-cleaners] Inbound email failed:", error);
    return Response.json(
      { ok: false, error: safeErrorMessage(error) },
      { status: 500 },
    );
  }
}
