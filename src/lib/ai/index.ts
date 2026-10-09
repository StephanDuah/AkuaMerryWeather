import { AnthropicProvider } from "./anthropic";
import type { AIProvider } from "./types";

export * from "./types";
export { AnthropicProvider } from "./anthropic";

/**
 * Provider selection.
 *
 * AI_PROVIDER picks the implementation; "none" forces the scripted engine
 * even when a key is present, which is useful for testing the zero-cost path
 * and for cutting spend in a hurry.
 *
 * To add a provider: implement AIProvider in a new file, register it in the
 * switch below, and set AI_PROVIDER. Nothing else in the codebase changes.
 */

let cached: AIProvider | null = null;
let cachedKey = "";

export function getProvider(): AIProvider | null {
  const choice = (process.env.AI_PROVIDER ?? "auto").toLowerCase();
  if (choice === "none") return null;

  const key = `${choice}:${process.env.ANTHROPIC_MODEL ?? ""}`;
  if (cached && cachedKey === key) return cached.configured ? cached : null;

  let provider: AIProvider | null = null;
  switch (choice) {
    case "anthropic":
    case "auto":
      provider = new AnthropicProvider();
      break;
    default:
      console.warn(
        `[merry-cleaners] Unknown AI_PROVIDER "${choice}"; falling back to the scripted engine.`,
      );
      return null;
  }

  cached = provider;
  cachedKey = key;
  return provider.configured ? provider : null;
}

/** True when a model is available to drive the agent. */
export function aiConfigured(): boolean {
  return getProvider() !== null;
}

/** Written into the audit log so every action names what produced it. */
export function activeActor(): string {
  const provider = getProvider();
  return provider ? `${provider.id}:${provider.model}` : "scripted";
}
