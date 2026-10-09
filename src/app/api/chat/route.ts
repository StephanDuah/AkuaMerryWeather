import { z } from "zod";
import { runChatTurn, type ChatMessage } from "@/lib/chat/engine";

/**
 * The website assistant endpoint.
 *
 * The Anthropic key is read server-side only and never reaches the browser.
 * The transcript is sent by the client each turn; the server holds no chat
 * session, which keeps the whole thing stateless and free to host.
 */

import { rateLimit } from "@/lib/security/rateLimit";
import { issueLeadToken, readLeadToken } from "@/lib/security/leadToken";

export const runtime = "nodejs";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
  /**
   * A token this server issued earlier in the conversation - NOT a lead id.
   * A raw identifier, guessed or copied from somewhere else, is rejected,
   * which is what stops one visitor reading another customer's record.
   */
  leadId: z.string().max(400).nullable().optional(),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "chat", "I am sorry, you have sent a lot of messages in a short time. Please wait a moment and try again, or call us on +44 7491 873636.");
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "That message could not be read. Please try again." },
      { status: 400 },
    );
  }

  // Whatever the browser sent is a claim, not a fact. Only our own signature
  // turns it into a lead id; anything else becomes a new conversation.
  const claimedLead = readLeadToken(parsed.data.leadId ?? null);

  try {
    const result = await runChatTurn(
      parsed.data.messages as ChatMessage[],
      claimedLead,
    );
    // Hand back a token, never the identifier itself.
    return Response.json({
      ...result,
      leadId: result.leadId ? issueLeadToken(result.leadId) : null,
    });
  } catch (error) {
    console.error("[merry-cleaners] /api/chat failed:", error);
    return Response.json(
      {
        reply:
          "I am sorry, something went wrong at our end. Please call us on +44 7491 873636 and a member of our team will help you directly.",
        leadId: claimedLead ? issueLeadToken(claimedLead) : null,
        escalated: true,
        usedModel: false,
      },
      { status: 200 },
    );
  }
}
