import { newId, store } from "@/lib/db";
import { getProvider } from "@/lib/ai";
import { BUSINESS, serviceByType, TRUST_SIGNALS } from "@/lib/content";
import type { AdDraft, ServiceType } from "@/lib/types";

/**
 * Marketing support.
 *
 * This module drafts advertising and outreach copy only. It deliberately
 * does not collect leads from Google, Yell or Checkatrade: scraping those
 * platforms for business contact data would breach their terms of service
 * and, for personal data, UK GDPR. The legitimate routes are paid ads,
 * referral incentives and direct partnership outreach - which is what the
 * copy below is written for. See DECISIONS.md.
 */

export type MarketingChannel = "google_ads" | "outreach_email" | "referral" | "other";

export interface CopyRequest {
  channel: MarketingChannel;
  service_type: ServiceType | null;
  audience: string;
  notes?: string;
}

/**
 * The prompt template, exposed so the owner can paste it into any AI tool
 * and get the same result without this application running.
 */
export function buildCopyPrompt(request: CopyRequest): string {
  const service = request.service_type ? serviceByType(request.service_type) : null;
  const trust = TRUST_SIGNALS.map((signal) => `- ${signal.title}: ${signal.detail}`).join(
    "\n",
  );

  const channelBrief: Record<MarketingChannel, string> = {
    google_ads:
      "Write Google Ads responsive search ad copy: 6 headlines of 30 characters or fewer, and 3 descriptions of 90 characters or fewer. Include the location where it fits naturally. Do not use exclamation marks in headlines.",
    outreach_email:
      "Write a short, dignified cold outreach email to a London estate or letting agency, under 150 words, with a clear subject line and one specific, low-friction ask.",
    referral:
      "Write a brief referral-scheme message we can send to existing clients, explaining the incentive in plain terms without hard selling.",
    other: "Write clear, professional marketing copy for the brief given.",
  };

  return `You are writing marketing copy for ${BUSINESS.name}, a premium cleaning company in ${BUSINESS.serviceArea}.

Brief: ${channelBrief[request.channel]}

Service to promote: ${service ? `${service.name} - ${service.summary}` : "the business as a whole"}
Audience: ${request.audience}
${request.notes ? `Additional notes: ${request.notes}` : ""}

Facts you may use (and nothing beyond these):
${trust}
Telephone ${BUSINESS.phonePrimary}. We serve ${BUSINESS.serviceArea} only.

Rules:
- Premium, professional, British English. No slang, no hype, no emoji.
- Never invent statistics, review counts, awards, guarantees or prices.
- Never mention schools, colleges, nurseries, hospitals, clinics or care homes: we do not serve those sectors.
- Lead with credibility (insured, DBS-checked, trained, photographic evidence, our re-clean guarantee) rather than with discounts.`;
}

/** Deterministic copy used when no API key is configured. */
function templateCopy(request: CopyRequest): { title: string; body: string } {
  const service = request.service_type ? serviceByType(request.service_type) : null;
  const name = service?.shortName ?? "Professional cleaning";

  if (request.channel === "google_ads") {
    return {
      title: `Google Ads draft - ${name}`,
      body: [
        "Headlines (30 characters or fewer):",
        `1. ${name} in London`.slice(0, 30),
        "2. DBS-Checked & Fully Insured".slice(0, 30),
        "3. Trained London Cleaners".slice(0, 30),
        "4. Before & After Photos".slice(0, 30),
        "5. Re-Clean Guarantee".slice(0, 30),
        "6. Free Estimate Today".slice(0, 30),
        "",
        "Descriptions (90 characters or fewer):",
        "1. Trained, DBS-checked and fully insured cleaners across Greater London. Request an estimate.",
        "2. Photographic evidence on every job and a re-clean guarantee. Serving London businesses.",
        "3. Reliable scheduling, a named contact and a written specification. Speak to our team today.",
        "",
        `Suggested landing page: ${service ? `/services/${service.slug}` : "/"}`,
        `Audience: ${request.audience}`,
      ].join("\n"),
    };
  }

  if (request.channel === "outreach_email") {
    return {
      title: `Outreach email draft - ${request.audience}`,
      body: [
        "Subject: Checkout cleans across London, photographed as standard",
        "",
        "Good afternoon,",
        "",
        `I am writing from ${BUSINESS.name}. We provide end of tenancy cleaning across Greater London for agencies that need properties turned around quickly and let again without dispute.`,
        "",
        "Our cleaners are DBS-checked, trained to a written standard and fully insured, and we supply before and after photographs with every job as a record for your file. Any point raised by an inventory clerk within 48 hours is put right at no further cost.",
        "",
        "If it would be useful, I can send our specification and rates for your area, or arrange a first job at short notice so you can judge the standard yourself.",
        "",
        "Kind regards,",
        BUSINESS.name,
        BUSINESS.phonePrimary,
      ].join("\n"),
    };
  }

  return {
    title: `Referral message draft`,
    body: [
      "Good afternoon,",
      "",
      `Thank you for trusting ${BUSINESS.name} with your cleaning. If you know another household, landlord or business in London who would value the same standard, we would be glad of the introduction.`,
      "",
      "As our thanks, we will apply a credit to your next clean once their first booking is complete. There is no obligation, and we will always treat anyone you introduce with the same care we show you.",
      "",
      "Kind regards,",
      BUSINESS.name,
    ].join("\n"),
  };
}

export async function generateAdCopy(request: CopyRequest): Promise<AdDraft> {
  let title: string;
  let body: string;

  const provider = getProvider();
  if (provider) {
    try {
      const response = await provider.complete({
        system:
          "You write marketing copy for a London cleaning company. Follow the brief exactly and invent nothing.",
        messages: [{ role: "user", content: buildCopyPrompt(request) }],
        maxTokens: 2000,
        effort: "medium",
      });
      if (response.stopReason === "refusal") throw new Error("Model declined.");
      const text = response.text.trim();
      if (!text) throw new Error("Empty response.");
      title = `${request.channel.replace(/_/g, " ")} draft - ${request.audience}`;
      body = text;
    } catch (error) {
      console.error("[merry-cleaners] Ad copy generation failed:", error);
      const fallback = templateCopy(request);
      title = fallback.title;
      body = fallback.body;
    }
  } else {
    const fallback = templateCopy(request);
    title = fallback.title;
    body = fallback.body;
  }

  const draft: AdDraft = {
    id: newId("ad"),
    created_at: new Date().toISOString(),
    channel: request.channel,
    service_type: request.service_type,
    audience: request.audience,
    title,
    body,
  };
  return store.insert("ad_drafts", draft);
}
