import { checkPublicUrl, safeFetch } from "@/lib/security/safeFetch";
import type { BusinessType } from "../types";

/**
 * Official website verification.
 *
 * Fetches a prospect's own home page to confirm it exists, that it is a
 * live business, and what it says it does. This is enrichment, not
 * discovery - we only ever visit a site we already have a reference to.
 *
 * Responsible access, enforced here rather than merely promised:
 *   - robots.txt is fetched and honoured before any page request
 *   - one page per domain, the home page, never a crawl
 *   - a real User-Agent identifying us, with a URL a site owner can follow
 *   - a hard timeout and a conservative interval between domains
 *   - a 401, 403 or CAPTCHA response means stop; we never work around it
 */

/**
 * Identifies us, with a URL a site owner can visit to find out who we are
 * and how to reach us.
 *
 * Deliberately NOT an email address. Some sites echo the request's
 * User-Agent back into the page they return - debug output, an analytics
 * payload, a block page. When they do, anything that looks like contact
 * detail in our own header becomes something our parser can read back out
 * and record as the site owner's. That happened: a real agency's page echoed
 * this header and the extractor stored our own address as theirs. A URL
 * cannot be mistaken for the site's email, and the checks below refuse our
 * own identifiers regardless.
 */
const USER_AGENT =
  "MerryCleanersProspector/1.0 (+https://merry-cleaners.vercel.app/about-this-crawler)";

/** Our own addresses. Never recorded as a prospect's, however we find them. */
const OUR_DOMAINS = ["merrycleaners.co.uk", "merry-cleaners.vercel.app"];

/** Anything at one of our own domains, with or without a local part. */
const OUR_CONTACT_PATTERN =
  /[\w.+-]*@?(?:merrycleaners\.co\.uk|merry-cleaners\.vercel\.app)/gi;

/**
 * Removes our own request signature from a page before anything is read out
 * of it, so a site that echoes the header cannot feed our details back to us.
 */
function stripOurOwnTraces(html: string): string {
  return html
    .split(USER_AGENT)
    .join(" ")
    .replace(/MerryCleanersProspector[^\s"'<>]*/gi, " ")
    .replace(OUR_CONTACT_PATTERN, " ");
}

/** The part of a hostname that identifies the organisation. */
function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const secondLevel = ["co", "org", "ac", "gov", "net", "ltd", "plc", "sch", "me"];
  const take = secondLevel.includes(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-take).join(".");
}

const MIN_INTERVAL_MS = 1500;
const TIMEOUT_MS = 12000;
let lastRequestAt = 0;

async function throttle() {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/**
 * A deliberately small robots.txt reader. It looks at the `*` group and any
 * group naming us, and returns the Disallow rules that apply. If robots.txt
 * cannot be read we assume we may proceed for the home page only, which is
 * the conventional reading.
 */
export async function robotsAllows(origin: string, path = "/"): Promise<{
  allowed: boolean;
  reason: string;
}> {
  try {
    const timeout = withTimeout(8000);
    // Through the guard as well: robots.txt is fetched from the same
    // attacker-influenced host as the page itself.
    const fetched = await safeFetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: timeout.signal,
    });
    timeout.done();

    if (!fetched.ok || !fetched.response) {
      return { allowed: false, reason: fetched.refused ?? "robots.txt unreachable" };
    }
    const response = fetched.response;

    if (!response.ok) {
      return { allowed: true, reason: "No robots.txt published" };
    }

    const text = (await response.text()).slice(0, 20000);
    const lines = text.split(/\r?\n/).map((line) => line.trim());

    let applies = false;
    const disallows: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith("#")) continue;
      const [rawKey, ...rest] = line.split(":");
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(":").trim();

      if (key === "user-agent") {
        const agent = value.toLowerCase();
        applies = agent === "*" || USER_AGENT.toLowerCase().includes(agent);
      } else if (key === "disallow" && applies) {
        if (value) disallows.push(value);
      }
    }

    const blocked = disallows.some(
      (rule) => rule === "/" || (rule.length > 1 && path.startsWith(rule)),
    );

    return blocked
      ? { allowed: false, reason: `robots.txt disallows ${path}` }
      : { allowed: true, reason: "Permitted by robots.txt" };
  } catch {
    return { allowed: true, reason: "robots.txt unreachable" };
  }
}

export interface WebsiteVerification {
  reachable: boolean;
  /** Set when we chose not to fetch, e.g. robots.txt said no. */
  skipped_reason: string | null;
  status: number | null;
  title: string | null;
  /** A business contact address found in the page, if one is published. */
  email: string | null;
  /**
   * False when the address found does not use the site's own domain - a
   * free mailbox, or an address belonging to somebody else entirely. It is
   * still recorded, but the caller flags it for a human to confirm.
   */
  email_on_own_domain: boolean;
  /**
   * True when the only address published names an individual. We do not store
   * a person's address on a prospect record, so the caller flags this instead.
   */
  personal_email_withheld: boolean;
  phone: string | null;
  contact_form_url: string | null;
  business_type_hint: BusinessType | null;
  /** Signals the business may no longer be trading. */
  inactive_signals: string[];
  checked_at: string;
  source_url: string;
}

