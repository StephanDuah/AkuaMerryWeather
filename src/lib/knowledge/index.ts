import companyData from "@/knowledge/company.json";
import servicesData from "@/knowledge/services.json";
import policiesData from "@/knowledge/policies.json";
import faqsData from "@/knowledge/faqs.json";

/**
 * The Merry Cleaners knowledge base.
 *
 * Business facts live in src/knowledge/*.json, not in application code, so
 * the owner can change what the agent says without a developer. This module
 * is the only way the agent is allowed to reach them.
 *
 * The critical rule this file enforces: an entry marked `approved: false` is
 * a PLACEHOLDER, not a fact. Search will return it, but flagged as
 * unanswerable, so the agent escalates instead of improvising. That is what
 * stops the system inventing a cancellation policy or a payment term that
 * the business has never agreed.
 */

export const company = companyData;
export const servicesKb = servicesData;
export const policies = policiesData;
export const faqs = faqsData;

export type KnowledgeKind = "faq" | "service" | "policy" | "company";

export interface KnowledgeHit {
  kind: KnowledgeKind;
  id: string;
  title: string;
  /** Null when the entry exists but has not been approved for the agent to state. */
  answer: string | null;
  approved: boolean;
  /** True when the agent must hand this to a person rather than answer. */
  escalate: boolean;
  reason?: string;
  score: number;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "did", "you", "your", "i", "my",
  "we", "our", "to", "of", "for", "in", "on", "at", "and", "or", "it", "this",
  "that", "with", "can", "could", "would", "will", "please", "hi", "hello",
  "what", "how", "when", "where", "who", "me", "have", "has", "be", "if",
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function scoreEntry(queryTokens: string[], haystack: string, keywords: string[]) {
  const text = haystack.toLowerCase();
  let score = 0;

  // Curated keywords are the strongest signal, and phrases beat single words.
  for (const keyword of keywords) {
    const key = keyword.toLowerCase();
    if (text.length && queryTokens.length === 0) break;
    if (key.includes(" ")) {
      if (queryTokens.join(" ").includes(key)) score += 5;
    } else if (queryTokens.includes(key)) {
      score += 3;
    }
  }

  for (const token of queryTokens) {
    if (text.includes(token)) score += 1;
  }

  return score;
}

/**
 * Searches the knowledge base. Returns hits ordered by relevance, each
 * carrying whether the agent is actually permitted to state it.
 */
export function searchKnowledge(query: string, limit = 4): KnowledgeHit[] {
  const tokens = tokenise(query);
  if (tokens.length === 0) return [];

  const hits: KnowledgeHit[] = [];

  for (const faq of faqs.faqs) {
    const score = scoreEntry(
      tokens,
      `${faq.question} ${faq.answer ?? ""}`,
      faq.keywords ?? [],
    );
    if (score <= 0) continue;
    hits.push({
      kind: "faq",
      id: faq.id,
      title: faq.question,
      answer: faq.approved ? (faq.answer ?? null) : null,
      approved: Boolean(faq.approved),
      escalate: !faq.approved,
      reason: "reason" in faq ? (faq.reason as string) : undefined,
      score,
    });
  }

  for (const service of servicesKb.services) {
    const blob = [
      service.name,
      service.shortName,
      service.audience,
      service.summary,
      ...service.includes,
      ...service.excludes,
    ].join(" ");
    const score = scoreEntry(tokens, blob, [
      service.shortName,
      service.name,
      service.type.replace(/_/g, " "),
    ]);
    if (score <= 0) continue;
    hits.push({
      kind: "service",
      id: service.slug,
      title: service.name,
      answer: `${service.summary} Included: ${service.includes.join("; ")}. Not included: ${service.excludes.join("; ")}.`,
      approved: true,
      escalate: false,
      score,
    });
  }

  const policyEntries: {
    id: string;
    title: string;
    text: string;
    approved: boolean;
    keywords: string[];
    reason?: string;
  }[] = [
    {
      id: "guarantee",
      title: "Our guarantee",
      text: policies.guarantee.statement,
      approved: policies.guarantee.approved,
      keywords: ["guarantee", "redo", "re-clean", "standard"],
    },
    {
      id: "quoting",
      title: "How we quote",
      text: policies.quoting.rule,
      approved: policies.quoting.approved,
      keywords: ["quote", "estimate", "price", "cost"],
    },
    {
      id: "data_protection",
      title: "How we handle your details",
      text: policies.data_protection.collection_statement,
      approved: policies.data_protection.approved,
      keywords: ["data", "gdpr", "privacy", "details", "delete"],
    },
    {
      id: "cancellation",
      title: "Cancellation",
      text: "",
      approved: policies.cancellation.approved,
      keywords: ["cancel", "cancellation", "reschedule", "notice"],
      reason: policies.cancellation.placeholder,
    },
    {
      id: "payment",
      title: "Payment",
      text: "",
      approved: policies.payment.approved,
      keywords: ["payment", "pay", "invoice", "refund", "deposit"],
      reason: policies.payment.placeholder,
    },
  ];

  for (const entry of policyEntries) {
    const score = scoreEntry(tokens, `${entry.title} ${entry.text}`, entry.keywords);
    if (score <= 0) continue;
    hits.push({
      kind: "policy",
      id: entry.id,
      title: entry.title,
      answer: entry.approved ? entry.text : null,
      approved: entry.approved,
      escalate: !entry.approved,
      reason: entry.reason,
      score,
    });
  }

  const companyBlob = [
    company.identity.name,
    company.identity.promise,
    company.contact.address,
    company.contact.hours,
    company.coverage.statement,
    ...company.credentials.map((c) => `${c.title} ${c.detail}`),
  ].join(" ");
  const companyScore = scoreEntry(tokens, companyBlob, [
    "contact", "phone", "email", "address", "hours", "insured", "dbs",
  ]);
  if (companyScore > 0) {
    hits.push({
      kind: "company",
      id: "company",
      title: "Company details",
      answer: `${company.identity.promise} Telephone ${company.contact.phone_primary}, email ${company.contact.email}, ${company.contact.address}. Open ${company.contact.hours}. ${company.coverage.statement}`,
      approved: true,
      escalate: false,
      score: companyScore,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getServiceInformation(identifier: string) {
  const key = identifier.toLowerCase().trim();
  return (
    servicesKb.services.find(
      (service) =>
        service.slug === key ||
        service.type === key ||
        service.name.toLowerCase() === key ||
        service.shortName.toLowerCase() === key,
    ) ?? null
  );
}

export function isServiceOffered(text: string): boolean {
  const lower = text.toLowerCase();
  return servicesKb.services.some(
    (service) =>
      lower.includes(service.type.replace(/_/g, " ")) ||
      lower.includes(service.shortName.toLowerCase()),
  );
}

/** Terms the business explicitly does not serve, used by the guardrails. */
export function excludedSectorTerms(): string[] {
  return company.coverage.excluded_sectors;
}

export function notOfferedTerms(): string[] {
  return servicesKb.not_offered.terms;
}
