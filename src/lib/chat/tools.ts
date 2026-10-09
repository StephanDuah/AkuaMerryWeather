import { store } from "@/lib/db";
import { calculateQuote, formatGbp } from "@/lib/pricing";
import { createBooking, getAvailability, SLOT_LABELS } from "@/lib/booking";
import { createEscalation, logCommunication } from "@/lib/comms";
import { searchKnowledge, getServiceInformation } from "@/lib/knowledge";
import { createLead, findLead, getLead, updateLead } from "@/lib/leads";
import { screenPostcode } from "@/lib/guardrails";
import { recordAgentAction } from "@/lib/agent/audit";
import type { AITool } from "@/lib/ai";
import { SERVICE_TYPES } from "@/lib/types";
import type {
  CustomerSegment,
  EscalationReason,
  PropertyType,
  ServiceType,
} from "@/lib/types";

/**
 * The tools the website assistant may use.
 *
 * Every figure the assistant states about price or availability has to come
 * through one of these, which is what stops it from inventing anything.
 */

export const chatTools: AITool[] = [
  {
    name: "quote_price",
    description:
      "Calculate the price for one of the three services. Use this before stating any price. For domestic cleaning it returns our published price for that size, which is exact; for the other services it returns a range. If it returns needs_more_information, ask the client for exactly what is missing. Never state a price this tool did not give you.",
    input_schema: {
      type: "object",
      properties: {
        service_type: {
          type: "string",
          enum: SERVICE_TYPES,
          description: "Which of the three services the client needs.",
        },
        postcode: {
          type: "string",
          description: "UK postcode of the property, e.g. 'SW4 7UR'.",
        },
        bedrooms: {
          type: "number",
          description:
            "Number of bedrooms, for domestic and end of tenancy cleans. Use 0 for a studio.",
        },
        floor_area_sqft: {
          type: "number",
          description: "Approximate floor area in square feet, for office cleans.",
        },
        tier: {
          type: "string",
          enum: ["regular", "deep"],
          description:
            "For domestic cleaning only. 'regular' is an ongoing weekly or fortnightly clean; 'deep' is a thorough one-off. Ask the client which they want if it is not obvious - the prices are very different. Defaults to 'regular'.",
        },
        addons: {
          type: "array",
          items: { type: "string" },
          description: "Add-on keys the client has asked for. Use [] if none.",
        },
      },
      required: ["service_type", "postcode"],
    },
  },
  {
    name: "check_availability",
    description:
      "List the booking slots that are genuinely free over the coming days. Never state availability without calling this first.",
    input_schema: {
      type: "object",
      properties: {
        days_ahead: {
          type: "number",
          description: "How many days forward to look. Defaults to 14.",
        },
        preferred_date: {
          type: "string",
          description: "Optional ISO date (YYYY-MM-DD) the client has asked about.",
        },
      },
      required: [],
    },
  },
  {
    name: "save_lead",
    description:
      "Record the client's enquiry so our team can follow it up. Call this once you have at least a name and either a telephone number or an email address.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string", description: "Street address, without the postcode." },
        postcode: { type: "string" },
        property_type: {
          type: "string",
          enum: ["flat", "house", "office", "hmo", "short_let", "other"],
        },
        bedrooms: { type: "number" },
        floor_area_sqft: { type: "number" },
        service_type: { type: "string", enum: SERVICE_TYPES },
        addons: { type: "array", items: { type: "string" } },
        preferred_date: { type: "string", description: "ISO date (YYYY-MM-DD)." },
        segment: {
          type: "string",
          enum: [
            "estate_agent",
            "business_office",
            "landlord",
            "airbnb_host",
            "homeowner",
            "tenant",
            "unknown",
          ],
          description:
            "Who the client is. Estate agents and offices are our priority audiences.",
        },
        notes: {
          type: "string",
          description: "Anything our team should know, in one or two sentences.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "create_booking",
    description:
      "Confirm a booking in a slot that check_availability has shown to be free. Requires the service type, the full address and a confirmed add-ons list (send [] if the client wants none).",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        postcode: { type: "string" },
        service_type: { type: "string", enum: SERVICE_TYPES },
        addons: { type: "array", items: { type: "string" } },
        bedrooms: { type: "number" },
        floor_area_sqft: { type: "number" },
        date: { type: "string", description: "ISO date (YYYY-MM-DD)." },
        slot: { type: "string", enum: ["morning", "afternoon", "evening"] },
        notes: { type: "string" },
      },
      required: [
        "customer_name",
        "address",
        "postcode",
        "service_type",
        "addons",
        "date",
        "slot",
      ],
    },
  },
  {
    name: "search_knowledge",
    description:
      "Look something up in the Merry Cleaners knowledge base before answering any question about the company, its services, its policies or how it works. If a result comes back with escalate:true, the business has not approved an answer - do NOT improvise one, hand it to a person instead.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What the client asked, in their own words.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_service_information",
    description:
      "Fetch the full specification for one service: what is included, what is excluded, who it suits and how it is priced. Use this rather than describing a service from memory.",
    input_schema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description:
            "Service slug or type, e.g. 'end-of-tenancy-cleaning' or 'office'.",
        },
      },
      required: ["service"],
    },
  },
  {
    name: "get_customer",
    description:
      "Look up what we already know about the person in this conversation - what they have told us, what they were quoted, and any booking. Use this before asking a question they have already answered. It only ever returns the customer you are currently speaking to.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "send_customer_message",
    description:
      "Send this customer a written message by email. It is NOT sent immediately: it is placed in the owner's inbox for approval, so tell the client our team will be in touch rather than saying a message is on its way. Use it to promise a written follow-up, never to make a commitment you could not make in chat.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        body: {
          type: "string",
          description:
            "The message, in the company's voice. No prices or dates that did not come from a tool.",
        },
      },
      required: ["subject", "body"],
    },
  },
  {
    name: "notify_owner",
    description:
      "Send a note to the business owner about something they should see, without implying the conversation is blocked. For anything the client is waiting on, use escalate_to_human instead.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One line for the owner." },
        detail: { type: "string", description: "Why it matters." },
      },
      required: ["summary"],
    },
  },
  {
    name: "cancel_followup",
    description:
      "Stop the automated follow-up sequence for this lead. Use when the client asks not to be contacted again, says they have gone elsewhere, or has already booked.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: ["opted_out", "booked", "went_elsewhere", "human_took_over"],
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the enquiry to a member of the team. Use this whenever you are not certain, and always for complaints, payments, refunds, addresses outside Greater London, excluded sectors and services we do not offer.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: [
            "complaint",
            "payment",
            "refund",
            "out_of_area",
            "out_of_scope",
            "excluded_sector",
            "uncertain",
            "manual",
          ],
        },
        summary: { type: "string", description: "One line for the owner's inbox." },
        detail: {
          type: "string",
          description: "What the client asked and what you were unsure of.",
        },
      },
      required: ["reason", "summary", "detail"],
    },
  },
];

