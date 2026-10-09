import type { ZodError, ZodIssue } from "zod";

/**
 * Turning a validation failure into something a person can act on.
 *
 * Every public endpoint used to answer a bad submission with one sentence -
 * "Please check the details supplied." - which tells the customer that
 * something is wrong and nothing about what. They then have to guess, and
 * the commonest outcome is that they give up rather than hunt for it.
 *
 * Two things are needed to fix that, and both are here so that every form
 * behaves the same way.
 *
 * **Which field.** The response names each offending field by its form
 * control name, so the browser can put the message beside the right input
 * and move the cursor there.
 *
 * **In words the customer understands.** Zod's own messages are written for
 * developers: "String must contain at least 2 character(s)" beside a name
 * box is worse than nothing. Every message below is written as a person
 * would say it, and names the thing on screen rather than the field in the
 * database - "postcode", not "postcode_outward".
 */

/** What each field is called on screen, in the middle of a sentence. */
const FIELD_LABELS: Record<string, string> = {
  service_type: "the service",
  tier: "the type of clean",
  postcode: "the postcode",
  bedrooms: "the number of bedrooms",
  floor_area_sqft: "the floor area",
  addons: "the extras",
  name: "your name",
  customer_name: "your name",
  email: "your email address",
  phone: "your telephone number",
  address: "the address",
  date: "the date",
  slot: "the time of day",
  message: "your message",
  notes: "your notes",
  consent: "your consent",
  source: "where you heard about us",
  from: "the sender's email address",
  subject: "the subject",
  body: "the message",
};

/** Wording that beats anything generated from the schema. */
const FIELD_MESSAGES: Record<string, Partial<Record<string, string>>> = {
  postcode: {
    missing: "Please enter the postcode of the property.",
    invalid: "That does not look like a UK postcode. Something like SW4 7UR or E8 1EJ.",
  },
  email: {
    missing: "Please enter an email address, or give us a telephone number instead.",
    invalid: "That does not look like an email address — please check it.",
  },
  phone: {
    missing: "Please enter a telephone number, or give us an email address instead.",
    invalid: "Please check that telephone number — it looks too short or too long.",
  },
  bedrooms: {
    missing: "Please tell us how many bedrooms the property has. Enter 0 for a studio.",
    invalid: "Please enter the number of bedrooms as a whole number between 0 and 10.",
  },
  floor_area_sqft: {
    missing: "Please give us an approximate floor area in square feet.",
    invalid: "Please enter the floor area as a number of square feet.",
  },
  date: {
    missing: "Please choose a date.",
    invalid: "Please choose a date from the list rather than typing one.",
  },
  slot: {
    missing: "Please choose a morning, afternoon or evening slot.",
    invalid: "Please choose a morning, afternoon or evening slot.",
  },
  service_type: {
    missing: "Please choose which service you need.",
    invalid: "Please choose office, end of tenancy, or domestic cleaning.",
  },
  customer_name: {
    missing: "Please tell us your name.",
    invalid: "Please enter your full name.",
  },
  name: {
    missing: "Please tell us your name.",
    invalid: "Please enter your full name.",
  },
  address: {
    missing: "Please enter the address of the property.",
    invalid: "Please enter the full address, including the building number.",
  },
};

function labelFor(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

/**
 * True when the value was absent rather than present but wrong.
 *
 * The difference matters to the reader. An empty postcode box should say
 * "please enter the postcode"; a box containing "XYZ" should say it does not
 * look like a postcode. Telling someone their empty field is malformed sends
 * them looking for a typo that is not there.
 *
 * The submitted value settles it where we have it. A schema minimum is only
 * a fallback, because "at least 2 characters" cannot distinguish empty from
 * one character.
 */
function isMissing(issue: ZodIssue, submitted?: unknown): boolean {
  if (submitted !== undefined) {
    if (submitted === null) return true;
    if (typeof submitted === "string" && submitted.trim() === "") return true;
    if (Array.isArray(submitted) && submitted.length === 0) return true;
  }

  if (issue.code === "invalid_type") {
    const received = (issue as { received?: unknown }).received;
    return received === "undefined" || received === "null" || received === undefined;
  }
  return (
    issue.code === "too_small" &&
    (issue as { minimum?: number }).minimum !== undefined &&
    Number((issue as { minimum?: number }).minimum) <= 1
  );
}

/**
 * One sentence for one problem, written for the person filling in the form.
 */
function messageFor(field: string, issue: ZodIssue, submitted?: unknown): string {
  const overrides = FIELD_MESSAGES[field];
  const kind = isMissing(issue, submitted) ? "missing" : "invalid";
  if (overrides?.[kind]) return overrides[kind] as string;

  const label = labelFor(field);
  if (isMissing(issue, submitted)) {
    return `Please enter ${label}.`;
  }

  switch (issue.code) {
    case "too_small":
      return `${capitalise(label)} is too short.`;
    case "too_big":
      return `${capitalise(label)} is too long.`;
    case "invalid_format":
    case "invalid_value":
      return `Please check ${label}.`;
    default:
      return `Please check ${label}.`;
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface FieldErrors {
  /** Keyed by the form control's name, so the browser can place it. */
  fields: Record<string, string>;
  /** A summary for anyone who cannot see the inline messages. */
  message: string;
  /** Which field to move the cursor to. */
  focus: string | null;
}

/**
 * Converts a failed parse into per-field messages.
 *
 * Only the first problem per field is reported: showing a customer two
 * complaints about one box is noise, and fixing the first usually resolves
 * both.
 */
export function fieldErrorsFromZod(
  error: ZodError,
  /** What was actually submitted, so empty can be told from malformed. */
  submitted?: unknown,
): FieldErrors {
  const fields: Record<string, string> = {};
  const values =
    submitted && typeof submitted === "object"
      ? (submitted as Record<string, unknown>)
      : {};

  for (const issue of error.issues) {
    const field = issue.path.length ? String(issue.path[0]) : "form";
    if (fields[field]) continue;
    fields[field] = messageFor(field, issue, values[field]);
  }

  return {
    fields,
    message: summarise(fields),
    focus: Object.keys(fields)[0] ?? null,
  };
}

/** Builds the same feedback from field names we worked out ourselves. */
export function fieldErrors(
  entries: Record<string, string>,
): FieldErrors {
  return {
    fields: entries,
    message: summarise(entries),
    focus: Object.keys(entries)[0] ?? null,
  };
}

/**
 * Names the fields in the summary line.
 *
 * "Please check the postcode and your email address" is useful on its own,
 * which matters for a screen reader announcing the error and for anyone
 * whose browser has scrolled the offending box out of view.
 */
function summarise(fields: Record<string, string>): string {
  const names = Object.keys(fields);
  if (names.length === 0) return "Please check the details supplied.";
  if (names.length === 1) return fields[names[0]];

  const labels = names.map(labelFor);
  const list =
    labels.length === 2
      ? `${labels[0]} and ${labels[1]}`
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `Please check ${list}.`;
}

/** Maps the pricing engine's "missing" list onto form fields. */
export function fieldsFromMissing(missing: string[]): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const field of missing) {
    const overrides = FIELD_MESSAGES[field];
    entries[field] = overrides?.missing ?? `Please enter ${labelFor(field)}.`;
  }
  return entries;
}
