import Stripe from "stripe";
import { BUSINESS } from "@/lib/content";
import type { Booking } from "@/lib/types";

/**
 * Stripe payment links.
 *
 * Stripe has no monthly fee - it charges per transaction only - so it fits
 * a zero-cost starting position. Until the owner has created an account the
 * calls are simulated and the booking simply stays marked unpaid.
 */

export function stripeConfigured(): boolean {
  if (process.env.MOCK_MODE === "true") return false;
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export interface PaymentLinkResult {
  url: string | null;
  simulated: boolean;
  error?: string;
}

export async function createPaymentLink(
  booking: Booking,
): Promise<PaymentLinkResult> {
  if (!stripeConfigured()) {
    return { url: null, simulated: true };
  }

  if (booking.price === null) {
    return {
      url: null,
      simulated: false,
      error:
        "No payment link was created because this booking has no confirmed price yet.",
    };
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
    const serviceName = booking.service_type.replace(/_/g, " ");

    const price = await stripe.prices.create({
      currency: "gbp",
      unit_amount: Math.round(booking.price * 100),
      product_data: {
        name: `${BUSINESS.name} - ${serviceName}`,
      },
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        booking_id: booking.id,
        booking_date: booking.date,
        postcode: booking.postcode,
      },
      after_completion: {
        type: "redirect",
        redirect: {
          url: `${process.env.NEXT_PUBLIC_SITE_URL ?? BUSINESS.website}/booking/thank-you`,
        },
      },
    });

    return { url: link.url, simulated: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[merry-cleaners] Stripe payment link failed:", message);
    return { url: null, simulated: false, error: message };
  }
}
