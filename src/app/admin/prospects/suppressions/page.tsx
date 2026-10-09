import Link from "next/link";
import { store } from "@/lib/db";
import { Card, EmptyState, formatDate, Table } from "@/components/admin/ui";
import type { Prospect, Suppression } from "@/lib/prospecting/types";
import { addSuppressionAction, removeSuppressionAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * The do-not-contact list.
 *
 * Checked before every search and every import, before a record is created
 * rather than after. An organisation on this list cannot re-enter the
 * pipeline by being discovered again from a different source.
 *
 * Entries are permanent by intent. They can be removed, but that is a
 * deliberate act with its own button and its own audit entry, and removing
 * one does not put anything back into the pipeline.
 */

const TYPE_LABELS: Record<Suppression["identifier_type"], string> = {
  domain: "Website domain",
  email: "Email address",
  phone: "Phone number",
  company_name: "Company name",
  ch_number: "Companies House number",
};

export default async function SuppressionsPage({
  searchParams,
}: PageProps<"/admin/prospects/suppressions">) {
  const params = await searchParams;
  const result = typeof params.result === "string" ? params.result : "";
  const problem = typeof params.problem === "string" ? params.problem : "";

  const [suppressions, prospects] = await Promise.all([
    store.list("suppressions") as Promise<Suppression[]>,
    store.list("prospects") as Promise<Prospect[]>,
  ]);

  const marked = prospects.filter((p) => p.status === "do_not_contact").length;

  return (
    <div className="a-stack">
      <div>
        <Link href="/admin/prospects" className="a-back">
          Back to prospects
        </Link>
      </div>

      {result && (
        <p className="a-note" style={{ marginTop: 0 }}>
          {result}
        </p>
      )}
      {problem && <p className="a-flag">{problem}</p>}

      <Card
        title="Do not contact"
        description="The suppression list. Anything matching an entry here is skipped before a prospect record is even created, whichever source found it."
      >
        <div className="a-prose">
          <p>
            Add an organisation the moment it asks not to be contacted, however
            it asks — a reply, a phone call, or a form on their website. Under
            UK GDPR an objection has to be honoured without delay, and this is
            how that is recorded.
          </p>
          <p>
            {suppressions.length} entr{suppressions.length === 1 ? "y" : "ies"}{" "}
            on the list. {marked} record{marked === 1 ? "" : "s"} on file
            {marked === 1 ? " is" : " are"} marked do-not-contact as a result.
          </p>
        </div>
      </Card>

      <Card
        title="Add an entry"
        description="Suppress the most durable identifier you have. A domain covers every email address at that company; a company name is the weakest match and may catch similarly named businesses."
      >
        <form action={addSuppressionAction} className="a-stack">
          <div className="field-row">
            <label className="field">
              <span className="label">What kind of thing</span>
              <select name="identifier_type" className="select" defaultValue="domain">
                {(
                  Object.keys(TYPE_LABELS) as Suppression["identifier_type"][]
                ).map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Value</span>
              <span className="hint">
                A domain can be written with or without https:// — it is
                normalised either way.
              </span>
              <input
                type="text"
                name="identifier"
                className="input"
                placeholder="example.co.uk"
                required
              />
            </label>
          </div>
          <label className="field">
            <span className="label">Reason</span>
            <span className="hint">
              Kept so that, if the same organisation surfaces again, you can see
              why it was excluded.
            </span>
            <input
              type="text"
              name="reason"
              className="input"
              defaultValue="Asked not to be contacted"
            />
          </label>
          <div>
            <button type="submit" className="btn btn-primary btn-sm">
              Add to the list
            </button>
          </div>
        </form>
      </Card>

      <Card title="The list" bodyless>
        {suppressions.length === 0 ? (
          <div className="a-card-body">
            <EmptyState>
              Nothing suppressed yet. That is expected before any outreach has
              happened.
            </EmptyState>
          </div>
        ) : (
          <Table headers={["Value", "Kind", "Reason", "Added", "Added by", ""]}>
            {suppressions
              .slice()
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((entry) => (
                <tr key={entry.id}>
                  <td className="strong">{entry.identifier}</td>
                  <td>{TYPE_LABELS[entry.identifier_type]}</td>
                  <td>{entry.reason}</td>
                  <td className="num">{formatDate(entry.created_at)}</td>
                  <td>{entry.created_by}</td>
                  <td>
                    <form action={removeSuppressionAction}>
                      <input type="hidden" name="id" value={entry.id} />
                      <button type="submit" className="btn btn-outline btn-sm">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
          </Table>
        )}
      </Card>

      <Card title="What removing an entry does">
        <div className="a-prose">
          <p>
            It lifts the block on future searches, and nothing else. Records
            already marked do-not-contact stay marked, so nobody is contacted by
            accident because a line was deleted here.
          </p>
          <p>
            If an organisation has withdrawn its objection and you want to
            approach it again, remove the entry here and then set the status on
            its record back to <strong>verified</strong>.
          </p>
        </div>
      </Card>
    </div>
  );
}