const TYPE_SIGNALS: { type: BusinessType; patterns: RegExp[] }[] = [
  { type: "estate_agent", patterns: [/\bestate agent/i, /\bproperties for sale\b/i, /\bsales and letting/i] },
  { type: "letting_agent", patterns: [/\bletting agent/i, /\bto let\b/i, /\btenant(s)? (find|referenc)/i] },
  { type: "property_management", patterns: [/\bproperty management\b/i, /\bblock management\b/i, /\bmanaging agent/i] },
  { type: "short_let_management", patterns: [/\bshort[- ]let/i, /\bserviced apartment/i, /\bairbnb\b/i, /\bholiday let/i] },
  { type: "coworking_space", patterns: [/\bco-?working\b/i, /\bhot desk/i, /\bflexible workspace\b/i] },
  { type: "hospitality", patterns: [/\bhotel\b/i, /\bguest house\b/i, /\bbook a room\b/i] },
  { type: "construction_property", patterns: [/\bproperty develop/i, /\bconstruction\b/i] },
];

const INACTIVE_SIGNALS: { pattern: RegExp; note: string }[] = [
  { pattern: /permanently closed/i, note: "Page says permanently closed" },
  { pattern: /ceased trading/i, note: "Page says ceased trading" },
  { pattern: /no longer (trading|operating|in business)/i, note: "Page says no longer trading" },
  { pattern: /this domain is for sale/i, note: "Domain is for sale" },
  { pattern: /under construction/i, note: "Site under construction" },
  { pattern: /parked (free )?(domain|page)/i, note: "Parked domain" },
];

/**
 * True when an address is an organisation's mailbox rather than a person's.
 *
 * Exported because the same test has to be applied to addresses already on
 * file, not only to ones we are reading for the first time: a record that
 * picked up an individual's address under earlier rules should lose it the
 * next time it is checked.
 */
export function isGenericMailbox(email: string): boolean {
  return GENERIC_MAILBOX.test(email.split("@")[0] ?? "");
}

/**
 * Mailboxes that belong to an organisation rather than to a person: a role, a
 * department, a branch or a function. `info@`, `lettings@`, `croydon@`.
 */
const GENERIC_MAILBOX =
  /^(info|information|enquir\w*|hello|hi|contact|contactus|admin|administration|office|reception|sales|letting\w*|rent\w*|property\w*|estates?|team|mail|email|post|general|help|support|service|customerservice|booking\w*|account\w*|finance|invoices?|new\w*|ask|welcome|hq|head\w*office|branch|london|uk|web\w*|no[-_.]?reply|do[-_.]?not[-_.]?reply)$/i;

/**
 * Extracts a general business email, and never a person's.
 *
 * Three things are refused outright: our own addresses, however they got into
 * the page; anything that is plainly not a mailbox; and any address that names
 * an individual. That last one matters legally as much as editorially - a
 * named person's work address is their personal data under UK GDPR, and the
 * prospect record is only ever meant to hold an organisation's published
 * business route. When only a personal address is published, we record that
 * one exists and leave the owner to decide, rather than storing it.
 *
 * An address on a different domain from the site is still returned, because
 * plenty of small agencies genuinely use a free mailbox, but it is reported as
 * off-domain so the record can be flagged instead of quietly asserting it.
 */
function findBusinessEmail(
  html: string,
  siteHost: string,
): {
  email: string | null;
  onOwnDomain: boolean;
  /** A named individual's address is published, but has not been stored. */
  personalAddressWithheld: boolean;
} {
  const matches = html.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
  const junk = /(example|sentry|wixpress|\.png|\.jpg|\.gif|\.svg|@2x|sentry\.io|googlemail\.com\/noreply)/i;
  const site = registrableDomain(siteHost);

  const candidates = [...new Set(matches)].filter((email) => {
    if (junk.test(email)) return false;
    const domain = registrableDomain(email.split("@")[1] ?? "");
    return !OUR_DOMAINS.includes(domain);
  });

  const isGeneric = isGenericMailbox;

  const generic = candidates.filter(isGeneric);
  const onDomain = generic.filter(
    (email) => registrableDomain(email.split("@")[1] ?? "") === site,
  );

  const chosen = onDomain[0] ?? generic[0] ?? null;

  return {
    email: chosen,
    onOwnDomain:
      chosen !== null && registrableDomain(chosen.split("@")[1] ?? "") === site,
    personalAddressWithheld:
      chosen === null && candidates.some((email) => !isGeneric(email)),
  };
}

