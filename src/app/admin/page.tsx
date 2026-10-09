import Link from "next/link";
import { store } from "@/lib/db";
import { aiConfigured } from "@/lib/chat/engine";
import { emailConfigured } from "@/lib/email/send";
import { stripeConfigured } from "@/lib/integrations/stripe";
import { whatsappConfigured } from "@/lib/integrations/whatsapp";
import { LEAD_SOURCES } from "@/lib/types";
import {
  Badge,
  Card,
  EmptyState,
  formatDate,
  formatDateTime,
  money,
  Table,
  Tile,
  Tiles,
} from "@/components/admin/ui";
import { runFollowUpsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [leads, bookings, escalations, settings] = await Promise.all([
    store.list("leads"),
    store.list("bookings"),
    store.list("escalations"),
    store.getSettings(),
  ]);

  const openEscalations = escalations.filter((item) => item.status === "open");
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings
    .filter((booking) => booking.date >= today && booking.status !== "cancelled")
    .sort((a, b) => a.date.localeCompare(b.date));
  const newLeads = leads.filter((lead) => lead.status === "new");
  const awaitingPayment = bookings.filter(
    (booking) =>
      booking.payment_status !== "paid" &&
      booking.payment_status !== "not_applicable" &&
      booking.status !== "cancelled",
  );

  const bySource = LEAD_SOURCES.map((source) => {
    const forSource = leads.filter((lead) => lead.source === source);
    return {
      source,
      total: forSource.length,
      booked: forSource.filter((lead) => lead.status === "booked").length,
    };
  })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

  const connections = [
    { name: "AI assistant (Anthropic)", ready: aiConfigured() },
    { name: "Email sending (Resend)", ready: emailConfigured() },
    { name: "Payments (Stripe)", ready: stripeConfigured() },
    { name: "WhatsApp (Meta)", ready: whatsappConfigured() },
    { name: "Database (Supabase)", ready: store.driver === "supabase" },
  ];

  return (
    <div className="a-stack">
      <Tiles>
        <Tile
          label="New leads"
          value={newLeads.length}
          hint={`${leads.length} in total`}
          href="/admin/leads"
        />
        <Tile
          label="Needs your attention"
          value={openEscalations.length}
          hint="Escalations inbox"
          href="/admin/escalations"
          tone={openEscalations.length ? "alert" : undefined}
        />
        <Tile
          label="Upcoming cleans"
          value={upcoming.length}
          hint={
            upcoming[0] ? `Next on ${formatDate(upcoming[0].date)}` : "None booked"
          }
          href="/admin/bookings"
          tone="good"
        />
        <Tile
          label="Awaiting payment"
          value={awaitingPayment.length}
          hint={money(awaitingPayment.reduce((sum, b) => sum + (b.price ?? 0), 0))}
          href="/admin/bookings"
        />
      </Tiles>

      <div className="a-cols">
        <div className="a-stack">
          <Card
            title="Latest enquiries"
            description="Everything captured by the website, the assistant and email."
            actions={
              <Link href="/admin/leads" className="btn btn-outline btn-sm">
                View all
              </Link>
            }
            bodyless
          >
            {leads.length === 0 ? (
              <div className="a-card-body">
                <EmptyState>No enquiries yet.</EmptyState>
              </div>
            ) : (
              <Table
                headers={["Received", "Name", "Service", "Area", "Estimate", "Status"]}
              >
                {leads.slice(0, 8).map((lead) => (
                  <tr key={lead.id}>
                    <td className="num">{formatDateTime(lead.created_at)}</td>
                    <td>
                      <Link href={`/admin/leads/${lead.id}`} className="strong">
                        {lead.name ?? "Unnamed enquiry"}
                      </Link>
                    </td>
                    <td>{lead.service_type?.replace(/_/g, " ") ?? "—"}</td>
                    <td className="num">{lead.postcode ?? "—"}</td>
                    <td className="num">
                      {lead.quote_low
                        ? `${money(lead.quote_low)}–${money(lead.quote_high)}`
                        : "—"}
                    </td>
                    <td>
                      <Badge value={lead.status} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card
            title="Upcoming cleans"
            actions={
              <Link href="/admin/bookings" className="btn btn-outline btn-sm">
                View all
              </Link>
            }
            bodyless
          >
            {upcoming.length === 0 ? (
              <div className="a-card-body">
                <EmptyState>Nothing in the diary yet.</EmptyState>
              </div>
            ) : (
              <Table
                headers={["Date", "Slot", "Client", "Area", "Price", "Payment"]}
              >
                {upcoming.slice(0, 6).map((booking) => (
                  <tr key={booking.id}>
                    <td className="strong num">{formatDate(booking.date)}</td>
                    <td>{booking.slot}</td>
                    <td>{booking.customer_name}</td>
                    <td className="num">{booking.postcode}</td>
                    <td className="num">{money(booking.price)}</td>
                    <td>
                      <Badge value={booking.payment_status} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="a-stack">
          <Card
            title="Where your leads come from"
            description="Log the channel on every enquiry and this becomes your advertising scorecard."
          >
            {bySource.length === 0 ? (
              <EmptyState>No channel data yet.</EmptyState>
            ) : (
              <ul className="a-channel-list">
                {bySource.map((row) => (
                  <li key={row.source}>
                    <span>{row.source.replace(/_/g, " ")}</span>
                    <span className="n">
                      {row.total} leads · {row.booked} booked
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Follow-ups"
            description={`First nudge after ${settings.followup_1_minutes} minutes, then a check-in ${settings.followup_2_hours} hours later.`}
          >
            <form action={runFollowUpsAction}>
              <button type="submit" className="btn btn-outline btn-sm">
                Run the sweep now
              </button>
            </form>
            <p className="a-note">
              In production a scheduler calls this automatically. See
              SETUP_REQUIRED.md for the free five-minute schedule.
            </p>
          </Card>

          <Card title="Connections">
            <ul className="a-connections">
              {connections.map((connection) => (
                <li key={connection.name}>
                  <span>{connection.name}</span>
                  <Badge value={connection.ready ? "connected" : "simulated"} />
                </li>
              ))}
            </ul>
            <p className="a-note">
              Anything marked simulated still works — messages are recorded
              instead of sent. SETUP_REQUIRED.md lists what to connect, and in
              what order.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
