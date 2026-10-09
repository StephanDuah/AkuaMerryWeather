import Link from "next/link";
import { store } from "@/lib/db";
import { getAvailability, SLOT_LABELS } from "@/lib/booking";
import { stripeConfigured } from "@/lib/integrations/stripe";
import {
  Badge,
  Card,
  EmptyState,
  formatDate,
  money,
  Table,
} from "@/components/admin/ui";
import { createPaymentLinkAction, updateBookingAction } from "../actions";
import type { Booking } from "@/lib/types";

export const dynamic = "force-dynamic";

const BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled"];
const PAYMENT_STATUSES = [
  "unpaid",
  "link_sent",
  "paid",
  "refunded",
  "not_applicable",
];

export default async function BookingsPage() {
  const [bookings, availability, settings] = await Promise.all([
    store.list("bookings"),
    getAvailability(10),
    store.getSettings(),
  ]);

  const sorted = [...bookings].sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = sorted.filter((booking) => booking.date >= today);
  const past = sorted.filter((booking) => booking.date < today).reverse();

  const byDate = availability.reduce<Record<string, typeof availability>>(
    (accumulator, slot) => {
      (accumulator[slot.date] ||= []).push(slot);
      return accumulator;
    },
    {},
  );

  return (
    <div className="a-stack">
      {!stripeConfigured() && (
        <p className="a-flag">
          Stripe is not connected yet, so payment links cannot be issued.
          Bookings still work: invoice clients directly and mark them paid here.
          See SETUP_REQUIRED.md.
        </p>
      )}

      <Card
        title="Upcoming cleans"
        description="Confirm the price once you have seen the property, and mark payment as it arrives."
        bodyless
      >
        {upcoming.length === 0 ? (
          <div className="a-card-body">
            <EmptyState>Nothing booked yet.</EmptyState>
          </div>
        ) : (
          <BookingTable bookings={upcoming} />
        )}
      </Card>

      <Card
        title="Diary availability"
        description={`${settings.capacity_per_slot} team(s) per slot. A slot disappears once it is full, which is what prevents double-booking.`}
      >
        <div className="a-tiles" style={{ gridTemplateColumns: "" }}>
          {Object.entries(byDate).map(([date, slots]) => (
            <div className="a-tile" key={date}>
              <p className="k">{formatDate(date)}</p>
              <ul style={{ listStyle: "none", margin: "0.6rem 0 0", padding: 0 }}>
                {slots.map((slot) => (
                  <li
                    key={slot.slot}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                      fontSize: "var(--t-small)",
                      color: slot.available
                        ? "var(--ink-body)"
                        : "var(--ink-meta)",
                      textDecoration: slot.available ? "none" : "line-through",
                      paddingBlock: "0.15rem",
                    }}
                  >
                    <span>{SLOT_LABELS[slot.slot] ?? slot.slot}</span>
                    <span className="num">
                      {slot.booked}/{slot.capacity}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {past.length > 0 && (
        <Card title="Past cleans" bodyless>
          <BookingTable bookings={past} />
        </Card>
      )}
    </div>
  );
}

function BookingTable({ bookings }: { bookings: Booking[] }) {
  return (
    <Table
      headers={[
        "Date",
        "Client",
        "Service",
        "Address",
        "Price",
        "Status",
        "Payment",
        "",
      ]}
    >
      {bookings.map((booking) => (
        <tr key={booking.id}>
          <td className="num">
            <span className="strong">{formatDate(booking.date)}</span>
            <span className="sub">
              {booking.slot} · {booking.duration_hours}h
            </span>
          </td>
          <td>
            {booking.lead_id ? (
              <Link href={`/admin/leads/${booking.lead_id}`} className="strong">
                {booking.customer_name}
              </Link>
            ) : (
              <span className="strong">{booking.customer_name}</span>
            )}
            <span className="sub">{booking.email ?? booking.phone ?? "—"}</span>
          </td>
          <td>
            {booking.service_type.replace(/_/g, " ")}
            {booking.addons.length > 0 && (
              <span className="sub">
                {booking.addons.join(", ").replace(/_/g, " ")}
              </span>
            )}
          </td>
          <td>
            {booking.address}
            <span className="sub">{booking.postcode}</span>
          </td>
          <td className="num">
            {money(booking.price)}
            {booking.price_is_estimate && <span className="sub">estimate</span>}
          </td>
          <td>
            <Badge value={booking.status} />
          </td>
          <td>
            <Badge value={booking.payment_status} />
            {booking.payment_link && (
              <a
                href={booking.payment_link}
                target="_blank"
                rel="noreferrer"
                className="sub"
                style={{ color: "var(--blue-deep)" }}
              >
                Payment link
              </a>
            )}
          </td>
          <td>
            <form action={updateBookingAction} className="a-stacked-form">
              <input type="hidden" name="id" value={booking.id} />
              <label className="sr-only" htmlFor={`bstatus-${booking.id}`}>
                Booking status
              </label>
              <select
                id={`bstatus-${booking.id}`}
                name="status"
                className="select"
                defaultValue={booking.status}
              >
                {BOOKING_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`bpay-${booking.id}`}>
                Payment status
              </label>
              <select
                id={`bpay-${booking.id}`}
                name="payment_status"
                className="select"
                defaultValue={booking.payment_status}
              >
                {PAYMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`bprice-${booking.id}`}>
                Confirm price
              </label>
              <input
                id={`bprice-${booking.id}`}
                name="price"
                type="number"
                step="1"
                className="input"
                placeholder="Confirm price"
              />
              <button type="submit" className="btn btn-outline btn-sm">
                Save
              </button>
            </form>
            <form action={createPaymentLinkAction} style={{ marginTop: "0.375rem" }}>
              <input type="hidden" name="id" value={booking.id} />
              <button type="submit" className="btn btn-outline btn-sm">
                Payment link
              </button>
            </form>
          </td>
        </tr>
      ))}
    </Table>
  );
}