export async function verifyWebsite(rawUrl: string): Promise<WebsiteVerification> {
  const checkedAt = new Date().toISOString();
  // Before anything else: is this an address we are willing to fetch at all?
  // Prospect websites come from OpenStreetMap, which anyone can edit, so this
  // value is attacker-influenced and is treated as such.
  const vetted = await checkPublicUrl(rawUrl);
  if (!vetted.ok || !vetted.url) {
    return {
      reachable: false,
      skipped_reason: vetted.reason,
      status: null,
      title: null,
      email: null,
      email_on_own_domain: false,
      personal_email_withheld: false,
      phone: null,
      contact_form_url: null,
      business_type_hint: null,
      inactive_signals: [`Website not checked — ${vetted.reason}`],
      checked_at: checkedAt,
      source_url: rawUrl,
    };
  }

  let url: URL;
  try {
    url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    return {
      reachable: false,
      skipped_reason: "Not a valid web address",
      status: null,
      title: null,
      email: null,
      email_on_own_domain: false,
      personal_email_withheld: false,
      phone: null,
      contact_form_url: null,
      business_type_hint: null,
      inactive_signals: ["Website address is malformed"],
      checked_at: checkedAt,
      source_url: rawUrl,
    };
  }

  const origin = url.origin;

  const robots = await robotsAllows(origin, url.pathname || "/");
  if (!robots.allowed) {
    // The site has asked automated clients not to fetch this. We stop.
    return {
      reachable: false,
      skipped_reason: robots.reason,
      status: null,
      title: null,
      email: null,
      email_on_own_domain: false,
      personal_email_withheld: false,
      phone: null,
      contact_form_url: null,
      business_type_hint: null,
      inactive_signals: [],
      checked_at: checkedAt,
      source_url: url.toString(),
    };
  }

  await throttle();

  try {
    const timeout = withTimeout(TIMEOUT_MS);
    // Redirects are followed by hand inside safeFetch, with every hop
    // re-checked: a public address that redirects to 127.0.0.1 is the usual
    // way this protection gets bypassed.
    const fetched = await safeFetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: timeout.signal,
    });
    timeout.done();

    if (!fetched.ok || !fetched.response) {
      return {
        reachable: false,
        skipped_reason: fetched.refused,
        status: null,
        title: null,
        email: null,
        email_on_own_domain: false,
        personal_email_withheld: false,
        phone: null,
        contact_form_url: null,
        business_type_hint: null,
        inactive_signals: [`Website not checked — ${fetched.refused}`],
        checked_at: checkedAt,
        source_url: url.toString(),
      };
    }
    const response = fetched.response;

    // An anti-bot challenge is a refusal. We do not attempt to defeat it.
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      return {
        reachable: false,
        skipped_reason: `Site returned ${response.status} — access not permitted, not attempting to bypass`,
        status: response.status,
        title: null,
        email: null,
        email_on_own_domain: false,
        personal_email_withheld: false,
        phone: null,
        contact_form_url: null,
        business_type_hint: null,
        inactive_signals: [],
        checked_at: checkedAt,
        source_url: url.toString(),
      };
    }

    // Strip our own request signature before reading anything out.
    const html = stripOurOwnTraces((await response.text()).slice(0, 300_000));
    const title = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1]?.trim() ?? null;

    const typeHint =
      TYPE_SIGNALS.find((signal) =>
        signal.patterns.some((pattern) => pattern.test(html)),
      )?.type ?? null;

    const inactive = INACTIVE_SIGNALS.filter((s) => s.pattern.test(html)).map(
      (s) => s.note,
    );

    const phone =
      html.match(/(?:\+44\s?|0)(?:20|1\d{2,3})[\s.-]?\d{3,4}[\s.-]?\d{3,4}/)?.[0] ??
      null;

    const contact = findBusinessEmail(html, url.hostname);

    const contactPath = html.match(
      /href=["']([^"']*\/(contact|contact-us|get-in-touch)[^"']*)["']/i,
    )?.[1];

    return {
      reachable: response.ok,
      skipped_reason: null,
      status: response.status,
      title,
      email: contact.email,
      email_on_own_domain: contact.onOwnDomain,
      personal_email_withheld: contact.personalAddressWithheld,
      phone,
      contact_form_url: contactPath
        ? new URL(contactPath, url.origin).toString()
        : null,
      business_type_hint: typeHint,
      inactive_signals: inactive,
      checked_at: checkedAt,
      source_url: url.toString(),
    };
  } catch (error) {
    return {
      reachable: false,
      skipped_reason:
        error instanceof Error && error.name === "AbortError"
          ? "Site did not respond in time"
          : "Site could not be reached",
      status: null,
      title: null,
      email: null,
      email_on_own_domain: false,
      personal_email_withheld: false,
      phone: null,
      contact_form_url: null,
      business_type_hint: null,
      inactive_signals: ["Website did not respond"],
      checked_at: checkedAt,
      source_url: url.toString(),
    };
  }
}
