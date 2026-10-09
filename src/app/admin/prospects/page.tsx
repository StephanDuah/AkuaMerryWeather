import Link from "next/link";
import { store } from "@/lib/db";
import {
  Card,
  EmptyState,
  formatDate,
  Table,
  Tile,
  Tiles,
} from "@/components/admin/ui";
import { BOROUGHS } from "@/lib/prospecting/boroughs";
import { listCampaigns } from "@/lib/prospecting/campaigns";
import { dailyProgress, DAILY_LIMIT } from "@/lib/prospecting/daily";
import { availableSources } from "@/lib/prospecting/pipeline";
import { buildOutcomes, buildReport } from "@/lib/prospecting/report";
import {
  BUSINESS_TYPE_LABELS,
  LEAD_STATUSES_FROM_PROSPECT,
  PROSPECT_STATUSES,
  SOURCE_LABELS,
  type BusinessType,
  type Prospect,
  type ProspectStatus,
  type Suppression,
} from "@/lib/prospecting/types";
import {
  importProspectsCsvAction,
  purgeTestProspectsAction,
  runCampaignAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Prospects.
 *
 * The one thing this screen has to get right is that nobody here is a
 * customer or a lead. These are organisations the system found in public
 * records and thinks Merry Cleaners could plausibly work for. None of them
 * has asked for anything. The counts at the top say so explicitly, and the
 * number of real leads is shown separately from the number of prospects so
 * the two can never be read as one figure.
 */

const PRIORITY_TONE: Record<string, string> = {
  high: "good",
  medium: "warn",
  low: "neutral",
};

const STATUS_TONE: Record<ProspectStatus, string> = {
  discovered: "neutral",
  needs_verification: "warn",
  verified: "info",
  potential_fit: "info",
  high_priority: "good",
  outreach_ready: "good",
  contacted: "info",
  responded: "good",
  interested: "good",
  qualified_lead: "good",
  quote_requested: "good",
  booking_opportunity: "good",
  customer: "good",
  not_suitable: "neutral",
  do_not_contact: "crit",
};

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function ProspectsPage({
  searchParams,
}: PageProps<"/admin/prospects">) {
  const params = await searchParams;
  const filters = {
    priority: one(params.priority),
    status: one(params.status),
    type: one(params.type),
    borough: one(params.borough),
    q: one(params.q).toLowerCase(),
    show: one(params.show) === "test" ? "test" : "real",
  };
  const result = one(params.result);
  const problem = one(params.problem);
  const rejected = one(params.rejected);

  const [all, report, campaigns, suppressions, outcomes, daily] = await Promise.all([
    store.list("prospects") as Promise<Prospect[]>,
    buildReport(),
    listCampaigns(),
    store.list("suppressions") as Promise<Suppression[]>,
    buildOutcomes(),
    dailyProgress(),
  ]);

  const sources = availableSources();
  const testCount = all.filter((p) => p.is_test).length;

  const pool = all.filter((p) => p.is_test === (filters.show === "test"));

  const prospects = pool
    .filter((p) => !filters.priority || p.qualification.priority === filters.priority)
    .filter((p) => !filters.status || p.status === filters.status)
    .filter((p) => !filters.type || p.business_type === filters.type)
    .filter((p) => !filters.borough || p.borough === filters.borough)
    .filter(
      (p) =>
        !filters.q ||
        p.company_name.toLowerCase().includes(filters.q) ||
        (p.postcode ?? "").toLowerCase().includes(filters.q) ||
        (p.website ?? "").toLowerCase().includes(filters.q),
    )
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      const byPriority =
        rank[a.qualification.priority] - rank[b.qualification.priority];
      if (byPriority !== 0) return byPriority;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, 300);

  // Types and boroughs actually present on file, so the filters only offer
  // choices that can return something.
  const typesPresent = [...new Set(pool.map((p) => p.business_type))].sort();
  const boroughsPresent = [
    ...new Set(pool.map((p) => p.borough).filter((b): b is string => Boolean(b))),
  ].sort();
  const statusesPresent = PROSPECT_STATUSES.filter((status) =>
    pool.some((p) => p.status === status),
  );

  const leadsFromProspecting = pool.filter((p) => p.lead_id !== null).length;
  const query = new URLSearchParams(
    Object.entries(filters).filter(([key, value]) => value && key !== "show"),
  ).toString();

  return (
    <div className="a-stack">
      <Tiles>
        <Tile
          label="Organisations on file"
          value={report.prospects_total}
          hint="Prospects, not leads"
        />
        <Tile
          label="Verified"
          value={report.verified}
          hint="Details and trading status checked"
        />
        <Tile
          label="Ready for an approach"
          value={report.outreach_ready}
          hint="Verified, contactable, high priority"
          tone={report.outreach_ready ? "good" : undefined}
        />
        <Tile
          label="Leads from prospecting"
          value={leadsFromProspecting}
          hint={
            leadsFromProspecting
              ? "Responded and became a lead"
              : "Nobody has responded yet"
          }
          href={leadsFromProspecting ? "/admin/leads" : undefined}
        />
      </Tiles>

      {result && (
        <p className="a-note" style={{ marginTop: 0 }}>
          {result}
        </p>
      )}
      {problem && <p className="a-flag">{problem}</p>}
      {rejected && (
        <p className="a-note" style={{ marginTop: 0 }}>
          Rows were rejected for these reasons: {rejected}
        </p>
      )}

      <Card title="What this list is">
        <div className="a-prose">
          <p>
            Every organisation below was found in a public record — the
            Companies House register, OpenStreetMap, a company&rsquo;s own
            website, or a list you imported. <strong>None of them has
            contacted Merry Cleaners.</strong> They are not leads and they are
            not counted as leads anywhere in this dashboard.
          </p>
          <p>
            A prospect only becomes a lead when it gets in touch. Open a
            record and use <strong>They got in touch</strong> at that point,
            which creates the lead properly and links the two together.
          </p>
          <p>
            Priority is worked out from named factors you can read on each
            record — what kind of organisation it is, whether it is inside
            Greater London, whether we could verify it, whether there is a
            published business contact route. No hidden scoring.
          </p>
        </div>
      </Card>

      <div className="a-cols">
        <Card
          title="Search for organisations"
          description="Pick a campaign and, if you want to work through London methodically, one borough at a time. Each run is deliberately small: the free sources ask us not to hammer them, and the system stops rather than pushing through a rate limit."
        >
          <form action={runCampaignAction} className="a-stack">
            <label className="field">
              <span className="label">Campaign</span>
              <span className="hint">
                What to look for. Edit these in the code or ask for a new one.
              </span>
              <select name="campaign_id" className="select" defaultValue={campaigns[0]?.id}>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="label">Borough</span>
              <span className="hint">
                Leave on &ldquo;anywhere in London&rdquo; for a broad sweep, or
                pick one and work down the list.
              </span>
              <select name="borough" className="select" defaultValue="">
                <option value="">Anywhere in London</option>
                {(["central", "inner", "outer"] as const).map((zone) => (
                  <optgroup key={zone} label={`${zone} London`}>
                    {BOROUGHS.filter((b) => b.zone === zone).map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="label">How many to look at</span>
              <span className="hint">Keep this low. 15 is a sensible run.</span>
              <input
                type="number"
                name="limit"
                className="input"
                min={1}
                max={50}
                defaultValue={15}
              />
            </label>

            <label className="check" style={{ marginBottom: "1.25rem" }}>
              <input type="checkbox" name="verify" />
              <span>
                <span className="t">Check each one as it is found</span>
                <span className="d">
                  Visits the company&rsquo;s own website, where its robots file
                  permits, to confirm the details and that it is still trading.
                  Slower, but the results are worth more.
                </span>
              </span>
            </label>

            <div>
              <button type="submit" className="btn btn-primary">
                Run the search
              </button>
            </div>
          </form>

          <ul className="a-connections" style={{ marginTop: "1.5rem" }}>
            {sources.map((source) => (
              <li key={source.id}>
                <span>
                  {source.label}
                  <span className="sub">{source.reliability} reliability</span>
                </span>
                <span
                  className="a-badge"
                  data-tone={source.available ? "good" : "warn"}
                  title={source.reason ?? undefined}
                >
                  {source.available ? "available" : "not set up"}
                </span>
              </li>
            ))}
          </ul>
          {sources.some((s) => !s.available) && (
            <p className="a-note">
              {sources
                .filter((s) => !s.available && s.reason)
                .map((s) => `${s.label}: ${s.reason}`)
                .join(" ")}
            </p>
          )}
        </Card>

        <div className="a-stack">
          <Card
            title="Import a list you already have"
            description="For directories whose terms forbid automated collection. Export or copy what you are entitled to, paste it here, and it is recorded as having come from you."
          >
            <form action={importProspectsCsvAction} className="a-stack">
              <label className="field">
                <span className="label">CSV</span>
                <span className="hint">
                  A header row, then one organisation per line. Company name is
                  the only column that must be there. Website, Email, Phone,
                  Postcode, Address and Type are all recognised.
                </span>
                <textarea
                  name="csv"
                  className="textarea"
                  rows={7}
                  placeholder={
                    "Company,Website,Phone,Postcode,Type\nExample Lettings Ltd,https://example.co.uk,020 7000 0000,N1 1AA,Letting agent"
                  }
                />
              </label>
              <label className="field">
                <span className="label">Where it came from</span>
                <span className="hint">
                  Recorded against every row, so you can always see the origin.
                </span>
                <input
                  type="text"
                  name="source_label"
                  className="input"
                  placeholder="e.g. My own contacts, exported 19 September"
                />
              </label>
              <div>
                <button type="submit" className="btn btn-outline">
                  Import
                </button>
              </div>
            </form>
            <p className="a-note">
              Anything outside Greater London is rejected with the reason
              stated. Schools, hospitals, clinics, nurseries and care homes are
              recorded as not suitable and no service is ever proposed for
              them.
            </p>
          </Card>

          <Card
            title="Do not contact"
            description="Permanent. Checked before every search and every import."
          >
            <p className="a-item-detail" style={{ marginTop: 0 }}>
              {suppressions.length === 0
                ? "Nothing on the list yet. Add an organisation the moment it asks not to be contacted."
                : `${suppressions.length} ${suppressions.length === 1 ? "entry" : "entries"}. Anything matching one is skipped before it reaches this list.`}
            </p>
            <Link href="/admin/prospects/suppressions" className="btn btn-outline btn-sm">
              Manage the list
            </Link>
          </Card>
        </div>
      </div>

      {campaigns.some((c) => c.last_run_at) && (
        <Card title="Recent runs" bodyless>
          <Table headers={["Campaign", "Last run", "What it found"]}>
            {campaigns
              .filter((c) => c.last_run_at)
              .sort((a, b) => (b.last_run_at ?? "").localeCompare(a.last_run_at ?? ""))
              .map((campaign) => (
                <tr key={campaign.id}>
                  <td className="strong">{campaign.name}</td>
                  <td className="num">{formatDate(campaign.last_run_at)}</td>
                  <td>{campaign.last_run_summary ?? "—"}</td>
                </tr>
              ))}
          </Table>
        </Card>
      )}

      <Card
        title={filters.show === "test" ? "Test data" : "Prospects"}
        description={
          filters.show === "test"
            ? "TEST DATA — NOT REAL PROSPECTS. These rows were created by the test suite and are kept apart from everything else."
            : "Highest priority first. Open any record to see where every detail came from."
        }
        actions={
          <a
            href={`/api/prospecting/export${filters.show === "test" ? "?test=1" : ""}`}
            className="btn btn-outline btn-sm"
          >
            Export CSV
          </a>
        }
        bodyless
      >
        <nav className="a-filters" aria-label="Filter prospects">
          <Link href="/admin/prospects" data-active={!query && filters.show === "real"}>
            All <span className="n">({pool.length})</span>
          </Link>
          {(["high", "medium", "low"] as const).map((priority) => (
            <Link
              key={priority}
              href={`/admin/prospects?priority=${priority}`}
              data-active={filters.priority === priority}
            >
              {priority} priority{" "}
              <span className="n">
                ({pool.filter((p) => p.qualification.priority === priority).length})
              </span>
            </Link>
          ))}
          <Link
            href="/admin/prospects?status=outreach_ready"
            data-active={filters.status === "outreach_ready"}
          >
            ready to approach{" "}
            <span className="n">
              ({pool.filter((p) => p.status === "outreach_ready").length})
            </span>
          </Link>
          <Link
            href="/admin/prospects?status=needs_verification"
            data-active={filters.status === "needs_verification"}
          >
            needs a look{" "}
            <span className="n">
              ({pool.filter((p) => p.status === "needs_verification").length})
            </span>
          </Link>
          {testCount > 0 && (
            <Link href="/admin/prospects?show=test" data-active={filters.show === "test"}>
              test data <span className="n">({testCount})</span>
            </Link>
          )}
        </nav>

        <div className="a-card-body">
          <form method="get" className="a-inline-form">
            {filters.show === "test" && <input type="hidden" name="show" value="test" />}
            <input
              type="search"
              name="q"
              className="input"
              placeholder="Name, postcode or website"
              defaultValue={one(params.q)}
              aria-label="Search prospects"
            />
            <select name="type" className="select" defaultValue={filters.type} aria-label="Business type">
              <option value="">Any type</option>
              {typesPresent.map((type) => (
                <option key={type} value={type}>
                  {BUSINESS_TYPE_LABELS[type as BusinessType]}
                </option>
              ))}
            </select>
            <select name="borough" className="select" defaultValue={filters.borough} aria-label="Borough">
              <option value="">Any borough</option>
              {boroughsPresent.map((borough) => (
                <option key={borough} value={borough}>
                  {borough}
                </option>
              ))}
            </select>
            <select name="status" className="select" defaultValue={filters.status} aria-label="Status">
              <option value="">Any status</option>
              {statusesPresent.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <select
              name="priority"
              className="select"
              defaultValue={filters.priority}
              aria-label="Priority"
            >
              <option value="">Any priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button type="submit" className="btn btn-outline btn-sm">
              Filter
            </button>
            {query && (
              <Link href="/admin/prospects" className="btn btn-outline btn-sm">
                Clear
              </Link>
            )}
          </form>
        </div>

        {prospects.length === 0 ? (
          <div className="a-card-body">
            <EmptyState>
              {pool.length === 0
                ? "Nothing on file yet. Run a search above, or import a list you already have."
                : "Nothing matches those filters."}
            </EmptyState>
          </div>
        ) : (
          <Table
            headers={[
              "Organisation",
              "Type",
              "Borough",
              "Priority",
              "Status",
              "Contact route",
              "Found",
              "",
            ]}
          >
            {prospects.map((prospect) => (
              <tr key={prospect.id}>
                <td>
                  <Link href={`/admin/prospects/${prospect.id}`} className="strong">
                    {prospect.company_name}
                  </Link>
                  {prospect.flags.length > 0 && (
                    <span className="sub">
                      {prospect.flags.length} flag
                      {prospect.flags.length === 1 ? "" : "s"} to look at
                    </span>
                  )}
                  {prospect.lead_id && (
                    <span className="sub">
                      <Link href={`/admin/leads/${prospect.lead_id}`}>
                        now a lead
                      </Link>
                    </span>
                  )}
                </td>
                <td>{BUSINESS_TYPE_LABELS[prospect.business_type]}</td>
                <td>{prospect.borough ?? "—"}</td>
                <td>
                  <span
                    className="a-badge"
                    data-tone={PRIORITY_TONE[prospect.qualification.priority]}
                  >
                    {prospect.qualification.priority}
                  </span>
                </td>
                <td>
                  <span className="a-badge" data-tone={STATUS_TONE[prospect.status]}>
                    {prospect.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td>
                  {prospect.email
                    ? "email"
                    : prospect.contact_form_url
                      ? "contact form"
                      : prospect.phone
                        ? "phone"
                        : "none on record"}
                </td>
                <td className="num">{formatDate(prospect.discovered_at)}</td>
                <td>
                  <Link
                    href={`/admin/prospects/${prospect.id}`}
                    className="btn btn-outline btn-sm"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {report.sources_used.length > 0 && (
        <Card
          title="Where these came from"
          description="Every record names its sources, and every field on a record names the one it came from."
          bodyless
        >
          <Table headers={["Source", "Records it contributed to"]}>
            {report.sources_used.map((source) => (
              <tr key={source.id}>
                <td className="strong">{SOURCE_LABELS[source.id]}</td>
                <td className="num">{source.count}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card title="The numbers, stated plainly">
        <div className="a-prose">
          {report.narrative.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>
            For the avoidance of doubt: {report.prospects_total} prospect
            {report.prospects_total === 1 ? "" : "s"} on file,{" "}
            {report.actual_leads} actual lead
            {report.actual_leads === 1 ? "" : "s"} from this channel. A prospect
            counts as a lead only once its status is one of{" "}
            {LEAD_STATUSES_FROM_PROSPECT.map((s) => s.replace(/_/g, " ")).join(
              ", ",
            )}
            .
          </p>
        </div>
      </Card>

      <Card
        title="The nightly run"
        description={`One campaign, one borough, up to ${DAILY_LIMIT} organisations, once a day at 06:00. It discovers and verifies — it cannot contact anybody. Coverage comes from working through London in rotation rather than from volume, which is also what keeps the free sources happy.`}
      >
        <dl className="a-kv a-kv-2">
          <div>
            <dt>Today</dt>
            <dd>
              {daily.today_campaign
                ? `${daily.today_campaign} — ${daily.today_borough}`
                : "No campaign is switched on"}
            </dd>
          </div>
          <div>
            <dt>Tomorrow</dt>
            <dd>{daily.tomorrow_borough ?? "—"}</dd>
          </div>
          <div>
            <dt>Position in the sweep</dt>
            <dd>
              {daily.boroughs_total
                ? `${daily.position} of ${daily.boroughs_total} boroughs`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Last run</dt>
            <dd>
              {daily.last_run_at ? formatDate(daily.last_run_at) : "Not yet run"}
              {daily.last_run_summary && (
                <span className="sub">{daily.last_run_summary}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>From scheduled runs</dt>
            <dd>
              {daily.prospects_from_campaigns} organisation
              {daily.prospects_from_campaigns === 1 ? "" : "s"} on file
            </dd>
          </div>
          <div>
            <dt>Approaches sent by the schedule</dt>
            <dd>None, ever. Every approach waits for you.</dd>
          </div>
        </dl>
        <p className="a-note">
          A full pass over London takes about a month, which is roughly how
          often these public records change. If a source asks us to slow down,
          the run stops for the night rather than pushing through.
        </p>
      </Card>

      <Card
        title="What is actually working"
        description="Response by audience, from what you have recorded. Approaches and replies are counted separately, and a response rate only appears once an audience reaches ten approaches — a percentage of three would tell you nothing."
        bodyless
      >
        <div className="a-card-body">
          <div className="a-prose">
            {outcomes.narrative.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        {outcomes.rows.length > 0 && (
          <Table
            headers={[
              "Audience",
              "On file",
              "Approached",
              "Replied",
              "Booked",
              "Response rate",
            ]}
          >
            {outcomes.rows.map((row) => (
              <tr key={row.type}>
                <td className="strong">{row.label}</td>
                <td className="num">{row.prospects}</td>
                <td className="num">{row.approached}</td>
                <td className="num">{row.leads}</td>
                <td className="num">{row.booked}</td>
                <td className="num">
                  {row.response_rate === null ? (
                    <span className="sub">not enough data</span>
                  ) : (
                    `${row.response_rate}%`
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {testCount > 0 && (
        <Card
          title="Test data on file"
          description={`${testCount} record${testCount === 1 ? "" : "s"} created by the test suite. They are excluded from every count above and from every search, but they can be removed for good.`}
        >
          <form action={purgeTestProspectsAction}>
            <input type="hidden" name="from" value="/admin/prospects" />
            <button type="submit" className="btn btn-outline btn-sm">
              Remove all test records
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}
