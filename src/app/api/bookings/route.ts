import { readLeadToken } from "@/lib/security/leadToken";
import { fieldErrorsFromZod, fieldErrors } from "@/lib/validation";
import { z } from "zod";
import { createBooking, updateBooking } from "@/lib/booking";
import { createPaymentLink, stripeConfigured } from "@/lib/integrations/stripe";
import { bookingConfirmation } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { createEscalation } from "@/lib/comms";
import { SERVICE_TYPES } from "@/lib/types";
import type { ServiceType } from "@/lib/types";

/**
 * Public booking creation.
 *
 * A booking requires the service type, the full address and a confirmed
 * add-ons list. Once it is created we ask Stripe for a payment link; if
 * Stripe is not connected yet the booking is still made and simply stays
 * marked unpaid, with the owner told to invoice manually.
 */

import { rateLimit } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const schema = z.object({
  /** A token issued by this server, not a raw lead id. */
  lead_id: z.string().max(400).nullable().optional(),
  customer_name: z.string().min(2).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(7).max(30).optional().or(z.literal("")),
  address: z.string().min(4).max(200),
  postcode: z.string().min(2).max(10),
  service_type: z.enum(SERVICE_TYPES as [string, ...string[]]),
  addons: z.array(z.string()).max(12),
  tier: z.string().max(40).nullable().optional(),
  bedrooms: z.coerce.number().int().min(0).max(10).nullable().optional(),
  floor_area_sqft: z.coerce.number().min(0).max(100000).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(["morning", "afternoon", "evening"]),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const limited = rateLimit(request, "booking", "Too many booking attempts in a short time. Please wait a moment and try again.");
  if (limited) return limited;

  const submitted = await request.json().catch(() => null);
  const parsed = schema.safeParse(submitted);
  if (!parsed.success) {
    return Response.json({ ok: false, ...fieldErrorsFromZod(parsed.error, submitted) }, { status: 400 });
  }

  const data = parsed.data;
  const result = await createBooking({
    // Unsigned or altered means no link, rather than a booking attached to
    // whichever lead the caller named.
    lead_id: readLeadToken(data.lead_id ?? null),
    customer_name: data.customer_name,
    email: data.email || null,
    phone: data.phone || null,
    address: data.address,
    postcode: data.postcode,
    service_type: data.service_type as ServiceType,
    tier: data.tier ?? null,
    addons: data.addons,
    bedrooms: data.bedrooms ?? null,
    floor_area_sqft: data.floor_area_sqft ?? null,
    date: data.date,
    slot: data.slot,
    notes: data.notes || null,
    price_override: null,
  });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        // createBooking already knows which field it objected to; passing it
        // through means a diary clash marks the date box rather than the form.
        ...fieldErrors({ [result.field ?? "form"]: result.error ?? "Please check the details supplied." }),
        field: result.field,
      },
      { status: 400 },
    );
  }

  let booking = result.booking;

  const payment = await createPaymentLink(booking);
  if (payment.url) {
    booking =
      (await updateBooking(booking.id, {
        payment_link: payment.url,
        payment_status: "link_sent",
        status: "confirmed",
      })) ?? booking;
  } else {
    booking = (await updateBooking(booking.id, { status: "confirmed" })) ?? booking;
    if (!stripeConfigured()) {
      await createEscalation({
        reason: "payment",
        summary: `Invoice manually: booking on ${booking.date} for ${booking.customer_name}`,
        detail:
          "Stripe is not connected yet, so no payment link could be issued. Take payment directly and update the booking once settled.",
        booking_id: booking.id,
        lead_id: booking.lead_id,
      });
    }
  }

  if (booking.email) {
    const content = bookingConfirmation(booking, booking.payment_link);
    await sendEmail({
      to: booking.email,
      subject: content.subject,
      body: content.body,
      lead_id: booking.lead_id,
      booking_id: booking.id,
      template: "booking_confirmation",
    });
  }

  return Response.json({
    ok: true,
    booking_id: booking.id,
    date: booking.date,
    slot: booking.slot,
    price: booking.price,
    price_is_estimate: booking.price_is_estimate,
    payment_link: booking.payment_link,
    message:
      "Your booking is held. Our team will confirm the details and the final price in writing shortly.",
  });
}
