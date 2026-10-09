import { newId, store } from "@/lib/db";
import { createEscalation, logCommunication } from "@/lib/comms";
import { setLeadStatus } from "@/lib/leads";
import { calculateQuote } from "@/lib/pricing";
import { screenPostcode } from "@/lib/guardrails";
import type { Booking, ServiceType } from "@/lib/types";

/**
 * Availability and booking.
 *
 * Capacity is deliberately simple: a number of teams per slot per day, set
 * in /admin/settings. A slot is offered only while the number of live
 * bookings in it is below that capacity, which is what prevents
 * double-booking without needing a full rota system.
 */

export const SLOT_LABELS: Record<string, string> = {
  morning: "Morning (08:00 - 12:00)",
  afternoon: "Afternoon (12:00 - 16:00)",
  evening: "Evening (16:00 - 20:00)",
};

export interface SlotAvailability {
  date: string;
  slot: string;
  label: string;
  booked: number;
  capacity: number;
  available: boolean;
}

const LIVE_STATUSES = new Set(["pending", "confirmed"]);

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Availability for the next `days` days, starting tomorrow. */
export async function getAvailability(days = 14): Promise<SlotAvailability[]> {
  const settings = await store.getSettings();
  const bookings = await store.list("bookings");
  const live = bookings.filter((b) => LIVE_STATUSES.has(b.status));

  const result: SlotAvailability[] = [];
  for (let offset = 1; offset <= days; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const iso = toIsoDate(date);
    // The business does not work Sundays under its stated hours.
    if (date.getDay() === 0) continue;

    for (const slot of settings.booking_slots) {
      const booked = live.filter((b) => b.date === iso && b.slot === slot).length;
      result.push({
        date: iso,
        slot,
        label: SLOT_LABELS[slot] ?? slot,
        booked,
        capacity: settings.capacity_per_slot,
        available: booked < settings.capacity_per_slot,
      });
    }
  }
  return result;
}

export async function isSlotAvailable(
  date: string,
  slot: string,
): Promise<boolean> {
  const settings = await store.getSettings();
  const bookings = await store.list("bookings");
  const booked = bookings.filter(
    (b) => b.date === date && b.slot === slot && LIVE_STATUSES.has(b.status),
  ).length;
  return booked < settings.capacity_per_slot;
}

export interface CreateBookingInput {
  /** Which variant of the service, where the rate card has more than one. */
  tier?: string | null;
  lead_id?: string | null;
  customer_name: string;
  email?: string | null;
  phone?: string | null;
  address: string;
  postcode: string;
  service_type: ServiceType;
  /** Required field: an empty array is an explicit "no add-ons". */
  addons: string[];
  bedrooms?: number | null;
  floor_area_sqft?: number | null;
  date: string;
  slot: string;
  notes?: string | null;
  /** Set by the admin when overriding the calculated price. */
  price_override?: number | null;
}

export type BookingResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: string; field?: string };

/**
 * Creates a booking after checking every precondition the business set:
 * service type, address, add-ons, London coverage, and a free slot.
 */
export async function createBooking(
  input: CreateBookingInput,
): Promise<BookingResult> {
  if (!input.service_type) {
    return { ok: false, error: "A service type is required.", field: "service_type" };
  }
  if (!input.address || input.address.trim().length < 4) {
    return { ok: false, error: "A full address is required.", field: "address" };
  }
  if (!input.postcode || !input.postcode.trim()) {
    return { ok: false, error: "A postcode is required.", field: "postcode" };
  }
  if (!Array.isArray(input.addons)) {
    return {
      ok: false,
      error: "Add-ons must be confirmed, even if the answer is none.",
      field: "addons",
    };
  }
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, error: "A valid date is required.", field: "date" };
  }

  const area = screenPostcode(input.postcode);
  if (!area.allowed) {
    return { ok: false, error: area.customerMessage ?? "Outside our service area.", field: "postcode" };
  }

  if (!(await isSlotAvailable(input.date, input.slot))) {
    return {
      ok: false,
      error: "That slot has just been taken. Please choose another.",
      field: "slot",
    };
  }

  const pricing = await store.getPricing();
  const quote = calculateQuote(
    {
      service_type: input.service_type,
      postcode: input.postcode,
      bedrooms: input.bedrooms ?? null,
      floor_area_sqft: input.floor_area_sqft ?? null,
      addons: input.addons,
      tier: input.tier ?? null,
    },
    pricing,
  );

  // A price may legitimately be unavailable: the owner may not have approved
  // a rate card yet. The booking still stands; the figure is confirmed by a
  // person and the owner is told so explicitly.
  const price = input.price_override ?? (quote.ok ? quote.estimate : null);
  const priceNeedsConfirming = price === null;

  const booking: Booking = {
    id: newId("booking"),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lead_id: input.lead_id ?? null,
    customer_name: input.customer_name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address,
    postcode: input.postcode.toUpperCase(),
    service_type: input.service_type,
    addons: input.addons,
    date: input.date,
    slot: input.slot,
    duration_hours: quote.ok ? quote.duration_hours : 3,
    price,
    // A figure taken from the published price list is a price, not an
    // estimate, so the booking must not describe it as one.
    price_is_estimate:
      (input.price_override === null || input.price_override === undefined) &&
      !(quote.ok && quote.from_price_list),
    status: "pending",
    payment_status: "unpaid",
    payment_link: null,
    notes: input.notes ?? null,
  };

  const saved = await store.insert("bookings", booking);

  if (priceNeedsConfirming) {
    await createEscalation({
      reason: "uncertain",
      summary: `Price to confirm: ${saved.customer_name}, ${saved.date}`,
      detail:
        "This booking was accepted without a price because the rate card is not approved " +
        "in /admin/pricing. Confirm the figure with the client before the visit.",
      booking_id: saved.id,
      lead_id: saved.lead_id,
    });
  }

  if (input.lead_id) {
    await setLeadStatus(input.lead_id, "booked");
  }
  await logCommunication({
    lead_id: input.lead_id ?? null,
    booking_id: saved.id,
    channel: "system",
    direction: "inbound",
    body: `Booking created for ${saved.date} (${saved.slot}) at ${saved.address}, ${saved.postcode}.`,
    template: "booking_created",
  });

  return { ok: true, booking: saved };
}

export async function listBookings(): Promise<Booking[]> {
  const bookings = await store.list("bookings");
  return bookings.sort((a, b) => a.date.localeCompare(b.date));
}

export async function updateBooking(
  id: string,
  patch: Partial<Booking>,
): Promise<Booking | null> {
  return store.update("bookings", id, {
    ...patch,
    updated_at: new Date().toISOString(),
  });
}
