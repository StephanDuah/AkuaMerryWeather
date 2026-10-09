import { BUSINESS } from "@/lib/content";
import { formatGbp } from "@/lib/pricing";
import type { Booking, Lead } from "@/lib/types";

/**
 * Written templates for the messages the business sends most often.
 *
 * These are plain text and deliberately restrained: premium tone, no
 * pressure, no invented claims, and never a price that did not come from
 * the pricing engine.
 */

export interface EmailContent {
  subject: string;
  body: string;
}

const signature = [
  "",
  "Kind regards,",
  "",
  `${BUSINESS.name}`,
  BUSINESS.strapline,
  `Telephone ${BUSINESS.phonePrimary}`,
  BUSINESS.email,
  BUSINESS.address,
].join("\n");

function greeting(name: string | null): string {
  return name ? `Dear ${name.split(" ")[0]},` : "Good afternoon,";
}

function quoteLine(lead: Lead): string {
  if (lead.quote_low && lead.quote_high) {
    return `Based on the details you gave us, our estimate is ${formatGbp(lead.quote_low)} to ${formatGbp(lead.quote_high)}. This remains an estimate until we have confirmed the scope with you.`;
  }
  return "We would be glad to confirm a precise price once we have a little more detail about the property.";
}

/** Sent five minutes after an enquiry that has not converted. */
export function followUpOne(lead: Lead): EmailContent {
  return {
    subject: `Your cleaning enquiry - ${BUSINESS.name}`,
    body: [
      greeting(lead.name),
      "",
      "Thank you for your enquiry. We are glad you considered us, and I wanted to confirm that it has reached our team.",
      "",
      quoteLine(lead),
      "",
      "A few things worth knowing: our cleaners are DBS-checked, trained to a written standard and fully insured, and every clean is covered by our re-clean guarantee. For end of tenancy work we also provide before and after photographs as a record of the condition.",
      "",
      `If you would like to discuss timings or anything specific to the property, you are welcome to reply to this message or call us on ${BUSINESS.phonePrimary}.`,
      signature,
    ].join("\n"),
  };
}

/** The later check-in, sent if there is still no response. */
export function followUpTwo(lead: Lead): EmailContent {
  return {
    subject: `Following up on your cleaning enquiry`,
    body: [
      greeting(lead.name),
      "",
      "I am following up on the enquiry you made with us recently, in case it is still something you are considering.",
      "",
      "If the timing has moved, that is no trouble at all - we can hold the details on file and pick it up whenever suits you. If you have decided to go elsewhere, I would be grateful to know, and we will leave you in peace.",
      "",
      `Either way, you are welcome to reach us on ${BUSINESS.phonePrimary} or by replying to this message.`,
      signature,
    ].join("\n"),
  };
}

export function quoteEmail(lead: Lead): EmailContent {
  return {
    subject: `Your cleaning estimate from ${BUSINESS.name}`,
    body: [
      greeting(lead.name),
      "",
      "Thank you for the details you provided. I am pleased to set out our estimate below.",
      "",
      quoteLine(lead),
      "",
      lead.postcode
        ? `This is based on the property at ${lead.postcode}.`
        : "This is based on the information provided so far.",
      "",
      "Our cleaners are DBS-checked, trained and fully insured, and the work is covered by our re-clean guarantee: if anything falls short of the agreed specification, tell us within 48 hours and we will return and put it right.",
      "",
      "If you are happy to proceed, let me know which date suits you and I will confirm availability.",
      signature,
    ].join("\n"),
  };
}

export function bookingConfirmation(
  booking: Booking,
  paymentLink: string | null,
): EmailContent {
  const lines = [
    greeting(booking.customer_name),
    "",
    "Thank you for booking with us. Your clean is confirmed as follows.",
    "",
    `Service: ${booking.service_type.replace(/_/g, " ")}`,
    `Date: ${booking.date}`,
    `Arrival window: ${booking.slot}`,
    `Address: ${booking.address}, ${booking.postcode}`,
    `Estimated time on site: ${booking.duration_hours} hours`,
    booking.price === null
      ? "Price: a member of our team will confirm this with you before the visit."
      : `Price: ${formatGbp(booking.price)}${booking.price_is_estimate ? " (estimate, confirmed by our team before the visit)" : ""}`,
    "",
  ];
  if (paymentLink) {
    lines.push(
      "You may settle the invoice securely using the link below:",
      paymentLink,
      "",
    );
  }
  lines.push(
    "If anything about the property or the access arrangements changes, please let us know as early as you are able.",
    signature,
  );
  return {
    subject: `Booking confirmed for ${booking.date} - ${BUSINESS.name}`,
    body: lines.join("\n"),
  };
}

/** The neutral holding reply used whenever a human needs to take over. */
export function handoverReply(name: string | null): EmailContent {
  return {
    subject: "Thank you for your message",
    body: [
      greeting(name),
      "",
      "Thank you for writing to us. So that you receive a properly considered answer, your message has been passed to a member of our team, who will respond to you personally.",
      "",
      "We appreciate your patience.",
      signature,
    ].join("\n"),
  };
}
