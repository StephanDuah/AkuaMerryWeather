import { issueLeadToken } from "@/lib/security/leadToken";
import { fieldErrorsFromZod } from "@/lib/validation";
import { z } from "zod";
import { store } from "@/lib/db";
import { calculateQuote } from "@/lib/pricing";
import { createLead, findLead, inferSegment, updateLead } from "@/lib/leads";
import { createEscalation } from "@/lib/comms";
import { screenMessage, screenPostcode } from "@/lib/guardrails";
import { LEAD_SOURCES, SERVICE_TYPES } from "@/lib/types";
import type { CustomerSegment, LeadSource, PropertyType, ServiceType } from "@/lib/types";

/**
 * The public enquiry form.
 *
 * Every submission is screened before it is stored: out-of-area addresses
 * and excluded sectors are recorded as escalations rather than being
 * quietly quoted.
 */

import { rateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(160).optional().or(z.literal("")),
  phone: z.string().min(7).max(30).optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  postcode: z.string().min(2).max(10),
  property_type: z
    .enum(["flat", "house", "office", "hmo", "short_let", "other"])
    .optional(),
  bedrooms: z.coerce.number().int().min(0).max(10).nullable().optional(),
  floor_area_sqft: z.coerce.number().min(0).max(100000).nullable().optional(),
  service_type: z.enum(SERVICE_TYPES as [string, ...string[]]),
  addons: z.array(z.string()).max(12).optional(),
  preferred_date: z.string().max(20).optional().or(z.literal("")),
  source: z.enum(LEAD_SOURCES as [string, ...string[]]).optional(),
  segment: z
    .enum([
      "estate_agent",
      "business_office",
      "landlord",
      "airbnb_host",
      "homeowner",
      "tenant",
      "unknown",
    ])
    .optional(),
  message: z.string().max(2000).optional().or(z.literal("")),
  marketing_consent: z.boolean().optional(),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "lead", "Too many submissions in a short time. Please wait a moment and try again.");
  if (limited) return limited;

  const submitted = await request.json().catch(() => null);
  const parsed = schema.safeParse(submitted);
  if (!parsed.success) {
    return Response.json({ ok: false, ...fieldErrorsFromZod(parsed.error, submitted) }, { status: 400 });
  }

  const data = parsed.data;
  if (!data.email && !data.phone) {
    return Response.json(
      {
        ok: false,
        message: "Please provide either a telephone number or an email address.",
      },
      { status: 400 },
    );
  }

  const freeText = `${data.message ?? ""} ${data.address ?? ""}`;
  const screen = screenMessage(freeText);
  const area = screenPostcode(data.postcode);

  if (!area.allowed) {
    await createEscalation({
      reason: "out_of_area",
      summary: `Website enquiry outside Greater London (${data.postcode})`,
      detail: `${data.name} (${data.email || data.phone}) submitted the enquiry form for an address outside our coverage.`,
    });
    return Response.json({ ok: false, message: area.customerMessage }, { status: 200 });
  }

  if (!screen.allowed) {
    await createEscalation({
      reason: screen.reason ?? "manual",
      summary: screen.internalNote ?? "Website enquiry needs a human response",
      detail: `From ${data.name} (${data.email || data.phone}): "${data.message ?? ""}"`,
    });
    return Response.json({ ok: false, message: screen.customerMessage }, { status: 200 });
  }

  const pricing = await store.getPricing();
  const quote = calculateQuote(
    {
      service_type: data.service_type as ServiceType,
      postcode: data.postcode,
      bedrooms: data.bedrooms ?? null,
      floor_area_sqft: data.floor_area_sqft ?? null,
      addons: data.addons ?? [],
    },
    pricing,
  );

  const payload = {
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    address: data.address || null,
    postcode: data.postcode,
    property_type: (data.property_type as PropertyType | undefined) ?? null,
    bedrooms: data.bedrooms ?? null,
    floor_area_sqft: data.floor_area_sqft ?? null,
    service_type: data.service_type as ServiceType,
    addons: data.addons ?? [],
    preferred_date: data.preferred_date || null,
    segment:
      (data.segment as CustomerSegment | undefined) ?? inferSegment(freeText),
    notes: data.message || null,
    quote_low: quote.ok ? quote.low : null,
    quote_high: quote.ok ? quote.high : null,
    marketing_consent: data.marketing_consent ?? false,
    consent_text:
      "Submitted the website enquiry form, having been told their details are used to prepare a quote and arrange the clean.",
  };

  const existing = await findLead(payload.email, payload.phone);
  const lead = existing
    ? await updateLead(existing.id, { ...payload, status: "new" })
    : await createLead({
        ...payload,
        source: (data.source as LeadSource | undefined) ?? "website_form",
      });

  if (area.escalate && area.internalNote) {
    await createEscalation({
      reason: "out_of_area",
      summary: `Confirm coverage for ${data.postcode.toUpperCase()}`,
      detail: area.internalNote,
      lead_id: lead?.id ?? null,
    });
  }

  return Response.json({
    ok: true,
    // A signed token, never the record id. The browser sends this back when
    // it books, and it cannot be altered to point at somebody else's record.
    lead_id: lead?.id ? issueLeadToken(lead.id) : null,
    quote: quote.ok
      ? { low: quote.low, high: quote.high, disclaimer: quote.disclaimer }
      : null,
    message:
      "Thank you. Your enquiry has reached our team and we will be in touch shortly to confirm everything.",
  });
}
