import Link from "next/link";
import { notFound } from "next/navigation";
import { store } from "@/lib/db";
import {
  Card,
  EmptyState,
  formatDate,
  formatDateTime,
  Table,
} from "@/components/admin/ui";
import { explainFit } from "@/lib/prospecting/pipeline";
import { prepareOutreach } from "@/lib/prospecting/outreach";
import {
  BUSINESS_TYPE_LABELS,
  LEAD_STATUSES_FROM_PROSPECT,
  PROSPECT_STATUSES,
  SOURCE_LABELS,
  type Prospect,
} from "@/lib/prospecting/types";
import { SERVICE_LABELS } from "@/lib/types";
import {
  addSuppressionAction,
  deleteProspectAction,
  markContactedAction,
  recordProspectResponseAction,
  saveProspectNotesAction,
  setProspectStatusAction,
  verifyProspectAction,
} from "../actions";

export const dynamic = "force-dynamic";

/**
 * One prospect, in full.
 *
 * This page exists to answer two questions the owner is entitled to ask
 * before contacting anybody: where did each of these details come from, and
 * why does the system think this organisation is worth approaching? Both are
 * answered from stored evidence, field by field and factor by factor.
 *
 * The draft approach at the bottom is written from those verified facts
 * only, and nothing in this system sends it.
 */

