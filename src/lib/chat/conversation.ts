import { BUSINESS } from "@/lib/content";
import { searchKnowledge } from "@/lib/knowledge";
import type { ChatMessage } from "./engine";

/**
 * Conversational behaviour for the scripted assistant.
 *
 * The scripted assistant used to be a funnel and nothing else. It looked
 * through the transcript for three things — a service, a postcode and a size
 * — and asked for whichever was missing. Anything that was not one of those
 * three left it unchanged, so it asked the same question again. A visitor who
 * typed "which part of London?" was told to choose one of three services, and
 * was told exactly that again, and again, for as long as they kept typing.
 *
 * Two things were missing, and they are what this file adds.
 *
 * **It never answered a question.** The knowledge base has held the answer to
 * "which areas do you cover?" all along; nothing ever looked it up.
 *
 * **It never noticed it was repeating itself.** A person who asks the same
 * question twice and gets the same words back concludes, correctly, that
 * nobody is listening. Saying the same sentence twice is now treated as a
 * failure in its own right: the second attempt is phrased differently, and
 * the third hands over to a person with a telephone number.
 */

/* ------------------------------------------------------------------ *
 * Reading the visitor
 * ------------------------------------------------------------------ */

/**
 * Whether a message asks something rather than supplying a detail.
 *
 * Deliberately not just "ends in a question mark" — people rarely punctuate
 * in a chat window. "Which part of london" is a question.
 */
export function looksLikeAQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.includes("?")) return true;
  return /^(what|which|where|when|how|who|why|do|does|did|is|are|am|can|could|would|will|should|have|has|any|tell me|i need to know|i want to know)\b/.test(
    t,
  );
}

/** Greetings and sign-offs, which deserve an answer rather than a funnel. */
export function socialReply(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/[!.,]+$/g, "");
  if (/^(hi|hello|hey|hiya|good morning|good afternoon|good evening)\b/.test(t)) {
    return "Hello, and thank you for getting in touch with Merry Cleaners. How can I help?";
  }
  if (/^(thanks|thank you|cheers|brilliant|great|perfect|lovely|ok|okay)$/.test(t)) {
    return "You are very welcome.";
  }
  if (/^(bye|goodbye|see you|that is all|that's all|no thanks|nothing else)\b/.test(t)) {
    return `Thank you for your time. If anything else comes up we are on ${BUSINESS.phonePrimary}, or you can message here again whenever you like.`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Answering from the knowledge base
 * ------------------------------------------------------------------ */

export interface KnowledgeAnswer {
  text: string;
  /** True when a person must deal with it rather than the assistant. */
  escalate: boolean;
  /** Which entry answered, for the audit trail. */
  source: string;
}

/**
 * Looks a question up and returns the approved answer, or nothing.
 *
 * The score floor matters. A weak keyword match would let the assistant
 * answer a question nobody asked, which is a more damaging failure than
 * saying "I will find out" — so anything below it returns null and the
 * caller falls back to asking a person.
 *
 * An entry that exists but is marked unapproved is never paraphrased or
 * guessed at. That is what keeps the cancellation policy and the payment
 * terms unanswered until the owner supplies them, rather than invented.
 */
export function answerFromKnowledge(question: string): KnowledgeAnswer | null {
  const hits = searchKnowledge(question, 3);
  const best = hits[0];
  if (!best || best.score < 3) return null;

  if (best.escalate || !best.approved || !best.answer) {
    return {
      text:
        "That is something I would rather a member of our team confirmed for you than answer from memory, so I have passed your question to them and they will come back to you shortly.",
      escalate: true,
      source: `${best.kind}:${best.id} (unapproved)`,
    };
  }

  return { text: best.answer, escalate: false, source: `${best.kind}:${best.id}` };
}

/* ------------------------------------------------------------------ *
 * Not repeating itself
 * ------------------------------------------------------------------ */

/** Everything the assistant has already said in this conversation. */
export function previousAssistantMessages(messages: ChatMessage[]): string[] {
  return messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content.trim());
}

/** Ignores punctuation and casing, so a near-identical repeat still counts. */
function sameThing(a: string, b: string): boolean {
  const normalise = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return normalise(a) === normalise(b);
}

/** How many times the assistant has already said something. */
export function timesAlreadySaid(said: string[], candidate: string): number {
  return said.filter((previous) => sameThing(previous, candidate)).length;
}

/**
 * Picks how to ask for something, given how many times it has been asked.
 *
 * First time: the normal wording. Second: asked a different way, because
 * repeating the same sentence implies the visitor simply did not read it,
 * which is rarely true — usually the question was unclear. Third: stop
 * asking, hand over to a person.
 */
export function askWithoutRepeating(
  said: string[],
  variants: string[],
  handOver: string,
): { text: string; exhausted: boolean } {
  for (const variant of variants) {
    if (timesAlreadySaid(said, variant) === 0) {
      return { text: variant, exhausted: false };
    }
  }
  return { text: handOver, exhausted: true };
}

/* ------------------------------------------------------------------ *
 * Wording a price
 * ------------------------------------------------------------------ */

/**
 * Describes a price the way it should be described.
 *
 * A figure from the company's published list is a price, not an estimate, and
 * its low and high are the same number — so the old wording produced
 * "in the region of £155 to £155", which reads as though the system is
 * unsure of something it knows exactly.
 */
export function describePrice(
  low: number,
  high: number,
  fromPriceList: boolean,
  format: (amount: number) => string,
): string {
  if (fromPriceList || low === high) {
    return `is ${format(low)}`;
  }
  return `is in the region of ${format(low)} to ${format(high)}`;
}
