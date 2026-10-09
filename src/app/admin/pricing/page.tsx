import { store } from "@/lib/db";
import { SERVICE_LABELS } from "@/lib/types";
import { Card, formatDateTime, Table } from "@/components/admin/ui";
import { formatGbp } from "@/lib/pricing";
import { savePricingAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * The pricing table the owner controls.
 *
 * Nothing here is hard-coded in the application: the quoting engine reads
 * exactly these values, so a change on this page changes what the website,
 * the assistant and the booking flow all quote.
 */
export default async function PricingPage() {
  const pricing = await store.getPricing();

  return (
    <form action={savePricingAction} className="a-stack">
      <Card
        title="Are these prices approved?"
        description="Until you approve them, the agent will not quote. It collects every detail, tells the customer a member of the team will confirm the figure, and raises an escalation with everything needed."
      >
        {!pricing.approved && (
          <p className="a-flag" style={{ marginBottom: "1rem" }}>
            <strong>Not approved.</strong> No price reaches a customer until
            you tick the box below and save.
          </p>
        )}

        <label className="check" htmlFor="pricing-approved">
          <input
            id="pricing-approved"
            type="checkbox"
            name="approved"
            defaultChecked={pricing.approved}
          />
          <span>
            <span className="t">
              I confirm these are Merry Cleaners&rsquo; real rates, and the
              agent may quote from them
            </span>
            <span className="d">
              This switches on quoting for the services marked{" "}
              <strong>ready to quote</strong> below, and only those. A service
              with no prices stays deferred however this box is set.
            </span>
          </span>
        </label>

        <div className="a-prose" style={{ marginTop: "1.25rem" }}>
          <p>
            <strong>What a customer is told right now:</strong>
          </p>
          <ul>
            {pricing.services.map((service) => {
              const example = service.tiers[0]?.price_by_bedrooms.find(
                (row) => row.bedrooms === 3,
              );
              return (
                <li key={service.service_type}>
                  <strong>{SERVICE_LABELS[service.service_type]}</strong> —{" "}
                  {pricing.approved && service.approved && example
                    ? `a 3-bedroom ${service.tiers[0].label.toLowerCase()} is quoted at exactly ${formatGbp(example.price)}.`
                    : pricing.approved && service.approved
                      ? "quoted from the figures below."
                      : "no price given; the enquiry is collected and sent to you."}
                </li>
              );
            })}
          </ul>
        </div>

        <p className="a-note">
          {pricing.approved
            ? `Approved ${formatDateTime(pricing.approved_at)}. Prices last edited ${formatDateTime(pricing.updated_at)}.`
            : `Prices last edited ${formatDateTime(pricing.updated_at)}.`}
        </p>
      </Card>

      {pricing.services.map((service) => (
        <Card
          key={service.service_type}
          title={SERVICE_LABELS[service.service_type]}
          actions={
            <span
              className="a-badge"
              data-tone={service.approved ? "good" : "warn"}
            >
              {service.approved ? "ready to quote" : "no prices yet"}
            </span>
          }
        >
          {!service.approved && service.unapproved_reason && (
            <p className="a-flag" style={{ marginBottom: "1rem" }}>
              {service.unapproved_reason}
            </p>
          )}

          {service.tiers.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <p className="a-note" style={{ marginTop: 0 }}>
                These are your published prices, used exactly as written. The
                figures further down are only a fallback for a property this
                list does not cover.
              </p>
              {service.tiers.map((tier) => (
                <div key={tier.key} style={{ marginTop: "1rem" }}>
                  <h3 style={{ fontSize: "1rem" }}>{tier.label}</h3>
                  <p className="a-item-detail" style={{ marginTop: "0.25rem" }}>
                    {tier.description} · {tier.frequency_note}
                  </p>
                  <Table headers={["Size", "Price", "Time on site", "Cleaners"]}>
                    {tier.price_by_bedrooms.map((row) => (
                      <tr key={row.bedrooms}>
                        <td className="strong">
                          {row.bedrooms} bedroom{row.bedrooms === 1 ? "" : "s"}
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            className="input"
                            name={`${service.service_type}_${tier.key}_${row.bedrooms}_price`}
                            defaultValue={row.price}
                            min={0}
                            step={1}
                            style={{ maxWidth: "8rem" }}
                          />
                        </td>
                        <td className="num">{row.hours} hrs</td>
                        <td className="num">{row.cleaners}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              ))}
            </div>
          )}

          <div className="field-row">
            <NumberField
              name={`${service.service_type}_base_price`}
              label="Base charge (£)"
              value={service.base_price}
              hint="Applied to every job of this type."
            />
            {service.service_type === "office" ? (
              <NumberField
                name={`${service.service_type}_per_1000_sqft`}
                label="Per 1,000 sq ft (£)"
                value={service.per_1000_sqft}
                hint="Scales with the size of the premises."
              />
            ) : (
              <NumberField
                name={`${service.service_type}_per_bedroom`}
                label="Per bedroom (£)"
                value={service.per_bedroom}
                hint="Scales with the size of the property."
              />
            )}
            <NumberField
              name={`${service.service_type}_minimum_price`}
              label="Minimum price (£)"
              value={service.minimum_price}
              hint="We never quote below this."
            />
            <NumberField
              name={`${service.service_type}_range_spread`}
              label="Range spread"
              value={service.range_spread}
              step={0.01}
              hint="0.12 shows the estimate as plus or minus 12%."
            />
            <NumberField
              name={`${service.service_type}_base_hours`}
              label="Base hours on site"
              value={service.base_hours}
              step={0.5}
            />
            <NumberField
              name={`${service.service_type}_hours_per_unit`}
              label="Extra hours per bedroom / 1,000 sq ft"
              value={service.hours_per_unit}
              step={0.25}
            />
          </div>
        </Card>
      ))}

      <Card
        title="Add-ons"
        description="Flat amounts are added to the job. Multipliers apply to the whole price, so 1.15 means fifteen per cent more."
      >
        <div className="field-row">
          {pricing.addons.map((addon) => (
            <NumberField
              key={addon.key}
              name={`addon_${addon.key}_amount`}
              label={`${addon.label} (${addon.mode === "flat" ? "£" : "multiplier"})`}
              value={addon.amount}
              step={addon.mode === "flat" ? 1 : 0.01}
              hint={addon.applies_to
                .map((type) => type.replace(/_/g, " "))
                .join(", ")}
            />
          ))}
        </div>
      </Card>

      <Card
        title="London zones"
        description="Postcodes match on the longest prefix, so SW1 wins over SW. Enter outward-code prefixes separated by commas."
      >
        {pricing.zones.map((zone) => (
          <div key={zone.key} className="field-row">
            <NumberField
              name={`zone_${zone.key}_multiplier`}
              label={`${zone.label} multiplier`}
              value={zone.multiplier}
              step={0.01}
            />
            <label className="field" htmlFor={`zone-${zone.key}`}>
              <span className="label">Postcode prefixes</span>
              <textarea
                id={`zone-${zone.key}`}
                name={`zone_${zone.key}_prefixes`}
                className="textarea"
                rows={2}
                defaultValue={zone.prefixes.join(", ")}
              />
            </label>
          </div>
        ))}

        <div className="field-row">
          <NumberField
            name="default_zone_multiplier"
            label="Multiplier for unmatched London postcodes"
            value={pricing.default_zone_multiplier}
            step={0.01}
            hint="Used when a London postcode matches no zone above. Those quotes are also flagged for you to check."
          />
          <label className="field" htmlFor="vat-note">
            <span className="label">VAT note shown with prices</span>
            <input
              id="vat-note"
              name="vat_note"
              className="input"
              defaultValue={pricing.vat_note}
            />
          </label>
        </div>
      </Card>

      <div className="a-sticky-save">
        <button type="submit" className="btn btn-primary">
          Save pricing
        </button>
      </div>
    </form>
  );
}

function NumberField({
  name,
  label,
  value,
  step = 1,
  hint,
}: {
  name: string;
  label: string;
  value: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="field" htmlFor={name}>
      <span className="label">{label}</span>
      {hint && <span className="hint">{hint}</span>}
      <input
        id={name}
        name={name}
        type="number"
        step={step}
        className="input"
        defaultValue={value}
      />
    </label>
  );
}