export default async function ProspectPage({
  params,
  searchParams,
}: PageProps<"/admin/prospects/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const problem = typeof query.problem === "string" ? query.problem : "";

  const prospect = (await store.get("prospects", id)) as Prospect | null;
  if (!prospect) notFound();

  const [pricing, lead] = await Promise.all([
    store.getPricing(),
    prospect.lead_id ? store.get("leads", prospect.lead_id) : Promise.resolve(null),
  ]);

  const outreach = prepareOutreach(prospect, pricing);
  const isLead = LEAD_STATUSES_FROM_PROSPECT.includes(prospect.status);
  const selectableStatuses = PROSPECT_STATUSES.filter(
    (status) => !LEAD_STATUSES_FROM_PROSPECT.includes(status),
  );

  return (
    <div className="a-stack">
      <div>
        <Link href="/admin/prospects" className="a-back">
          Back to prospects
        </Link>
      </div>

      {problem && <p className="a-flag">{problem}</p>}

      {prospect.is_test && (
        <p className="a-flag">
          TEST DATA — NOT A REAL PROSPECT. This record was created by the test
          suite. Do not contact it.
        </p>
      )}

      <Card
        title={prospect.company_name}
        description={
          isLead
            ? "This organisation has been in touch, so it is now a lead as well as a prospect."
            : "This organisation has not contacted Merry Cleaners. It is a prospect, not a lead."
        }
        actions={
          <span
            className="a-badge"
            data-tone={prospect.status === "do_not_contact" ? "crit" : "info"}
          >
            {prospect.status.replace(/_/g, " ")}
          </span>
        }
      >
        <dl className="a-kv a-kv-2">
          <div>
            <dt>What kind of organisation</dt>
            <dd>{BUSINESS_TYPE_LABELS[prospect.business_type]}</dd>
          </div>
          <div>
            <dt>Borough</dt>
            <dd>{prospect.borough ?? "Not established"}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>
              {prospect.address ?? "—"}
              {prospect.postcode ? ` · ${prospect.postcode}` : ""}
            </dd>
          </div>
          <div>
            <dt>Website</dt>
            <dd>
              {prospect.website ? (
                <a href={prospect.website} target="_blank" rel="noreferrer nofollow">
                  {prospect.website}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>Business email</dt>
            <dd>{prospect.email ?? "None published"}</dd>
          </div>
          <div>
            <dt>Business phone</dt>
            <dd>{prospect.phone ?? "None published"}</dd>
          </div>
          <div>
            <dt>Contact form</dt>
            <dd>
              {prospect.contact_form_url ? (
                <a
                  href={prospect.contact_form_url}
                  target="_blank"
                  rel="noreferrer nofollow"
                >
                  {prospect.contact_form_url}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>Companies House</dt>
            <dd>
              {prospect.companies_house_number
                ? `${prospect.companies_house_number}${
                    prospect.companies_house_status
                      ? ` · ${prospect.companies_house_status}`
                      : ""
                  }`
                : "Not matched to the register"}
            </dd>
          </div>
          <div>
            <dt>First found</dt>
            <dd>{formatDate(prospect.discovered_at)}</dd>
          </div>
          <div>
            <dt>Last verified</dt>
            <dd>
              {prospect.verified_at
                ? formatDateTime(prospect.verified_at)
                : "Never verified"}
            </dd>
          </div>
        </dl>

        <div className="a-actions" style={{ marginTop: "1.25rem" }}>
          <form action={verifyProspectAction}>
            <input type="hidden" name="id" value={prospect.id} />
            <button type="submit" className="btn btn-primary btn-sm">
              {prospect.verified_at ? "Verify again" : "Verify"}
            </button>
          </form>
          <form action={setProspectStatusAction} className="a-inline-form">
            <input type="hidden" name="id" value={prospect.id} />
            <select
              name="status"
              className="select"
              defaultValue={
                isLead ? "verified" : prospect.status
              }
              aria-label="Status"
            >
              {selectableStatuses.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-outline btn-sm">
              Set status
            </button>
          </form>
        </div>
        <p className="a-note">
          Verifying visits the organisation&rsquo;s own website, where its
          robots file permits, and checks the Companies House register when a
          key is configured. It never tries to get past a login, a paywall or a
          block.
        </p>
      </Card>

      {prospect.flags.length > 0 && (
        <Card
          title="Things to look at"
          description="Surfaced rather than quietly resolved. Where two sources disagreed, both values are kept and the conflict is recorded."
        >
          <ul className="a-channel-list">
            {prospect.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="a-cols">
        <Card
          title="Why this is a priority"
          description={`${prospect.qualification.score} of ${prospect.qualification.max_score} points, from the factors below. Nothing hidden, no AI score.`}
          bodyless
        >
          <div className="a-card-body">
            <p className="a-item-detail" style={{ marginTop: 0 }}>
              {prospect.qualification.reasoning}
            </p>
          </div>
          <Table headers={["Factor", "Met", "Weight", "Why it matters"]}>
            {prospect.qualification.factors.map((factor) => (
              <tr key={factor.factor}>
                <td className="strong">{factor.factor}</td>
                <td>
                  <span
                    className="a-badge"
                    data-tone={factor.met ? "good" : "neutral"}
                  >
                    {factor.met ? "yes" : "no"}
                  </span>
                </td>
                <td className="num">{factor.weight}</td>
                <td>{factor.note}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          title="Services that could suit them"
          description="What an organisation of this kind typically buys. This is not a statement that they need anything."
        >
          {prospect.qualification.potential_services.length === 0 ? (
            <EmptyState>
              Nothing on the rate card plausibly suits this organisation.
            </EmptyState>
          ) : (
            <>
              <ul className="a-channel-list">
                {prospect.qualification.potential_services.map((service) => (
                  <li key={service}>{SERVICE_LABELS[service]}</li>
                ))}
              </ul>
              <p className="a-item-detail">{explainFit(prospect)}</p>
            </>
          )}
          <p className="a-note">
            Potential fit: {prospect.qualification.potential_fit}. Worked out
            from what kind of organisation this is, not from anything they have
            said.
          </p>
        </Card>
      </div>

      <Card
        title="Where every detail came from"
        description="Field-level provenance. Each line is one piece of evidence, with the source, the address it came from, and the date."
        bodyless
      >
        {prospect.provenance.length === 0 ? (
          <div className="a-card-body">
            <EmptyState>No provenance recorded for this record.</EmptyState>
          </div>
        ) : (
          <Table headers={["Field", "Value", "Source", "Confidence", "Collected", "Address"]}>
            {prospect.provenance.map((entry, index) => (
              <tr key={`${entry.field}-${index}`}>
                <td className="strong">{entry.field.replace(/_/g, " ")}</td>
                <td>{entry.value}</td>
                <td>{SOURCE_LABELS[entry.source]}</td>
                <td>{entry.reliability.replace(/_/g, " ")}</td>
                <td className="num">{formatDate(entry.collected_at)}</td>
                <td>
                  {entry.source_url ? (
                    <a href={entry.source_url} target="_blank" rel="noreferrer nofollow">
                      view
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card
        title="Draft an approach"
        description="Written from the verified facts on this record and the approved claims in the knowledge base. Nothing here is sent by the system — you send it yourself, to one recipient."
      >
        {!outreach.ready ? (
          <>
            <p className="a-flag" style={{ marginTop: 0 }}>
              No approach can be prepared for this organisation yet.
            </p>
            <ul className="a-channel-list">
              {outreach.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </>
        ) : (
          outreach.draft && (
            <>
              <dl className="a-kv a-kv-2">
                <div>
                  <dt>How to reach them</dt>
                  <dd>{outreach.draft.channel.replace(/_/g, " ")}</dd>
                </div>
                <div>
                  <dt>Where</dt>
                  <dd>{outreach.draft.destination ?? "—"}</dd>
                </div>
              </dl>

              <div className="a-draft">
                <p className="cap">Subject</p>
                <p className="a-item-detail" style={{ marginTop: "0.35rem" }}>
                  {outreach.draft.subject}
                </p>
                <p className="cap" style={{ marginTop: "1rem" }}>
                  Message
                </p>
                <pre className="a-pre">{outreach.draft.body}</pre>
              </div>

              <h3 style={{ marginTop: "1.5rem" }}>Every fact it uses</h3>
              <Table headers={["Fact", "Where it came from"]}>
                {outreach.draft.facts_used.map((fact) => (
                  <tr key={fact.fact}>
                    <td>{fact.fact}</td>
                    <td>{fact.source}</td>
                  </tr>
                ))}
              </Table>

              <h3 style={{ marginTop: "1.5rem" }}>Before you send it</h3>
              <ul className="a-channel-list">
                {outreach.draft.review_points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>

              <div className="a-actions" style={{ marginTop: "1.25rem" }}>
                <form action={markContactedAction} className="a-inline-form">
                  <input type="hidden" name="id" value={prospect.id} />
                  <select name="channel" className="select" aria-label="How you contacted them">
                    <option value="email">email</option>
                    <option value="contact form">contact form</option>
                    <option value="phone">phone</option>
                  </select>
                  <button type="submit" className="btn btn-outline btn-sm">
                    I have sent this
                  </button>
                </form>
              </div>
              <p className="a-note">
                Recording that you have made contact stops this organisation
                coming back up as something to approach.
              </p>
            </>
          )
        )}
      </Card>

      <div className="a-cols">
        {prospect.lead_id && lead ? (
          <Card
            title="This is now a lead"
            description="The two records are linked, so the report can say honestly how many leads prospecting has produced."
          >
            <dl className="a-kv">
              <div>
                <dt>Lead</dt>
                <dd>
                  <Link href={`/admin/leads/${lead.id}`} className="strong">
                    {lead.name ?? "unnamed lead"}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{lead.status.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(lead.created_at)}</dd>
              </div>
            </dl>
            <p className="a-note">
              Automated follow-ups were left paused on that lead. We approached
              them first, so chasing them is your call, not a timer&rsquo;s.
            </p>
          </Card>
        ) : (
          <Card
            title="They got in touch"
            description="Only use this when the organisation has actually replied. This is the one place a prospect becomes a lead, and the only thing that adds to the lead numbers."
          >
            <form action={recordProspectResponseAction} className="a-stack">
              <input type="hidden" name="id" value={prospect.id} />
              <label className="field">
                <span className="label">Who replied</span>
                <span className="hint">
                  Leave blank to use the organisation&rsquo;s name.
                </span>
                <input type="text" name="contact_name" className="input" />
              </label>
              <div className="field-row">
                <label className="field">
                  <span className="label">Their email</span>
                  <input
                    type="email"
                    name="email"
                    className="input"
                    defaultValue={prospect.email ?? ""}
                  />
                </label>
                <label className="field">
                  <span className="label">Their phone</span>
                  <input
                    type="tel"
                    name="phone"
                    className="input"
                    defaultValue={prospect.phone ?? ""}
                  />
                </label>
              </div>
              <label className="field">
                <span className="label">What they said</span>
                <span className="hint">
                  Recorded on the lead so whoever picks it up has the context.
                </span>
                <textarea name="summary" className="textarea" rows={3} />
              </label>
              <div>
                <button type="submit" className="btn btn-primary btn-sm">
                  Create the lead
                </button>
              </div>
            </form>
          </Card>
        )}

        <div className="a-stack">
          <Card title="Your notes">
            <form action={saveProspectNotesAction}>
              <label className="field">
                <span className="label">Notes</span>
                <span className="hint">
                  Only for this record. Not shown to anyone outside the
                  dashboard.
                </span>
                <textarea
                  name="notes"
                  className="textarea"
                  rows={4}
                  defaultValue={prospect.notes ?? ""}
                />
              </label>
              <input type="hidden" name="id" value={prospect.id} />
              <button type="submit" className="btn btn-outline btn-sm">
                Save notes
              </button>
            </form>
          </Card>

          <Card
            title="Do not contact"
            description="Use this the moment they ask. It is permanent and it is checked before every future search."
          >
            <form action={addSuppressionAction} className="a-stack">
              <input type="hidden" name="prospect_id" value={prospect.id} />
              <label className="field">
                <span className="label">What to suppress</span>
                <select name="identifier_type" className="select" defaultValue="domain">
                  {prospect.website && <option value="domain">their website domain</option>}
                  {prospect.email && <option value="email">their email address</option>}
                  {prospect.phone && <option value="phone">their phone number</option>}
                  {prospect.companies_house_number && (
                    <option value="ch_number">their Companies House number</option>
                  )}
                  <option value="company_name">their company name</option>
                </select>
              </label>
              <label className="field">
                <span className="label">Value</span>
                <span className="hint">
                  Pre-filled from this record. Check it matches what you chose
                  above.
                </span>
                <input
                  type="text"
                  name="identifier"
                  className="input"
                  defaultValue={
                    prospect.website ??
                    prospect.email ??
                    prospect.phone ??
                    prospect.company_name
                  }
                />
              </label>
              <label className="field">
                <span className="label">Reason</span>
                <input
                  type="text"
                  name="reason"
                  className="input"
                  defaultValue="Asked not to be contacted"
                />
              </label>
              <div>
                <button type="submit" className="btn btn-outline btn-sm">
                  Add to do-not-contact
                </button>
              </div>
            </form>
          </Card>

          <Card
            title="Delete this record"
            description="Removes it entirely. It may be found again by a future search unless you add it to do-not-contact first."
          >
            <form action={deleteProspectAction}>
              <input type="hidden" name="id" value={prospect.id} />
              <button type="submit" className="btn btn-outline btn-sm">
                Delete
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
