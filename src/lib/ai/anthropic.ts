import Anthropic from "@anthropic-ai/sdk";
import type {
  AICompleteRequest,
  AIMessage,
  AIProvider,
  AIResponse,
  AIStopReason,
  AIToolCall,
} from "./types";
import { AIProviderError } from "./types";

/**
 * Claude (Anthropic) provider.
 *
 * The only file in the project that imports the Anthropic SDK. Everything it
 * exposes is provider-neutral, so a second provider can be added beside it
 * without touching the agent.
 */

const DEFAULT_MODEL = "claude-sonnet-5";

/** Replays our neutral message list into the shape the SDK expects. */
function toAnthropicMessages(messages: AIMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "tool") {
      out.push({
        role: "user",
        content: message.results.map((result) => ({
          type: "tool_result" as const,
          tool_use_id: result.tool_use_id,
          content: result.content,
          ...(result.is_error ? { is_error: true } : {}),
        })),
      });
      continue;
    }

    if ("toolCalls" in message) {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (message.text) blocks.push({ type: "text", text: message.text });
      for (const call of message.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.input,
        });
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    out.push({ role: "assistant", content: message.content });
  }

  return out;
}

function mapStopReason(reason: string | null): AIStopReason {
  switch (reason) {
    case "end_turn":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly model: string;
  private client: Anthropic | null = null;

  constructor(model?: string) {
    this.model = model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  }

  get configured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async complete(request: AICompleteRequest): Promise<AIResponse> {
    if (!this.configured) {
      throw new AIProviderError("No Anthropic API key is configured.", this.id);
    }

    this.client ??= new Anthropic();

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 4000,
        output_config: { effort: request.effort ?? "low" },
        // The instructions are stable across a conversation, so caching them
        // cuts roughly 90% off the repeated input cost.
        system: [
          {
            type: "text",
            text: request.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        ...(request.tools?.length
          ? { tools: request.tools as Anthropic.Tool[] }
          : {}),
        messages: toAnthropicMessages(request.messages),
      });

      const toolCalls: AIToolCall[] = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
        .map((block) => ({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        }));

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      return {
        text,
        toolCalls,
        stopReason: mapStopReason(response.stop_reason),
        raw: response,
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError(
        error instanceof Error ? error.message : String(error),
        this.id,
        error,
      );
    }
  }
}
