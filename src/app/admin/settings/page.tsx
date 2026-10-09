import { store } from "@/lib/db";
import { findExpiredLeads } from "@/lib/retention";
import { aiConfigured } from "@/lib/chat/engine";
import { emailConfigured } from "@/lib/email/send";
import { Card, formatDateTime } from "@/components/admin/ui";
import {
  resetDemoDataAction,
  runFollowUpsAction,
  runRetentionAction,
  saveSettingsAction,
  simulateInboundEmailAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, expiring] = await Promise.all([
    store.getSettings(),
    findExpiredLeads(),
  ]);

  return (
    <div className="a-stack">
      <form action={saveSettingsAction} className="a-stack">
        <Card
          title="How email is handled"
          description="The safe default is to draft replies and hold them for your approval. Turn automatic sending on only once you are confident in the drafts you have seen."
        >
          <label className="check" htmlFor="email-auto-send">
            <input
              id="email-auto-send"
              type="checkbox"
              name="email_auto_send"
              defaultChecked={settings.email_auto_send}
            />
            <span>
              <span className="t">Send routine replies automatically</span>
              <span className="d">
                Complaints, payment questions, refunds and anything the system
                is unsure about are always held for you, whatever this is set
                to.
              </span>
            </span>
          </label>

          {!aiConfigured() && (
            <p className="a-note">
              No Anthropic API key is configured, so drafts currently use the
              written holding reply rather than a composed one.
            </p>
          )}
          {!emailConfigured() && (
            <p className="a-note">
              No email provider is connected, so approved messages are recorded
              in the lead history rather than delivered.
            </p>
          )}
        </Card>

        <Card
          title="Follow-up cadence"
          description="Two nudges, then we stop. A premium brand does not chase."
        >
          <div className="field-row">
            <NumberField
              name="followup_1_minutes"
              label="First follow-up (minutes after the enquiry)"
              value={settings.followup_1_minutes}
            />
            <NumberField
              name="followup_2_hours"
              label="Second follow-up (hours after the first)"
              value={settings.followup_2_hours}
            />
          </div>
        </Card>

        <Card
          title="Diary capacity"
          description="How many jobs your teams can take in a single slot. Slots disappear once they are full."
        >
          <div className="field-row">
            <NumberField
              name="capacity_per_slot"
              label="Teams available per slot"
              value={settings.capacity_per_slot}
            />
            <label className="field" htmlFor="business-hours">
              <span className="label">Working hours shown to clients</span>
              <input
                id="business-hours"
                name="business_hours"
                className="input"
                defaultValue={settings.business_hours}
              />
            </label>
          </div>
        </Card>

        <Card
          title="Data retention"
          description="How long an enquiry is kept after the last contact. Required by UK GDPR: data should not be kept longer than it is needed."
        >
          <div className="field-row">
            <NumberField
              name="retention_months"
              label="Keep records for (months)"
              value={settings.retention_months}
            />
          </div>
          <p className="a-note">Last saved {formatDateTime(settings.updated_at)}.</p>
        </Card>

        <div className="a-sticky-save">
          <button type="submit" className="btn btn-primary">
            Save settings
          </button>
        </div>
      </form>

      <Card
        title="Data protection tools"
        description={`${expiring.length} record(s) are currently older than your retention period.`}
      >
        <form action={runRetentionAction}>
          <button type="submit" className="btn btn-outline btn-sm">
            Delete records past the retention period
          </button>
        </form>
        <p className="a-note">
          This permanently removes those enquiries and everything attached to
          them. To delete one specific person on request, open their record and
          use the delete control there.
        </p>
      </Card>

      <Card
        title="Try the email handling"
        description="Paste in a message as if a customer had sent it. The system will categorise it, draft a reply and place it in the escalations inbox."
      >
        <form action={simulateInboundEmailAction}>
          <div className="field-row">
            <label className="field" htmlFor="sim-from">
              <span className="label">From</span>
              <input
                id="sim-from"
                name="from"
                className="input"
                defaultValue="prospect@example.com"
              />
            </label>
            <label className="field" htmlFor="sim-name">
              <span className="label">Name</span>
              <input
                id="sim-name"
                name="from_name"
                className="input"
                defaultValue="Alex Mensah"
              />
            </label>
          </div>
          <label className="field" htmlFor="sim-subject">
            <span className="label">Subject</span>
            <input
              id="sim-subject"
              name="subject"
              className="input"
              defaultValue="End of tenancy quote for a 2 bed in SW4"
            />
          </label>
          <label className="field" htmlFor="sim-body">
            <span className="label">Message</span>
            <textarea
              id="sim-body"
              name="body"
              className="textarea"
              rows={5}
              defaultValue="Good afternoon, we manage a two bedroom flat in Clapham and need an end of tenancy clean before a check-in next week. Could you let me know your availability and roughly what it would cost? Kind regards, Alex"
            />
          </label>
          <button type="submit" className="btn btn-outline btn-sm">
            Process this email
          </button>
        </form>
      </Card>

      <Card
        title="Follow-up sweep"
        description="Normally run by a scheduler. Use this to see it work immediately."
      >
        <form action={runFollowUpsAction}>
          <button type="submit" className="btn btn-outline btn-sm">
            Run now
          </button>
        </form>
      </Card>

      {store.driver === "json" && (
        <Card
          title="Demonstration data"
          description="While running on the local file store, you can reset everything back to the sample records."
        >
          <form action={resetDemoDataAction}>
            <button type="submit" className="a-danger">
              Reset all data
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}

function NumberField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number;
}) {
  return (
    <label className="field" htmlFor={name}>
      <span className="label">{label}</span>
      <input
        id={name}
        name={name}
        type="number"
        className="input"
        defaultValue={value}
      />
    </label>
  );
}
