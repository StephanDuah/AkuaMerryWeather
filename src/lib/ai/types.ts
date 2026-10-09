/**
 * Provider-neutral AI types.
 *
 * Nothing above this layer imports a vendor SDK. Swapping Claude for another
 * model means writing one new file that implements AIProvider - the agent,
 * its tools, its guardrails and its prompts are untouched.
 */

export interface AITool {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AIToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AIToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type AIMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  /** An assistant turn that requested tools, replayed back to the model. */
  | { role: "assistant"; toolCalls: AIToolCall[]; text?: string }
  /** The results of those tools, sent back in a single turn. */
  | { role: "tool"; results: AIToolResult[] };

export type AIStopReason =
  | "end_turn"
  | "tool_use"
  | "max_tokens"
  | "refusal"
  | "other";

export interface AIResponse {
  text: string;
  toolCalls: AIToolCall[];
  stopReason: AIStopReason;
  /** Opaque provider payload, replayed verbatim on the next request. */
  raw?: unknown;
}

export interface AICompleteRequest {
  system: string;
  messages: AIMessage[];
  tools?: AITool[];
  maxTokens?: number;
  /** Hint only. Providers that do not support effort levels ignore it. */
  effort?: "low" | "medium" | "high";
}

export interface AIProvider {
  /** Stable identifier written into the audit log. */
  readonly id: string;
  readonly model: string;
  /** False when no credentials are present, so callers can fall back. */
  readonly configured: boolean;
  complete(request: AICompleteRequest): Promise<AIResponse>;
}

/** Thrown when a provider cannot complete a request; callers escalate. */
export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
