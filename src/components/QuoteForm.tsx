"use client";

import { useState } from "react";
import type { AddonPricing, ServiceType } from "@/lib/types";

/**
 * Quote and booking form.
 *
 * Three steps: an instant estimate, then contact details, then an optional
 * slot. The estimate is always labelled as subject to confirmation, and no
 * personal details are requested until the visitor has been given something
 * useful in return.
 *
 * The endpoints it posts to are unchanged: /api/quote, /api/leads,
 * /api/availability and /api/bookings.
 */

interface Props {
  addons: AddonPricing[];
  services: { value: ServiceType; label: string }[];
}

interface QuoteResponse {
  ok: boolean;
  reason?: string;
  low?: number;
  high?: number;
  service_label?: string;
  zone_label?: string;
  duration_hours?: number;
  disclaimer?: string;
  message?: string;
  vat_note?: string;
}

interface Slot {
  date: string;
  slot: string;
}

const SOURCES = [
  { value: "google", label: "Google" },
  { value: "yell", label: "Yell" },
  { value: "checkatrade", label: "Checkatrade" },
  { value: "referral", label: "A recommendation" },
  { value: "estate_agent", label: "Through an estate agent" },
  { value: "other", label: "Somewhere else" },
];

const SLOT_LABELS: Record<string, string> = {
  morning: "Morning, 08:00 - 12:00",
  afternoon: "Afternoon, 12:00 - 16:00",
  evening: "Evening, 16:00 - 20:00",
};

const STEPS = ["Estimate", "Your details", "Choose a date"];

