import Link from "next/link";
import { listAgentActions } from "@/lib/agent/audit";
import { store } from "@/lib/db";
import {
  Card,
  EmptyState,
  formatDateTime,
  Table,
  Tile,
  Tiles,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * The AI activity log.
 *
 * Every tool the agent ran, newest first. This is what lets the owner answer
 * "why did it say that?" after the fact - which matters both for trust and
 * for UK GDPR accountability.
 *
 * Contact details are stripped from summaries before they are stored, so
 * this screen shows what the agent decided without duplicating personal data
 * that already lives on the lead record.
 */

const OUTCOME_TONE: Record<string, string> = {
  ok: "good",
  escalated: "warn",
  refused: "neutral",
  error: "crit",
};

export default async function ActivityPage({
  searchParams,
}: PageProps<"/admin/activity">) {
  const params = await searchParams;
  const filter = typeof params.outcome === "string" ? params.outcome : "all";

  const all = await listAgentActions(300);
  const actions =
    filter === "all" ? all : all.filter((action) => action.outcome === filter);

  const leads = await store.list("leads");
  const leadName = (id: string | null) =>
    id ? (leads.find((lead) => lead.id === id)?.name ?? "unnamed lead") : null;

  const escalated = all.filter((a) => a.outcome === "escalated").length;
  const errors = all.filter((a) => a.outcome === "error").length;
  const traces = new Set(all.map((a) => a.trace_id)).size;

  const counts = {
    all: all.length,
    ok: all.filter((a) => a.outcome === "ok").length,
    escalated,
    refused: all.filter((a) => a.outcome === "refused").length,
    error: errors,
  };

  return (
    <div className="a-stack">
      <Tiles>
        <Tile
          label="Actions recorded"
          value={all.length}
          hint="Most recent 300"
        />
        <Tile label="Conversations" value={traces} hint="Distinct traces" />
        <Tile
          label="Handed to a person"
          value={escalated}
          hint="Agent chose not to decide"
          tone={escalated ? "alert" : undefined}
        />
        <Tile
          label="Errors"
          value={errors}
          hint={errors ? "Investigate below" : "None"}
          tone={errors ? "alert" : "good"}
        />
      </Tiles>

      <Card
        title="What the AI has been doing"
        description="Every tool the agent ran, newest first. Contact details are stripped from these summaries — the customer's own record holds those."
        bodyless
      >
        <nav className="a-filters" aria-label="Filter by outcome">
          {(
            [
              ["all", "All"],
              ["ok", "Completed"],
              ["escalated", "Escalated"],
              ["refused", "Refused"],
              ["error", "Errors"],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value}
              href={
                value === "all"
                  ? "/admin/activity"
                  : `/admin/activity?outcome=${value}`
              }
              data-active={filter === value}
            >
              {label} <span className="n">({counts[value]})</span>
            </Link>
          ))}
        </nav>

        {actions.length === 0 ? (
          <div className="a-card-body">
            <EmptyState>
              Nothing recorded yet. The log fills as customers use the
              assistant — try a conversation in Mock mode.
            </EmptyState>
          </div>
        ) : (
          <Table
            headers={["When", "Tool", "What it did", "Outcome", "Lead", "Engine", "Took"]}
          >
            {actions.map((action) => (
              <tr key={action.id}>
                <td className="num">{formatDateTime(action.created_at)}</td>
                <td className="strong">{action.tool.replace(/_/g, " ")}</td>
                <td>
                  {action.summary || "—"}
                  {action.error && (
                    <span className="sub" style={{ color: "var(--crit-ink)" }}>
                      {action.error}
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className="a-badge"
                    data-tone={OUTCOME_TONE[action.outcome] ?? "neutral"}
                  >
                    {action.outcome}
                  </span>
                </td>
                <td>
                  {action.lead_id ? (
                    <Link
                      href={`/admin/leads/${action.lead_id}`}
                      className="strong"
                    >
                      {leadName(action.lead_id)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{action.actor}</td>
                <td className="num">
                  {action.duration_ms === null ? "—" : `${action.duration_ms}ms`}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="How to read this">
        <div className="a-prose">
          <p>
            <strong>Completed</strong> — the agent did what was asked and
            carried on.
          </p>
          <p>
            <strong>Escalated</strong> — it chose not to decide and handed the
            matter to you. A complaint, a payment question, an address outside
            London, or something it was not certain of. These are the system
            working correctly, not failing.
          </p>
          <p>
            <strong>Refused</strong> — a tool declined because the information
            was incomplete or outside the rules.
          </p>
          <p>
            <strong>Error</strong> — something went wrong. The customer was
            told a person would follow up, and an escalation was raised. Worth
            investigating if you see these.
          </p>
          <p>
            Actions taken during one conversation share a trace, so a run of
            rows with the same timestamp belongs to a single customer.
          </p>
        </div>
      </Card>
    </div>
  );
}
