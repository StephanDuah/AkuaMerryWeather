import { Card, EmptyState } from "@/components/admin/ui";
import { SCENARIOS, mockModeEnabled } from "@/lib/agent/simulator";
import { activeActor } from "@/lib/ai";
import { store } from "@/lib/db";
import { runSimulationAction, purgeSimulationAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Mock mode: rehearse a real customer conversation safely.
 *
 * The agent that answers here is the production agent. Only the outside
 * world is stubbed - with MOCK_MODE=true nothing can be emailed or messaged
 * to a real person, whatever is connected.
 */
export default async function SimulatorPage({
  searchParams,
}: PageProps<"/admin/simulator">) {
  const params = await searchParams;
  const ranId = typeof params.ran === "string" ? params.ran : null;
  const pricing = await store.getPricing();

  const lastRun = ranId
    ? SCENARIOS.find((scenario) => scenario.id === ranId) ?? null
    : null;

  // The transcript is read back from the communications log, so what is shown
  // is what the system actually recorded rather than a replayed copy.
  const recent = ranId
    ? (await store.list("communications"))
        .filter((entry) => entry.channel === "chat")
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(-16)
    : [];

  return (
    <div className="a-stack">
      <Card
        title="Mock mode"
        description="Run a scripted customer conversation through the real agent and see exactly what it does. Nothing is faked: the guardrails, knowledge base, pricing engine and booking rules are the live ones."
      >
        <ul className="a-connections">
          <li>
            <span>Engine answering</span>
            <span className="a-badge" data-tone="info">
              {activeActor()}
            </span>
          </li>
          <li>
            <span>Outbound messages blocked</span>
            <span
              className="a-badge"
              data-tone={mockModeEnabled() ? "good" : "warn"}
            >
              {mockModeEnabled() ? "MOCK_MODE on" : "MOCK_MODE off"}
            </span>
          </li>
          <li>
            <span>Rate card approved</span>
            <span
              className="a-badge"
              data-tone={pricing.approved ? "good" : "warn"}
            >
              {pricing.approved ? "yes, prices quoted" : "no, prices deferred"}
            </span>
          </li>
        </ul>

        {!mockModeEnabled() && (
          <p className="a-flag" style={{ marginTop: "1rem" }}>
            MOCK_MODE is off. Conversations still run safely, but if email or
            WhatsApp were connected a rehearsal could reach a real person. Set
            <strong> MOCK_MODE=true</strong> in your environment to block every
            outbound channel while you test.
          </p>
        )}

        <p className="a-note">
          Each run creates real records so you can see them in Leads and
          Escalations. Use <strong>Remove what this run created</strong>
          afterwards to clear them.
        </p>
      </Card>

      <Card
        title="Scenarios"
        description="Each of these exercises a different decision the agent has to get right."
        bodyless
      >
        <div className="a-card-body a-stack">
          {SCENARIOS.map((scenario) => (
            <div className="a-item" key={scenario.id}>
              <div className="a-log-meta">
                <span className="ch">{scenario.id.replace(/_/g, " ")}</span>
                {ranId === scenario.id && (
                  <span className="a-badge" data-tone="good">
                    just run
                  </span>
                )}
              </div>
              <h3>{scenario.title}</h3>
              <p className="a-item-detail">{scenario.description}</p>

              <div className="a-draft">
                <p className="cap">What the customer says</p>
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: "1.1rem",
                    fontSize: "var(--t-body)",
                    color: "var(--ink-body)",
                  }}
                >
                  {scenario.turns.map((turn) => (
                    <li key={turn} style={{ marginTop: "0.35rem" }}>
                      &ldquo;{turn}&rdquo;
                    </li>
                  ))}
                </ol>
                <p className="cap" style={{ marginTop: "1rem" }}>
                  What should happen
                </p>
                <p
                  style={{
                    fontSize: "var(--t-body)",
                    color: "var(--ink-body)",
                    margin: 0,
                  }}
                >
                  {scenario.expect}
                </p>
              </div>

              <form action={runSimulationAction} style={{ marginTop: "1rem" }}>
                <input type="hidden" name="scenario" value={scenario.id} />
                <button type="submit" className="btn btn-primary btn-sm">
                  Run this conversation
                </button>
              </form>
            </div>
          ))}
        </div>
      </Card>

      {lastRun && (
        <Card
          title={`Transcript — ${lastRun.title}`}
          description="Read back from the communications log, so this is what the system actually recorded."
          actions={
            <form action={purgeSimulationAction}>
              <button type="submit" className="a-danger">
                Remove what this run created
              </button>
            </form>
          }
        >
          {recent.length === 0 ? (
            <EmptyState>No transcript recorded.</EmptyState>
          ) : (
            <div className="a-log">
              {recent.map((entry) => (
                <div className="a-log-item" key={entry.id}>
                  <div className="a-log-meta">
                    <span className="ch">
                      {entry.direction === "inbound" ? "customer" : "agent"}
                    </span>
                  </div>
                  <p className="a-log-body">{entry.body}</p>
                </div>
              ))}
            </div>
          )}
          <p className="a-note">
            Now check <strong>Leads</strong> and <strong>Escalations</strong> —
            anything the agent captured or handed over will be waiting there.
          </p>
        </Card>
      )}
    </div>
  );
}
