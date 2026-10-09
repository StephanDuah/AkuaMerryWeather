import { z } from "zod";
import { store } from "@/lib/db";
import { calculateQuote } from "@/lib/pricing";
import { fieldErrorsFromZod, fieldsFromMissing, fieldErrors } from "@/lib/validation";
import { createEscalation } from "@/lib/comms";
import { SERVICE_TYPES } from "@/lib/types";

/** Instant estimate for the public quote form. */

import { rateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const schema = z.object({
  service_type: z.enum(SERVICE_TYPES as [string, ...string[]]),
  postcode: z.string().min(2).max(10),
  bedrooms: z.coerce.number().int().min(0).max(10).nullable().optional(),
  floor_area_sqft: z.coerce.number().min(0).max(100000).nullable().optional(),
  addons: z.array(z.string()).max(12).optional(),
  /** Which variant of the service, where the rate card has more than one. */
  tier: z.string().max(40).nullable().optional(),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "quote", "Too many quote requests in a short time. Please wait a moment and try again.");
  if (limited) return limited;

  const submitted = await request.json().catch(() => null);
  const parsed = schema.safeParse(submitted);
  if (!parsed.success) {
    // Names the offending fields so the form can mark them, rather than
    // leaving the customer to guess which box is wrong.
    return Response.json({ ok: false, ...fieldErrorsFromZod(parsed.error, submitted) }, { status: 400 });
  }

  const pricing = await store.getPricing();
  const result = calculateQuote(
    {
      service_type: parsed.data.service_type as (typeof SERVICE_TYPES)[number],
      postcode: parsed.data.postcode,
      bedrooms: parsed.data.bedrooms ?? null,
      floor_area_sqft: parsed.data.floor_area_sqft ?? null,
      addons: parsed.data.addons ?? [],
      tier: parsed.data.tier ?? null,
    },
    pricing,
  );

  if (!result.ok) {
    if (result.reason === "outside_london") {
      await createEscalation({
        reason: "out_of_area",
        summary: `Quote attempted outside Greater London (${parsed.data.postcode})`,
        detail:
          "Someone used the website quote form for an address outside our coverage. No estimate was given.",
      });
    }
    // The pricing engine says which details it still needs. Passing that
    // through as field errors means "we need the postcode" marks the
    // postcode box, instead of appearing as a sentence above the form.
    const missing = result.missing ?? [];
    const asFields =
      missing.length > 0
        ? fieldErrors(fieldsFromMissing(missing))
        : result.reason === "outside_london"
          ? fieldErrors({ postcode: result.message })
          : result.reason === "size_not_on_price_list"
            ? fieldErrors({
                [parsed.data.service_type === "office" ? "floor_area_sqft" : "bedrooms"]:
                  result.message,
              })
            : null;

    return Response.json(asFields ? { ...result, ...asFields } : result);
  }

  return Response.json(result);
}
