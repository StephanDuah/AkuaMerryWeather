import Link from "next/link";
import { store } from "@/lib/db";
import { emailConfigured } from "@/lib/email/send";
import {
  Badge,
  Card,
  EmptyState,
  formatDateTime,
} from "@/components/admin/ui";
import { approveDraftAction, resolveEscalationAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * The escalations inbox: everything the system would not decide on its own,
 * plus every AI-drafted email waiting for approval.
 */
export default async function EscalationsPage() {
  const [escalations, settings] = await Promise.all([
    store.list("escalations"),
    store.getSettings(),
  ]);

  const open = escalations
    .filter((item) => item.status === "open")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const resolved = escalations
    .filter((item) => item.status === "resolved")
    .sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? ""))
    .slice(0, 12);

  return (
    <div className="a-stack">
      <Card
        title="Needs your attention"
        description="Complaints, payment matters, anything outside London or outside our three services, and anything the assistant was not certain about."
      >
        <p className="a-note" style={{ marginTop: 0 }}>
          Email replies are currently{" "}
          <strong style={{ color: "var(--ink)" }}>
            {settings.email_auto_send
              ? "sent automatically for routine enquiries"
              : "held here for your approval"}
          </strong>
          . Complaints and anything about payment are never sent automatically,
          whichever setting is in use.{" "}
          <Link href="/admin/settings" style={{ color: "var(--blue-deep)" }}>
            Change this
          </Link>
          .
        </p>

        {open.length === 0 ? (
          <div style={{ marginTop: "1.25rem" }}>
            <EmptyState>Nothing waiting. Everything is up to date.</EmptyState>
          </div>
        ) : (
          <div style={{ marginTop: "1.25rem" }}>
            {open.map((item) => (
              <article className="a-item" key={item.id}>
                <div className="a-log-meta">
                  <Badge value={item.reason} />
                  <span>{formatDateTime(item.created_at)}</span>
                  {item.lead_id && (
                    <Link
                      href={`/admin/leads/${item.lead_id}`}
                      style={{ color: "var(--blue-deep)" }}
                    >
                      Open the lead
                    </Link>
                  )}
                </div>

                <h3>{item.summary}</h3>
                <p className="a-item-detail">{item.detail}</p>

                {item.draft_body && (
                  <form action={approveDraftAction} className="a-draft">
                    <p className="cap">
                      Draft reply — edit anything before it goes out
                    </p>
                    <input type="hidden" name="id" value={item.id} />

                    <label className="field" htmlFor={`to-${item.id}`}>
                      <span className="label">To</span>
                      <input
                        id={`to-${item.id}`}
                        name="to"
                        className="input"
                        defaultValue={item.draft_to ?? ""}
                      />
                    </label>

                    <label className="field" htmlFor={`subject-${item.id}`}>
                      <span className="label">Subject</span>
                      <input
                        id={`subject-${item.id}`}
                        name="subject"
                        className="input"
                        defaultValue={item.draft_subject ?? ""}
                      />
                    </label>

                    <label className="field" htmlFor={`body-${item.id}`}>
                      <span className="label">Message</span>
                      <textarea
                        id={`body-${item.id}`}
                        name="body"
                        className="textarea"
                        rows={10}
                        defaultValue={item.draft_body}
                      />
                    </label>

                    <button type="submit" className="btn btn-primary btn-sm">
                      Approve and send
                    </button>

                    {!emailConfigured() && (
                      <p className="a-note">
                        No email provider is connected yet, so approving will
                        record the message in the lead&rsquo;s history rather
                        than delivering it.
                      </p>
                    )}
                  </form>
                )}

                <form
                  action={resolveEscalationAction}
                  style={{ marginTop: "1rem" }}
                >
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="btn btn-outline btn-sm">
                    Mark as handled
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </Card>

      {resolved.length > 0 && (
        <Card title="Recently handled">
          <ul className="a-channel-list">
            {resolved.map((item) => (
              <li key={item.id}>
                <span>{item.summary}</span>
                <span className="n">{formatDateTime(item.resolved_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
