import { store } from "@/lib/db";
import { createEscalation, logCommunication } from "@/lib/comms";
import { screenMessage, UNCERTAIN_RESPONSE } from "@/lib/guardrails";
import { newTraceId, recordAgentAction } from "@/lib/agent/audit";
import { activeActor, getProvider } from "@/lib/ai";
import type { AIMessage, AIToolResult } from "@/lib/ai";
import { buildSystemPrompt } from "./prompt";
import { chatTools, executeTool, type ToolContext } from "./tools";
import { runFallbackTurn } from "./fallback";

/**
 * The website assistant.
 *
 * Order of operations matters. Deterministic guardrails run before any model
 * is called, so a complaint or a payment question is never answered by an AI -
 * it is acknowledged and handed to a person. Only when a message passes those
 * checks does it reach a model, and even then every price and every date comes
 * from a tool rather than from the model's own words.
 *
 * The model is reached through the provider layer in src/lib/ai, so this file
 * contains no vendor SDK and no vendor-specific types.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatTurnResult {
  reply: string;
  leadId: string | null;
  escalated: boolean;
  /** False when the scripted engine answered because no model is configured. */
  usedModel: boolean;
}

const MAX_TOOL_ROUNDS = 6;

export { aiConfigured } from "@/lib/ai";

export async function runChatTurn(
  messages: ChatMessage[],
  leadId: string | null,
): Promise<ChatTurnResult> {
  const traceId = newTraceId();
  const lastUser =
    [...messages].reverse().find((message) => message.role === "user")?.content ??
    "";

  await logCommunication({
    lead_id: leadId,
    channel: "chat",
    direction: "inbound",
    body: lastUser,
    template: "chat_message",
  });

  // 1. Deterministic guardrails, before any model call.
  const screen = screenMessage(lastUser);
  if (!screen.allowed) {
    await createEscalation({
      reason: screen.reason ?? "manual",
      summary: screen.internalNote ?? "Enquiry requires a human response",
      detail: `Website chat message: "${lastUser}"`,
      lead_id: leadId,
    });
    await recordAgentAction({
      trace_id: traceId,
      channel: "chat",
      tool: "guardrail_screen",
      summary: `blocked: ${screen.reason ?? "manual"}`,
      outcome: "escalated",
      lead_id: leadId,
      actor: "rules",
    });
    const reply = screen.customerMessage ?? UNCERTAIN_RESPONSE;
    await logCommunication({
      lead_id: leadId,
      channel: "chat",
      direction: "outbound",
      status: "sent",
      body: reply,
      template: "guardrail_reply",
      sent_at: new Date().toISOString(),
    });
    return { reply, leadId, escalated: true, usedModel: false };
  }

  // 2. No model configured: the scripted engine answers instead.
  const provider = getProvider();
  const result = provider
    ? await runModelTurn(messages, leadId, traceId)
    : await runFallbackTurn(messages, leadId, traceId);

  await logCommunication({
    lead_id: result.leadId,
    channel: "chat",
    direction: "outbound",
    status: "sent",
    body: result.reply,
    template: result.usedModel ? "assistant_reply" : "assistant_reply_scripted",
    sent_at: new Date().toISOString(),
  });

  return result;
}

async function runModelTurn(
  messages: ChatMessage[],
  leadId: string | null,
  traceId: string,
): Promise<ChatTurnResult> {
  const provider = getProvider();
  if (!provider) return runFallbackTurn(messages, leadId, traceId);

  const pricing = await store.getPricing();
  const context: ToolContext = {
    leadId,
    escalated: false,
    bookingId: null,
    quoted: false,
    traceId,
    channel: "chat",
    actor: activeActor(),
  };

  const conversation: AIMessage[] = messages.map((message) =>
    message.role === "user"
      ? { role: "user" as const, content: message.content }
      : { role: "assistant" as const, content: message.content },
  );

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await provider.complete({
        system: buildSystemPrompt(pricing),
        messages: conversation,
        tools: chatTools,
        // Short, tool-constrained turns: depth costs latency without helping.
        effort: "low",
      });

      if (response.stopReason === "refusal") {
        throw new Error("The model declined to respond to this message.");
      }

      if (response.toolCalls.length === 0) {
        if (!response.text) break;
        return {
          reply: response.text,
          leadId: context.leadId,
          escalated: context.escalated,
          usedModel: true,
        };
      }

      conversation.push({
        role: "assistant",
        toolCalls: response.toolCalls,
        text: response.text || undefined,
      });

      // All results for one assistant turn go back together.
      const results: AIToolResult[] = [];
      for (const call of response.toolCalls) {
        try {
          const output = await executeTool(call.name, call.input, context);
          results.push({
            tool_use_id: call.id,
            content: JSON.stringify(output),
          });
        } catch (error) {
          results.push({
            tool_use_id: call.id,
            is_error: true,
            content: JSON.stringify({
              error: error instanceof Error ? error.message : "Tool failed.",
            }),
          });
        }
      }
      conversation.push({ role: "tool", results });
    }

    // Out of rounds without a final answer: hand over rather than guess.
    throw new Error("The assistant did not reach a final answer.");
  } catch (error) {
    console.error("[merry-cleaners] Chat model turn failed:", error);
    await recordAgentAction({
      trace_id: traceId,
      channel: "chat",
      tool: "model_turn",
      summary: "model turn failed, handed to a person",
      outcome: "error",
      lead_id: context.leadId,
      actor: activeActor(),
      error: error instanceof Error ? error.message : String(error),
    });
    await createEscalation({
      reason: "uncertain",
      summary: "The website assistant could not complete a reply",
      detail:
        `The assistant failed while answering: "${messages.at(-1)?.content ?? ""}". ` +
        `Underlying issue: ${error instanceof Error ? error.message : String(error)}`,
      lead_id: context.leadId,
    });
    return {
      reply: UNCERTAIN_RESPONSE,
      leadId: context.leadId,
      escalated: true,
      usedModel: true,
    };
  }
}
