import Link from "next/link";
import { store } from "@/lib/db";
import { SERVICES } from "@/lib/content";
import { buildCopyPrompt } from "@/lib/marketing";
import { LEAD_SOURCES } from "@/lib/types";
import {
  Card,
  EmptyState,
  formatDateTime,
  Table,
} from "@/components/admin/ui";
import { generateCopyAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Marketing support.
 *
 * Deliberately limited to drafting copy and measuring channels. This
 * application does not harvest contact details from Google, Yell or
 * Checkatrade: doing so would breach those platforms' terms and, where the
 * data is personal, UK GDPR. The legitimate routes are set out below.
 */
export default async function MarketingPage() {
  const [leads, drafts] = await Promise.all([
    store.list("leads"),
    store.list("ad_drafts"),
  ]);

  const channels = LEAD_SOURCES.map((source) => {
    const forSource = leads.filter((lead) => lead.source === source);
    const booked = forSource.filter((lead) => lead.status === "booked");
    return {
      source,
      total: forSource.length,
      booked: booked.length,
      rate: forSource.length
        ? Math.round((booked.length / forSource.length) * 100)
        : 0,
      value: booked.reduce((sum, lead) => sum + (lead.quote_low ?? 0), 0),
    };
  })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

  const samplePrompt = buildCopyPrompt({
    channel: "google_ads",
    service_type: "end_of_tenancy",
    audience: "Estate and letting agents in London",
  });

  return (
    <div className="a-stack">
      <Card
        title="Which channels are working"
        description="Set the channel on every lead and this table tells you where to spend."
        bodyless
      >
        {channels.length === 0 ? (
          <div className="a-card-body">
            <EmptyState>No leads recorded yet.</EmptyState>
          </div>
        ) : (
          <Table
            headers={["Channel", "Leads", "Booked", "Conversion", "Value booked"]}
          >
            {channels.map((row) => (
              <tr key={row.source}>
                <td className="strong">{row.source.replace(/_/g, " ")}</td>
                <td className="num">{row.total}</td>
                <td className="num">{row.booked}</td>
                <td className="num">{row.rate}%</td>
                <td className="num">
                  {row.value ? `£${row.value.toLocaleString("en-GB")}` : "—"}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card
        title="Draft campaign copy"
        description="Produces ad and outreach copy in the brand's voice, using only claims the business can actually support."
      >
        <form action={generateCopyAction}>
          <div className="field-row">
            <label className="field" htmlFor="channel">
              <span className="label">Channel</span>
              <select id="channel" name="channel" className="select">
                <option value="google_ads">Google Ads</option>
                <option value="outreach_email">Estate agent outreach email</option>
                <option value="referral">Referral message</option>
              </select>
            </label>
            <label className="field" htmlFor="service-type">
              <span className="label">Service</span>
              <select id="service-type" name="service_type" className="select">
                {SERVICES.map((service) => (
                  <option key={service.type} value={service.type}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="audience">
              <span className="label">Audience</span>
              <input
                id="audience"
                name="audience"
                className="input"
                defaultValue="Estate and letting agents in London"
              />
            </label>
            <label className="field" htmlFor="notes">
              <span className="label">Anything specific to mention?</span>
              <input id="notes" name="notes" className="input" />
            </label>
          </div>
          <button type="submit" className="btn btn-primary btn-sm">
            Draft the copy
          </button>
        </form>
      </Card>

      <Card title="Saved drafts">
        {drafts.length === 0 ? (
          <EmptyState>No drafts yet.</EmptyState>
        ) : (
          <div className="a-log">
            {drafts
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((draft) => (
                <article className="a-log-item" key={draft.id}>
                  <div className="a-log-meta">
                    <span className="ch">{draft.channel.replace(/_/g, " ")}</span>
                    <span>{draft.audience}</span>
                    <span>{formatDateTime(draft.created_at)}</span>
                  </div>
                  <p className="a-log-subject">{draft.title}</p>
                  <pre className="a-pre" style={{ marginTop: "0.75rem" }}>
                    {draft.body}
                  </pre>
                </article>
              ))}
          </div>
        )}
      </Card>

      <Card
        title="How we generate leads, and how we do not"
        description="Worth being clear about, because it affects what is safe to build."
      >
        <div className="a-prose">
          <p>
            This system does not collect contact details from Google, Yell or
            Checkatrade. Scraping those sites breaches their terms of service,
            and harvesting personal data for unsolicited approaches is not
            permitted under UK GDPR and PECR. Losing a listing on the platforms
            that currently bring you work would cost more than any list is
            worth.
          </p>
          <p>
            What it does instead is on the{" "}
            <Link href="/admin/prospects" className="strong">
              Prospects
            </Link>{" "}
            tab: sources that permit automated access, every field recorded
            with where it came from, a permanent do-not-contact list, and no
            message sent without you approving it.
          </p>
          <p>
            <strong>The routes that do work, in order of likely return:</strong>
          </p>
          <ol>
            <li>
              <strong>Direct outreach to estate and letting agencies.</strong>{" "}
              Publicly listed office contact details, one properly written
              approach, offering a first job at short notice so they can judge
              the standard. The{" "}
              <Link href="/admin/prospects" className="strong">
                Prospects
              </Link>{" "}
              tab finds these agencies in public records and drafts the
              approach for you to read and send yourself — from the register,
              from OpenStreetMap and from a company&rsquo;s own website, none
              of which prohibits it.
            </li>
            <li>
              <strong>Google Ads on high-intent searches</strong> such as
              &ldquo;end of tenancy cleaning [area]&rdquo;, pointed at the
              matching service page, with a small daily budget and the channel
              logged on every lead so this table tells you what it returned.
            </li>
            <li>
              <strong>A referral incentive for existing clients.</strong> The
              cheapest acquisition you will find, and it compounds.
            </li>
            <li>
              <strong>Your Google Business Profile and reviews.</strong> Free,
              and the single strongest signal for local searches.
            </li>
            <li>
              <strong>Paid placement on Yell or Checkatrade</strong> where it is
              already producing work — measured here, so you can tell.
            </li>
          </ol>
        </div>
      </Card>

      <Card
        title="The prompt behind the copy"
        description="Paste this into any AI tool to get the same result without this application running."
      >
        <pre className="a-pre">{samplePrompt}</pre>
      </Card>
    </div>
  );
}
