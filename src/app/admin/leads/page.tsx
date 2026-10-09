import Link from "next/link";
import { store } from "@/lib/db";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/types";
import {
  Badge,
  Card,
  EmptyState,
  formatDateTime,
  money,
  Table,
} from "@/components/admin/ui";
import { updateLeadStatusAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  const params = await searchParams;
  const filter = typeof params.status === "string" ? params.status : "all";

  const all = (await store.list("leads")).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const leads =
    filter === "all" ? all : all.filter((lead) => lead.status === filter);

  const filters = [
    { value: "all", label: "All", count: all.length },
    ...LEAD_STATUSES.map((status) => ({
      value: status,
      label: status.replace(/_/g, " "),
      count: all.filter((lead) => lead.status === status).length,
    })),
  ];

  return (
    <div className="a-stack">
      <Card
        title="Leads and enquiries"
        description="Every enquiry, wherever it came from, with the channel recorded so you can see which advertising is paying for itself."
        bodyless
      >
        <nav className="a-filters" aria-label="Filter by status">
          {filters.map((item) => (
            <Link
              key={item.value}
              href={
                item.value === "all"
                  ? "/admin/leads"
                  : `/admin/leads?status=${item.value}`
              }
              data-active={filter === item.value}
            >
              {item.label} <span className="n">({item.count})</span>
            </Link>
          ))}
        </nav>

        {leads.length === 0 ? (
          <div className="a-card-body">
            <EmptyState>No leads with this status.</EmptyState>
          </div>
        ) : (
          <Table
            headers={[
              "Received",
              "Client",
              "Service",
              "Property",
              "Estimate",
              "Channel",
              "Status",
              "",
            ]}
          >
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td className="num">{formatDateTime(lead.created_at)}</td>
                <td>
                  <Link href={`/admin/leads/${lead.id}`} className="strong">
                    {lead.name ?? "Unnamed enquiry"}
                  </Link>
                  <span className="sub">
                    {lead.email ?? lead.phone ?? "No contact details"}
                  </span>
                  {lead.segment !== "unknown" && (
                    <span className="sub">{lead.segment.replace(/_/g, " ")}</span>
                  )}
                </td>
                <td>{lead.service_type?.replace(/_/g, " ") ?? "—"}</td>
                <td className="num">
                  {lead.postcode ?? "—"}
                  <span className="sub">
                    {lead.bedrooms !== null
                      ? `${lead.bedrooms} bed`
                      : lead.floor_area_sqft
                        ? `${lead.floor_area_sqft.toLocaleString("en-GB")} sq ft`
                        : ""}
                  </span>
                </td>
                <td className="num">
                  {lead.quote_low
                    ? `${money(lead.quote_low)} – ${money(lead.quote_high)}`
                    : "—"}
                </td>
                <td>{lead.source.replace(/_/g, " ")}</td>
                <td>
                  <Badge value={lead.status} />
                </td>
                <td>
                  <form action={updateLeadStatusAction} className="a-inline-form">
                    <input type="hidden" name="id" value={lead.id} />
                    <label className="sr-only" htmlFor={`status-${lead.id}`}>
                      Status for {lead.name ?? "this lead"}
                    </label>
                    <select
                      id={`status-${lead.id}`}
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
                    <button type="submit" className="btn btn-outline btn-sm">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Channels in use">
        <ul className="a-channel-list">
          {LEAD_SOURCES.map((source) => (
            <li key={source}>
              <span>{source.replace(/_/g, " ")}</span>
              <span className="n">
                {all.filter((lead) => lead.source === source).length}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
