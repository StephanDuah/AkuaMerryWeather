import Link from "next/link";
import { notFound } from "next/navigation";
import { store } from "@/lib/db";
import { leadHistory } from "@/lib/comms";
import { actionsForLead } from "@/lib/agent/audit";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/types";
import {
  Badge,
  Card,
  EmptyState,
  formatDate,
  formatDateTime,
  money,
} from "@/components/admin/ui";
import {
  deleteLeadAction,
  pauseFollowUpsAction,
  updateLeadFieldsAction,
  updateLeadStatusAction,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: PageProps<"/admin/leads/[id]">) {
  const { id } = await params;
  const lead = await store.get("leads", id);
  if (!lead) notFound();

  const [history, bookings, actions] = await Promise.all([
    leadHistory(lead.id),
    store.list("bookings", { lead_id: lead.id }),
    actionsForLead(lead.id),
  ]);

  return (
    <div className="a-stack">
      <div>
        <Link
          href="/admin/leads"
          style={{ fontSize: "var(--t-small)", color: "var(--ink-meta)" }}
        >
          &larr; Back to leads
        </Link>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.75rem 1rem",
            marginTop: "0.5rem",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--display)",
              fontSize: "1.75rem",
              color: "var(--ink)",
            }}
          >
            {lead.name ?? "Unnamed enquiry"}
          </h1>
          <Badge value={lead.status} />
        </div>
        <p className="a-note" style={{ marginTop: "0.25rem" }}>
          Created {formatDateTime(lead.created_at)} ·{" "}
          {lead.source.replace(/_/g, " ")}
        </p>
      </div>

      <div className="a-cols">
        <div className="a-stack">
          <Card title="Enquiry details">
            <dl className="a-kv a-kv-2">
              <Row label="Email" value={lead.email} />
              <Row label="Telephone" value={lead.phone} />
              <Row label="Address" value={lead.address} />
              <Row label="Postcode" value={lead.postcode} />
              <Row
                label="Service"
                value={lead.service_type?.replace(/_/g, " ") ?? null}
              />
              <Row
                label="Property"
                value={
                  lead.bedrooms !== null
                    ? `${lead.bedrooms} bedroom ${lead.property_type ?? ""}`.trim()
                    : lead.floor_area_sqft
                      ? `${lead.floor_area_sqft.toLocaleString("en-GB")} sq ft`
                      : null
                }
              />
              <Row label="Preferred date" value={formatDate(lead.preferred_date)} />
              <Row
                label="Add-ons"
                value={
                  lead.addons.length
                    ? lead.addons.join(", ").replace(/_/g, " ")
                    : "None"
                }
              />
              <Row
                label="Estimate given"
                value={
                  lead.quote_low
                    ? `${money(lead.quote_low)} – ${money(lead.quote_high)}`
                    : null
                }
              />
              <Row label="Audience" value={lead.segment.replace(/_/g, " ")} />
            </dl>
            {lead.notes && <p className="a-note">{lead.notes}</p>}
          </Card>

          <Card
            title="Communications log"
            description="Every message in and out, in one place."
          >
            {history.length === 0 ? (
              <EmptyState>Nothing logged yet.</EmptyState>
            ) : (
              <div className="a-log">
                {history.map((entry) => (
                  <article className="a-log-item" key={entry.id}>
                    <div className="a-log-meta">
                      <span className="ch">{entry.channel}</span>
                      <span>{entry.direction}</span>
                      <Badge value={entry.status} />
                      <span>{formatDateTime(entry.created_at)}</span>
                    </div>
                    {entry.subject && (
                      <p className="a-log-subject">{entry.subject}</p>
                    )}
                    <p className="a-log-body">{entry.body}</p>
                  </article>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="a-stack">
          <Card title="Status">
            <form action={updateLeadStatusAction} className="a-inline-form">
              <input type="hidden" name="id" value={lead.id} />
              <label className="sr-only" htmlFor="lead-status">
                Status
              </label>
              <select
                id="lead-status"
                name="status"
                className="select"
                defaultValue={lead.status}
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary btn-sm">
                Save
              </button>
            </form>
          </Card>

          <Card title="Channel and notes">
            <form action={updateLeadFieldsAction}>
              <input type="hidden" name="id" value={lead.id} />
              <label className="field" htmlFor="lead-source">
                <span className="label">Where this lead came from</span>
                <select
                  id="lead-source"
                  name="source"
                  className="select"
                  defaultValue={lead.source}
                >
                  {LEAD_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor="lead-notes">
                <span className="label">Notes</span>
                <textarea
                  id="lead-notes"
                  name="notes"
                  className="textarea"
                  rows={4}
                  defaultValue={lead.notes ?? ""}
                />
              </label>
              <button type="submit" className="btn btn-primary btn-sm">
                Save
              </button>
            </form>
          </Card>

          <Card
            title="Follow-ups"
            description={
              lead.followup_paused
                ? "Paused — no further automated messages will be sent."
                : `Stage ${lead.followup_stage} of 2. Next due ${formatDateTime(lead.next_followup_at)}.`
            }
          >
            <form action={pauseFollowUpsAction}>
              <input type="hidden" name="id" value={lead.id} />
              <input
                type="hidden"
                name="paused"
                value={lead.followup_paused ? "false" : "true"}
              />
              <button type="submit" className="btn btn-outline btn-sm">
                {lead.followup_paused ? "Resume follow-ups" : "Pause follow-ups"}
              </button>
            </form>
          </Card>

          {actions.length > 0 && (
            <Card
              title="What the AI did"
              description="Every tool the agent ran for this customer."
            >
              <ul className="a-channel-list">
                {actions.slice(0, 12).map((action) => (
                  <li key={action.id}>
                    <span>{action.tool.replace(/_/g, " ")}</span>
                    <span className="n">{action.outcome}</span>
                  </li>
                ))}
              </ul>
              <p className="a-note">
                <Link href="/admin/activity" style={{ color: "var(--blue-deep)" }}>
                  Full AI activity log
                </Link>
              </p>
            </Card>
          )}

          {bookings.length > 0 && (
            <Card title="Bookings">
              <ul className="a-channel-list">
                {bookings.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      href="/admin/bookings"
                      style={{ color: "var(--blue-deep)" }}
                    >
                      {formatDate(booking.date)} · {booking.slot}
                    </Link>
                    <span className="n">{money(booking.price)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="Data protection"
            description={`Lawful basis: ${lead.lawful_basis.replace(/_/g, " ")}. Marketing consent: ${lead.marketing_consent ? "given" : "not given"}.`}
          >
            <p className="a-note" style={{ marginTop: 0 }}>
              Deleting removes this person and everything attached to them —
              enquiry, messages, escalations and bookings. Use this to honour a
              request to be forgotten. It cannot be undone.
            </p>
            <form action={deleteLeadAction} style={{ marginTop: "1rem" }}>
              <input type="hidden" name="id" value={lead.id} />
              <button type="submit" className="a-danger">
                Delete this record permanently
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}