/** Mutable state carried through a single chat turn. */
export interface ToolContext {
  leadId: string | null;
  escalated: boolean;
  bookingId: string | null;
  quoted: boolean;
  /** Groups every action taken in one conversation turn. */
  traceId: string;
  channel: "chat" | "email" | "whatsapp" | "system" | "test";
  actor: string;
}

type ToolInput = Record<string, unknown>;

const str = (input: ToolInput, key: string): string | null => {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};
const num = (input: ToolInput, key: string): number | null => {
  const value = input[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
};
const arr = (input: ToolInput, key: string): string[] => {
  const value = input[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
};

/**
 * Runs a tool and writes an audit row for it. The agent may only reach the
 * database through these functions - it never issues arbitrary queries.
 */
export async function executeTool(
  name: string,
  input: ToolInput,
  context: ToolContext,
): Promise<unknown> {
  const started = Date.now();
  const before = context.escalated;
  try {
    const result = await runTool(name, input, context);
    const record = result as Record<string, unknown> | null;
    const ok = Boolean(record && record.ok);
    await recordAgentAction({
      trace_id: context.traceId,
      channel: context.channel,
      tool: name,
      summary: describeToolCall(name, input),
      outcome: context.escalated && !before ? "escalated" : ok ? "ok" : "refused",
      lead_id: context.leadId,
      booking_id: context.bookingId,
      actor: context.actor,
      duration_ms: Date.now() - started,
    });
    return result;
  } catch (error) {
    await recordAgentAction({
      trace_id: context.traceId,
      channel: context.channel,
      tool: name,
      summary: describeToolCall(name, input),
      outcome: "error",
      lead_id: context.leadId,
      booking_id: context.bookingId,
      actor: context.actor,
      duration_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** A short, non-identifying description of what the tool was asked to do. */
function describeToolCall(name: string, input: ToolInput): string {
  const parts: string[] = [];
  for (const key of [
    "service_type",
    "postcode",
    "bedrooms",
    "floor_area_sqft",
    "date",
    "slot",
    "reason",
    "query",
    "segment",
  ]) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") {
      parts.push(`${key}=${String(value)}`);
    }
  }
  return parts.length ? `${name} ${parts.join(" ")}` : name;
}

async function runTool(
  name: string,
  input: ToolInput,
  context: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "quote_price":
      return runQuote(input, context);
    case "check_availability":
      return runAvailability(input);
    case "save_lead":
      return runSaveLead(input, context);
    case "create_booking":
      return runCreateBooking(input, context);
    case "search_knowledge":
      return runSearchKnowledge(input);
    case "get_service_information":
      return runServiceInformation(input);
    case "get_customer":
      return runGetCustomer(context);
    case "send_customer_message":
      return runSendCustomerMessage(input, context);
    case "notify_owner":
      return runNotifyOwner(input, context);
    case "cancel_followup":
      return runCancelFollowup(input, context);
    case "escalate_to_human":
      return runEscalate(input, context);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function runQuote(input: ToolInput, context: ToolContext) {
  const serviceType = str(input, "service_type") as ServiceType | null;
  const postcode = str(input, "postcode");
  if (!serviceType || !postcode) {
    return {
      ok: false,
      needs_more_information: true,
      missing: [!serviceType && "service_type", !postcode && "postcode"].filter(Boolean),
      guidance: "Ask the client for the missing detail before quoting.",
    };
  }

  const area = screenPostcode(postcode);
  if (!area.allowed) {
    await createEscalation({
      reason: "out_of_area",
      summary: `Quote requested outside Greater London (${postcode})`,
      detail: area.internalNote ?? "",
      lead_id: context.leadId,
    });
    context.escalated = true;
    return {
      ok: false,
      out_of_area: true,
      say_to_client: area.customerMessage,
    };
  }

  const pricing = await store.getPricing();
  const result = calculateQuote(
    {
      service_type: serviceType,
      postcode,
      bedrooms: num(input, "bedrooms"),
      floor_area_sqft: num(input, "floor_area_sqft"),
      addons: arr(input, "addons"),
      tier: str(input, "tier"),
    },
    pricing,
  );

  if (!result.ok) {
    if (result.reason === "pricing_not_approved") {
      // We have everything needed; the owner simply has not approved a rate
      // card yet. Capture the lead and hand the figure to a person.
      await createEscalation({
        reason: "uncertain",
        summary: `Quote needed: ${serviceType.replace(/_/g, " ")} at ${postcode.toUpperCase()}`,
        detail:
          "All details were collected but the rate card is not approved, so no price was given. " +
          `Bedrooms: ${num(input, "bedrooms") ?? "n/a"}. Floor area: ${num(input, "floor_area_sqft") ?? "n/a"}. ` +
          `Add-ons: ${arr(input, "addons").join(", ") || "none"}.`,
        lead_id: context.leadId,
      });
      context.escalated = true;
      if (context.leadId) {
        await updateLead(context.leadId, {
          status: "quote_requested",
          service_type: serviceType,
        });
      }
      return {
        ok: false,
        pricing_not_approved: true,
        say_to_client: result.message,
        must_do:
          "Do not state any price. Take the client's name and contact details with save_lead so the team can send the figure.",
      };
    }
    if (result.reason === "size_not_on_price_list") {
      // Everything was supplied; the property is simply larger than the
      // published list goes. That is a job for a person, not a guess.
      await createEscalation({
        reason: "uncertain",
        summary: `Tailored quote needed: ${num(input, "bedrooms") ?? "?"}-bed ${serviceType.replace(/_/g, " ")} at ${postcode.toUpperCase()}`,
        detail:
          "The property is outside the sizes on the published price list, so no price was given. " +
          `Bedrooms: ${num(input, "bedrooms") ?? "n/a"}. Add-ons: ${arr(input, "addons").join(", ") || "none"}.`,
        lead_id: context.leadId,
      });
      context.escalated = true;
      if (context.leadId) {
        await updateLead(context.leadId, {
          status: "quote_requested",
          service_type: serviceType,
        });
      }
      return {
        ok: false,
        needs_tailored_quote: true,
        say_to_client: result.message,
        must_do:
          "Do not estimate a price. Take the client's contact details with save_lead so the team can send a tailored figure.",
      };
    }

    return {
      ok: false,
      needs_more_information: result.reason === "missing_size",
      missing: result.missing,
      say_to_client: result.message,
    };
  }

  if (result.zone_needs_confirmation) {
    await createEscalation({
      reason: "uncertain",
      summary: `Postcode ${postcode.toUpperCase()} needs a coverage check`,
      detail:
        "The assistant quoted using the standard London rate because this postcode did not match a configured zone, or it sits on the Greater London boundary. Confirm coverage and the price before the visit.",
      lead_id: context.leadId,
    });
    context.escalated = true;
  }

  context.quoted = true;
  if (context.leadId) {
    await updateLead(context.leadId, {
      quote_low: result.low,
      quote_high: result.high,
      status: "quote_sent",
      service_type: serviceType,
    });
  }

  // A published price is a single figure. Handing the model "£155 to £155"
  // invites it to describe an exact price as an estimate.
  return {
    ok: true,
    ...(result.from_price_list
      ? {
          price: formatGbp(result.estimate),
          is_our_published_price: true,
          what_was_priced: result.tier_label,
          must_say:
            "State this as our price for a property of that size, not as an estimate.",
        }
      : {
          estimate_range: `${formatGbp(result.low)} to ${formatGbp(result.high)}`,
          is_our_published_price: false,
          must_say: result.disclaimer,
        }),
    low: result.low,
    high: result.high,
    service: result.service_label,
    zone: result.zone_label,
    approximate_time_on_site_hours: result.duration_hours,
    vat_note: result.vat_note,
    also_say: result.disclaimer,
  };
}

async function runAvailability(input: ToolInput) {
  const days = num(input, "days_ahead") ?? 14;
  const preferred = str(input, "preferred_date");
  const slots = await getAvailability(Math.min(Math.max(days, 1), 45));
  const free = slots.filter((slot) => slot.available);
  const filtered = preferred ? free.filter((slot) => slot.date === preferred) : free;

  return {
    ok: true,
    preferred_date_available: preferred ? filtered.length > 0 : null,
    slots: (filtered.length ? filtered : free).slice(0, 8).map((slot) => ({
      date: slot.date,
      slot: slot.slot,
      label: SLOT_LABELS[slot.slot] ?? slot.slot,
    })),
    note: "Offer only the slots listed here. Nothing else is confirmed as free.",
  };
}

async function runSaveLead(input: ToolInput, context: ToolContext) {
  const name = str(input, "name");
  const email = str(input, "email");
  const phone = str(input, "phone");
  if (!name || (!email && !phone)) {
    return {
      ok: false,
      say_to_client:
        "Ask for their name and either a telephone number or an email address.",
    };
  }

  const payload = {
    name,
    email,
    phone,
    address: str(input, "address"),
    postcode: str(input, "postcode"),
    property_type: (str(input, "property_type") as PropertyType | null) ?? null,
    bedrooms: num(input, "bedrooms"),
    floor_area_sqft: num(input, "floor_area_sqft"),
    service_type: (str(input, "service_type") as ServiceType | null) ?? null,
    addons: arr(input, "addons"),
    preferred_date: str(input, "preferred_date"),
    segment: (str(input, "segment") as CustomerSegment | null) ?? "unknown",
    notes: str(input, "notes"),
  };

  if (context.leadId) {
    await updateLead(context.leadId, payload);
    return { ok: true, lead_id: context.leadId, updated: true };
  }

  const existing = await findLead(email, phone);
  if (existing) {
    await updateLead(existing.id, payload);
    context.leadId = existing.id;
    return { ok: true, lead_id: existing.id, updated: true };
  }

  const lead = await createLead({
    ...payload,
    segment: payload.segment ?? "unknown",
    source: "website_chat",
    marketing_consent: false,
    consent_text:
      "Provided their details in the website chat so we could prepare a quote.",
  });
  context.leadId = lead.id;
  return {
    ok: true,
    lead_id: lead.id,
    must_say:
      "Confirm we will only use these details to prepare their quote and arrange the clean.",
  };
}

async function runCreateBooking(input: ToolInput, context: ToolContext) {
  const result = await createBooking({
    lead_id: context.leadId,
    customer_name: str(input, "customer_name") ?? "",
    email: str(input, "email"),
    phone: str(input, "phone"),
    address: str(input, "address") ?? "",
    postcode: str(input, "postcode") ?? "",
    service_type: (str(input, "service_type") as ServiceType) ?? "domestic",
    addons: arr(input, "addons"),
    bedrooms: num(input, "bedrooms"),
    floor_area_sqft: num(input, "floor_area_sqft"),
    date: str(input, "date") ?? "",
    slot: str(input, "slot") ?? "",
    notes: str(input, "notes"),
    price_override: null,
  });

  if (!result.ok) {
    return { ok: false, say_to_client: result.error, field: result.field };
  }

  context.bookingId = result.booking.id;
  return {
    ok: true,
    booking_id: result.booking.id,
    date: result.booking.date,
    slot: result.booking.slot,
    estimated_price:
      result.booking.price === null
        ? null
        : formatGbp(result.booking.price),
    must_say:
      result.booking.price === null
        ? "Confirm the booking is held and that a member of the team will confirm the price with them. Do not state any figure."
        : "Confirm the booking is held, that the price is an estimate our team will confirm, and that we will send written confirmation.",
  };
}


/**
 * Knowledge lookup. Entries the business has not approved come back flagged
 * so the agent defers instead of filling the gap itself.
 */
async function runSearchKnowledge(input: ToolInput) {
  const query = str(input, "query");
  if (!query) return { ok: false, say_to_client: "Ask the client to say more." };

  const hits = searchKnowledge(query);
  if (hits.length === 0) {
    return {
      ok: false,
      found: false,
      must_do:
        "Nothing in the knowledge base covers this. Do not invent an answer - call escalate_to_human.",
    };
  }

  const blocked = hits.filter((hit) => hit.escalate);
  return {
    ok: true,
    found: true,
    results: hits.map((hit) => ({
      kind: hit.kind,
      title: hit.title,
      answer: hit.answer,
      approved: hit.approved,
      escalate: hit.escalate,
    })),
    must_do: blocked.length
      ? "At least one match is NOT approved for you to state. Do not answer that part - call escalate_to_human and tell the client a member of the team will confirm."
      : "Answer using only the text returned above.",
  };
}

async function runServiceInformation(input: ToolInput) {
  const service = str(input, "service");
  const found = service ? getServiceInformation(service) : null;
  if (!found) {
    return {
      ok: false,
      say_to_client:
        "We provide office cleaning, end of tenancy cleaning and domestic cleaning only.",
    };
  }
  return {
    ok: true,
    name: found.name,
    audience: found.audience,
    summary: found.summary,
    includes: found.includes,
    excludes: found.excludes,
    how_we_work: found.proofPoints,
    pricing_basis: found.priceHint,
  };
}


/**
 * Returns only the customer in this conversation. There is deliberately no
 * way for the agent to look up anyone else - scenario 15 of the test suite
 * exists to prove that.
 */
async function runGetCustomer(context: ToolContext) {
  if (!context.leadId) {
    return {
      ok: false,
      known: false,
      must_do: "We have no record for this person yet. Ask for their details.",
    };
  }
  const lead = await getLead(context.leadId);
  if (!lead) return { ok: false, known: false };

  const bookings = await store.list("bookings", { lead_id: lead.id });
  return {
    ok: true,
    known: true,
    name: lead.name,
    has_email: Boolean(lead.email),
    has_phone: Boolean(lead.phone),
    postcode: lead.postcode,
    service_type: lead.service_type,
    bedrooms: lead.bedrooms,
    floor_area_sqft: lead.floor_area_sqft,
    addons: lead.addons,
    preferred_date: lead.preferred_date,
    quoted: lead.quote_low
      ? `${formatGbp(lead.quote_low)} to ${formatGbp(lead.quote_high ?? lead.quote_low)}`
      : null,
    status: lead.status,
    bookings: bookings.map((booking) => ({
      date: booking.date,
      slot: booking.slot,
      status: booking.status,
    })),
    must_do: "Do not ask for anything already listed here.",
  };
}

/**
 * Queues a written message for the owner to approve. The agent cannot send
 * email directly - see BUSINESS_RULES.md.
 */
async function runSendCustomerMessage(input: ToolInput, context: ToolContext) {
  const subject = str(input, "subject");
  const body = str(input, "body");
  if (!subject || !body) {
    return { ok: false, note: "A subject and a message are both required." };
  }

  const lead = context.leadId ? await getLead(context.leadId) : null;
  if (!lead?.email) {
    return {
      ok: false,
      must_do:
        "We have no email address for this person. Ask for one before offering to write to them.",
    };
  }

  await createEscalation({
    reason: "email_approval",
    summary: `Message ready for approval: ${subject}`,
    detail: `The assistant drafted this during a chat with ${lead.name ?? "a client"}.`,
    lead_id: lead.id,
    draft_subject: subject,
    draft_body: body,
    draft_to: lead.email,
  });
  await logCommunication({
    lead_id: lead.id,
    channel: "email",
    direction: "outbound",
    status: "draft",
    subject,
    body,
    template: "assistant_drafted",
    to_address: lead.email,
  });

  return {
    ok: true,
    queued_for_approval: true,
    must_say:
      "Say a member of our team will be in touch in writing. Do NOT say a message has already been sent.",
  };
}

async function runNotifyOwner(input: ToolInput, context: ToolContext) {
  await createEscalation({
    reason: "manual",
    summary: str(input, "summary") ?? "Note for the owner",
    detail: str(input, "detail") ?? "",
    lead_id: context.leadId,
  });
  return {
    ok: true,
    must_do:
      "Carry on with the conversation. Do not tell the client their enquiry is blocked.",
  };
}

async function runCancelFollowup(input: ToolInput, context: ToolContext) {
  if (!context.leadId) {
    return { ok: false, note: "No lead is attached to this conversation yet." };
  }
  const reason = str(input, "reason") ?? "opted_out";
  await updateLead(context.leadId, {
    followup_paused: true,
    next_followup_at: null,
    ...(reason === "went_elsewhere" ? { status: "lost" as const } : {}),
    ...(reason === "human_took_over" ? { status: "human_review" as const } : {}),
  });
  await logCommunication({
    lead_id: context.leadId,
    channel: "system",
    direction: "outbound",
    body: `Automated follow-ups stopped: ${reason.replace(/_/g, " ")}.`,
    template: "followup_cancelled",
  });
  return {
    ok: true,
    must_say:
      "Confirm politely that we will not contact them again about this enquiry.",
  };
}

async function runEscalate(input: ToolInput, context: ToolContext) {
  const reason = (str(input, "reason") as EscalationReason | null) ?? "uncertain";
  await createEscalation({
    reason,
    summary: str(input, "summary") ?? "Enquiry passed to a team member",
    detail: str(input, "detail") ?? "",
    lead_id: context.leadId,
  });
  context.escalated = true;
  return {
    ok: true,
    must_say:
      "Tell the client plainly that a member of our team will follow this up personally, without promising a specific time.",
  };
}