export function QuoteForm({ addons, services }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Which box is wrong, and why. Keyed by the name the API uses, so a
   * message always lands beside the field that caused it rather than in a
   * single sentence at the top that leaves the visitor hunting.
   */
  const [invalid, setInvalid] = useState<Record<string, string>>({});

  const [serviceType, setServiceType] = useState<ServiceType>("end_of_tenancy");
  const [postcode, setPostcode] = useState("");
  const [bedrooms, setBedrooms] = useState("2");
  // Regular and deep cleans are priced very differently (£155 vs £395 for a
  // three-bedroom), so the customer chooses rather than the form assuming.
  const [tier, setTier] = useState<"regular" | "deep">("regular");
  const [sqft, setSqft] = useState("1500");
  const [chosenAddons, setChosenAddons] = useState<string[]>([]);

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [source, setSource] = useState("google");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const isOffice = serviceType === "office";
  const isDomestic = serviceType === "domestic";
  const relevantAddons = addons.filter((addon) =>
    addon.applies_to.includes(serviceType),
  );

  function toggleAddon(key: string) {
    setChosenAddons((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  /** The API's field names differ from the ids on the controls. */
  const CONTROL_ID: Record<string, string> = {
    service_type: "service",
    floor_area_sqft: "sqft",
    customer_name: "name",
    date: "preferred-date",
  };

  /**
   * Records the errors and moves the cursor to the first bad field.
   *
   * Focusing matters as much as the message: on a phone the offending box is
   * usually off screen, and a summary at the top tells you something is
   * wrong without taking you to it.
   */
  function showErrors(data: { message?: string; fields?: Record<string, string>; focus?: string | null }) {
    const fields = data.fields ?? {};
    setInvalid(fields);
    setError(data.message ?? "Please check the details supplied.");
    const first = data.focus ?? Object.keys(fields)[0];
    if (!first) return;
    const id = CONTROL_ID[first] ?? first;
    requestAnimationFrame(() => {
      const element = document.getElementById(id);
      if (element instanceof HTMLElement) {
        element.focus({ preventScroll: false });
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
  }

  /** Clears a field's error as soon as the visitor edits it. */
  function clearError(field: string) {
    setInvalid((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  /** The message for one field, or nothing. */
  function fieldError(field: string) {
    return invalid[field] ?? null;
  }

  async function getEstimate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInvalid({});
    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_type: serviceType,
          postcode,
          bedrooms: isOffice ? null : Number(bedrooms),
          tier: isDomestic ? tier : null,
          floor_area_sqft: isOffice ? Number(sqft) : null,
          addons: chosenAddons,
        }),
      });
      const data: QuoteResponse = await response.json();
      if (!data.ok && data.reason === "pricing_not_approved") {
        // We have everything we need; the team confirms the figure. Carry on
        // to collect contact details rather than dead-ending the visitor.
        setQuote(data);
        setStep(2);
        return;
      }
      if (!data.ok) {
        showErrors({
          message:
            data.message ??
            "We could not prepare an estimate from those details. Please call us and we will help directly.",
          fields: (data as { fields?: Record<string, string> }).fields,
          focus: (data as { focus?: string | null }).focus,
        });
        return;
      }
      setQuote(data);
      setStep(2);
    } catch {
      setError("Something went wrong. Please try again, or call us directly.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInvalid({});
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          address,
          postcode,
          bedrooms: isOffice ? null : Number(bedrooms),
          tier: isDomestic ? tier : null,
          floor_area_sqft: isOffice ? Number(sqft) : null,
          service_type: serviceType,
          addons: chosenAddons,
          preferred_date: preferredDate,
          source,
          message,
          marketing_consent: consent,
          property_type: isOffice ? "office" : undefined,
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        showErrors({
          message: data.message,
          fields: (data as { fields?: Record<string, string> }).fields,
          focus: (data as { focus?: string | null }).focus,
        });
        return;
      }
      setLeadId(data.lead_id ?? null);

      const availability = await fetch("/api/availability?days=14");
      const availabilityData = await availability.json();
      setSlots((availabilityData.slots ?? []).slice(0, 9));
      setStep(3);
    } catch {
      setError("Something went wrong. Please try again, or call us directly.");
    } finally {
      setBusy(false);
    }
  }

  async function book(slot: Slot) {
    setBusy(true);
    setError(null);
    setInvalid({});
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          customer_name: name,
          email,
          phone,
          address: address || "Address to be confirmed",
          postcode,
          service_type: serviceType,
          addons: chosenAddons,
          bedrooms: isOffice ? null : Number(bedrooms),
          tier: isDomestic ? tier : null,
          floor_area_sqft: isOffice ? Number(sqft) : null,
          date: slot.date,
          slot: slot.slot,
          notes: message,
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(
          data.message ?? "That slot could not be held. Please choose another.",
        );
        return;
      }
      setConfirmation(
        `Your clean is held for ${formatDate(slot.date)}, ${
          SLOT_LABELS[slot.slot] ?? slot.slot
        }. ${data.message}`,
      );
      setStep(4);
    } catch {
      setError("Something went wrong. Please try again, or call us directly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-panel">
      <ol className="steps">
        {STEPS.map((label, index) => (
          <li
            key={label}
            data-state={
              step > index + 1 ? "done" : step === index + 1 ? "current" : "todo"
            }
          >
            <span className="n">{String(index + 1).padStart(2, "0")}</span>
            {label}
          </li>
        ))}
      </ol>

      {error && (
        <p
          className="notice"
          data-tone={Object.keys(invalid).length > 0 ? "error" : undefined}
          role="alert"
        >
          {error}
        </p>
      )}

      {step === 1 && (
        <form onSubmit={getEstimate} noValidate>
          <label className="field" htmlFor="service">
            <span className="label">Which service do you need?</span>
            <select
              id="service"
              aria-invalid={Boolean(fieldError("service_type"))}
              aria-describedby={fieldError("service_type") ? "service-error" : undefined}
              className="select"
              value={serviceType}
              onChange={(event) => {
                setServiceType(event.target.value as ServiceType);
                setChosenAddons([]);
                clearError("service_type");
              }}
            >
              {services.map((service) => (
                <option key={service.value} value={service.value}>
                  {service.label}
                </option>
              ))}
            </select>
                      {fieldError("service_type") && (
              <span className="field-error" id="service-error" role="alert">
                {fieldError("service_type")}
              </span>
            )}
</label>

          <label className="field" htmlFor="postcode">
            <span className="label">Property postcode</span>
            <span className="hint">
              We serve Greater London only, and prices vary by area.
            </span>
            <input
              id="postcode"
              aria-invalid={Boolean(fieldError("postcode"))}
              aria-describedby={fieldError("postcode") ? "postcode-error" : undefined}
              className="input"
              required
              value={postcode}
              onChange={(event) => {
                  setPostcode(event.target.value);
                  clearError("postcode");
                }}
              placeholder="e.g. SW4 7UR"
              autoComplete="postal-code"
            />
                      {fieldError("postcode") && (
              <span className="field-error" id="postcode-error" role="alert">
                {fieldError("postcode")}
              </span>
            )}
</label>

          {isOffice ? (
            <label className="field" htmlFor="sqft">
              <span className="label">Approximate floor area</span>
              <span className="hint">In square feet. An estimate is fine.</span>
              <input
                id="sqft"
                aria-invalid={Boolean(fieldError("floor_area_sqft"))}
                aria-describedby={fieldError("floor_area_sqft") ? "sqft-error" : undefined}
                className="input"
                required
                type="number"
                min={100}
                step={50}
                value={sqft}
                onChange={(event) => {
                  setSqft(event.target.value);
                  clearError("floor_area_sqft");
                }}
              />
                        {fieldError("floor_area_sqft") && (
              <span className="field-error" id="sqft-error" role="alert">
                {fieldError("floor_area_sqft")}
              </span>
            )}
</label>
          ) : (
            <label className="field" htmlFor="bedrooms">
              <span className="label">Number of bedrooms</span>
              <span className="hint">Enter 0 for a studio.</span>
              <input
                id="bedrooms"
                aria-invalid={Boolean(fieldError("bedrooms"))}
                aria-describedby={fieldError("bedrooms") ? "bedrooms-error" : undefined}
                className="input"
                required
                type="number"
                min={0}
                max={10}
                value={bedrooms}
                onChange={(event) => {
                  setBedrooms(event.target.value);
                  clearError("bedrooms");
                }}
              />
                        {fieldError("bedrooms") && (
              <span className="field-error" id="bedrooms-error" role="alert">
                {fieldError("bedrooms")}
              </span>
            )}
</label>
          )}

          {isDomestic && (
            <fieldset
              className="field"
              style={{ border: 0, padding: 0, margin: "0 0 1.5rem" }}
            >
              <legend className="label" style={{ padding: 0 }}>
                Which kind of clean?
              </legend>
              <div className="checklist">
                <label className="check">
                  <input
                    type="radio"
                    name="tier"
                    checked={tier === "regular"}
                    onChange={() => setTier("regular")}
                  />
                  <span>
                    <span className="t">Regular clean</span>
                    <span className="d">
                      An ongoing weekly or fortnightly clean of your home.
                    </span>
                  </span>
                </label>
                <label className="check">
                  <input
                    type="radio"
                    name="tier"
                    checked={tier === "deep"}
                    onChange={() => setTier("deep")}
                  />
                  <span>
                    <span className="t">Deep clean</span>
                    <span className="d">
                      A thorough one-off clean, top to bottom.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          )}

          {relevantAddons.length > 0 && (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 1.5rem" }}>
              <legend className="label" style={{ padding: 0 }}>
                Would you like any extras?
              </legend>
              <div className="checklist">
                {relevantAddons.map((addon) => (
                  <label className="check" key={addon.key}>
                    <input
                      type="checkbox"
                      checked={chosenAddons.includes(addon.key)}
                      onChange={() => toggleAddon(addon.key)}
                    />
                    <span>
                      <span className="t">{addon.label}</span>
                      <span className="d">{addon.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? "Preparing your estimate" : "See my estimate"}
          </button>
        </form>
      )}

      {step === 2 && quote && (
        <>
          <div className="quote-result">
            {quote.ok ? (
              <>
                <p className="meta">
                  {quote.service_label} &middot; {quote.zone_label}
                </p>
                <p className="amount">
                  &pound;{quote.low} &ndash; &pound;{quote.high}
                </p>
                <p className="sub">
                  Approximately {quote.duration_hours} hours on site.{" "}
                  {quote.vat_note}
                </p>
                <p className="disclaimer">{quote.disclaimer}</p>
              </>
            ) : (
              <>
                <p className="meta">Your details are ready</p>
                <p
                  className="sub"
                  style={{ fontSize: "var(--t-body-lg)", marginTop: "0.5rem" }}
                >
                  {quote.message}
                </p>
                <p className="disclaimer">
                  Leave your details below and a member of our team will send
                  your price.
                </p>
              </>
            )}
          </div>

          <form onSubmit={submitDetails} noValidate>
            <div className="field-row">
              <label className="field" htmlFor="name">
                <span className="label">Your name</span>
                <input
                  id="name"
                aria-invalid={Boolean(fieldError("customer_name"))}
                aria-describedby={fieldError("customer_name") ? "name-error" : undefined}
                  className="input"
                  required
                  value={name}
                  onChange={(event) => {
                  setName(event.target.value);
                  clearError("customer_name");
                }}
                  autoComplete="name"
                />
                          {fieldError("customer_name") && (
              <span className="field-error" id="name-error" role="alert">
                {fieldError("customer_name")}
              </span>
            )}
</label>
              <label className="field" htmlFor="phone">
                <span className="label">Telephone</span>
                <input
                  id="phone"
                aria-invalid={Boolean(fieldError("phone"))}
                aria-describedby={fieldError("phone") ? "phone-error" : undefined}
                  className="input"
                  type="tel"
                  value={phone}
                  onChange={(event) => {
                  setPhone(event.target.value);
                  clearError("phone");
                }}
                  placeholder="07700 900000"
                  autoComplete="tel"
                />
                          {fieldError("phone") && (
              <span className="field-error" id="phone-error" role="alert">
                {fieldError("phone")}
              </span>
            )}
</label>
              <label className="field" htmlFor="email">
                <span className="label">Email address</span>
                <input
                  id="email"
                aria-invalid={Boolean(fieldError("email"))}
                aria-describedby={fieldError("email") ? "email-error" : undefined}
                  className="input"
                  type="email"
                  value={email}
                  onChange={(event) => {
                  setEmail(event.target.value);
                  clearError("email");
                }}
                  autoComplete="email"
                />
                          {fieldError("email") && (
              <span className="field-error" id="email-error" role="alert">
                {fieldError("email")}
              </span>
            )}
</label>
              <label className="field" htmlFor="preferred-date">
                <span className="label">Preferred date</span>
                <input
                  id="preferred-date"
                aria-invalid={Boolean(fieldError("date"))}
                aria-describedby={fieldError("date") ? "preferred-date-error" : undefined}
                  className="input"
                  type="date"
                  value={preferredDate}
                  onChange={(event) => {
                  setPreferredDate(event.target.value);
                  clearError("date");
                }}
                />
                          {fieldError("date") && (
              <span className="field-error" id="preferred-date-error" role="alert">
                {fieldError("date")}
              </span>
            )}
</label>
            </div>

            <label className="field" htmlFor="address">
              <span className="label">Property address</span>
              <span className="hint">
                Street and building only. We confirm access arrangements later.
              </span>
              <input
                id="address"
                aria-invalid={Boolean(fieldError("address"))}
                aria-describedby={fieldError("address") ? "address-error" : undefined}
                className="input"
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  clearError("address");
                }}
                autoComplete="street-address"
              />
                        {fieldError("address") && (
              <span className="field-error" id="address-error" role="alert">
                {fieldError("address")}
              </span>
            )}
</label>

            <label className="field" htmlFor="source">
              <span className="label">How did you hear about us?</span>
              <select
                id="source"
                className="select"
                value={source}
                onChange={(event) => setSource(event.target.value)}
              >
                {SOURCES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" htmlFor="message">
              <span className="label">Anything else we should know?</span>
              <textarea
                id="message"
                aria-invalid={Boolean(fieldError("message"))}
                aria-describedby={fieldError("message") ? "message-error" : undefined}
                className="textarea"
                rows={3}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  clearError("message");
                }}
              />
                        {fieldError("message") && (
              <span className="field-error" id="message-error" role="alert">
                {fieldError("message")}
              </span>
            )}
</label>

            <label className="consent" htmlFor="consent">
              <input
                id="consent"
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                I am happy for {`Merry Cleaners`} to contact me about this
                enquiry. We use your details only to prepare your quote and
                arrange your clean, and you may ask us to delete them at any
                time.
              </span>
            </label>

            <p
              style={{
                fontSize: "var(--t-small)",
                color: "var(--ink-meta)",
                margin: "1.25rem 0 1.5rem",
              }}
            >
              Please give either a telephone number or an email address so we
              can confirm your quote.
            </p>

            <button type="submit" disabled={busy} className="btn btn-primary">
              {busy ? "Sending" : "Send my enquiry"}
            </button>
          </form>
        </>
      )}

      {step === 3 && (
        <div className="stack">
          <p style={{ fontSize: "var(--t-body-lg)", color: "var(--ink-body)" }}>
            Thank you. Your enquiry has reached our team. If you would like to
            hold a date now, choose one of the slots below. We will confirm
            everything in writing, and the price is confirmed by our team before
            any work begins.
          </p>

          {slots.length === 0 ? (
            <p style={{ fontSize: "var(--t-body)", color: "var(--ink-meta)" }}>
              Our diary is fully committed for the dates we can see. A member of
              our team will contact you with the next available options.
            </p>
          ) : (
            <div className="slot-grid">
              {slots.map((slot) => (
                <button
                  key={`${slot.date}-${slot.slot}`}
                  type="button"
                  className="slot"
                  disabled={busy}
                  onClick={() => book(slot)}
                >
                  <span className="d">{formatDate(slot.date)}</span>
                  <span className="t">
                    {SLOT_LABELS[slot.slot] ?? slot.slot}
                  </span>
                </button>
              ))}
            </div>
          )}

          <p style={{ fontSize: "var(--t-small)", color: "var(--ink-meta)" }}>
            You are under no obligation to book now. If you would rather speak
            to someone first, we will call you.
          </p>
        </div>
      )}

      {step === 4 && confirmation && (
        <div className="stack">
          <h2 style={{ fontSize: "var(--t-h2)" }}>
            Thank you &mdash; your booking is held.
          </h2>
          <p style={{ fontSize: "var(--t-body-lg)", color: "var(--ink-body)" }}>
            {confirmation}
          </p>
          <p style={{ fontSize: "var(--t-body)", color: "var(--ink-meta)" }}>
            Our staff are DBS-checked, trained and fully insured, and the work
            is covered by our re-clean guarantee. If anything changes, simply
            reply to the confirmation we send you.
          </p>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
