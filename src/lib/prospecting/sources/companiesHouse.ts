import { boroughForPostcode } from "../boroughs";
import type {
  BusinessType,
  ProspectCandidate,
  SourceAdapter,
} from "../types";

/**
 * Companies House — the official UK company register.
 *
 * The most authoritative source available, and free: an API key requires
 * registration but no payment and no card. Until a key is supplied this
 * adapter reports itself unavailable rather than pretending to work.
 *
 * Get a key: https://developer.company-information.service.gov.uk
 * Then set COMPANIES_HOUSE_API_KEY.
 *
 * Rate limit: 600 requests per five minutes. We stay far below that.
 */

const BASE = "https://api.company-information.service.gov.uk";
const MIN_INTERVAL_MS = 600;
let lastRequestAt = 0;

/**
 * Search terms per organisation type. Companies House search is textual,
 * so these are deliberately specific to avoid dragging in unrelated firms.
 */
const SEARCH_TERMS: Partial<Record<BusinessType, string[]>> = {
  estate_agent: ["estate agents", "estates limited"],
  letting_agent: ["lettings limited", "letting agents"],
  property_management: ["property management", "block management"],
  short_let_management: ["serviced accommodation", "short let management"],
  landlord_operator: ["property holdings", "property investments"],
  construction_property: ["property developments"],
};

/** SIC codes that confirm what a company actually does. */
const SIC_TO_TYPE: Record<string, BusinessType> = {
  "68310": "estate_agent", // Real estate agencies
  "68320": "property_management", // Management of real estate on a fee basis
  "68209": "landlord_operator", // Other letting of own property
  "68201": "landlord_operator", // Renting of housing association property
  "68100": "landlord_operator", // Buying and selling own real estate
  "55100": "hospitality", // Hotels
  "55201": "short_let_management", // Holiday centres and villages
  "55209": "short_let_management", // Other holiday and short-stay accommodation
  "41100": "construction_property", // Development of building projects
  "82990": "commercial_office",
};

async function throttle() {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

function authHeader(): string {
  const key = process.env.COMPANIES_HOUSE_API_KEY ?? "";
  // Companies House uses HTTP Basic with the key as the username.
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

interface CHAddress {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  postal_code?: string;
  region?: string;
}

interface CHSearchItem {
  company_number?: string;
  title?: string;
  company_status?: string;
  address?: CHAddress;
  address_snippet?: string;
}

function formatAddress(address?: CHAddress, snippet?: string): string | null {
  if (snippet) return snippet;
  if (!address) return null;
  return (
    [
      address.address_line_1,
      address.address_line_2,
      address.locality,
      address.region,
    ]
      .filter(Boolean)
      .join(", ") || null
  );
}

export const companiesHouseAdapter: SourceAdapter = {
  id: "companies_house",
  label: "Companies House",
  reliability: "very_high",

  available() {
    return Boolean(process.env.COMPANIES_HOUSE_API_KEY);
  },

  unavailableReason() {
    if (this.available()) return null;
    return "No API key. Register free at developer.company-information.service.gov.uk (no payment required) and set COMPANIES_HOUSE_API_KEY.";
  },

  async search({ businessTypes, borough, limit }) {
    if (!this.available()) return [];

    const terms = [
      ...new Set(businessTypes.flatMap((type) => SEARCH_TERMS[type] ?? [])),
    ];
    if (terms.length === 0) return [];

    const now = new Date().toISOString();
    const candidates: ProspectCandidate[] = [];
    const seen = new Set<string>();
    const perTerm = Math.max(5, Math.ceil(limit / terms.length));

    for (const term of terms) {
      if (candidates.length >= limit) break;
      await throttle();

      const query = borough ? `${term} ${borough}` : `${term} London`;
      const url = `${BASE}/search/companies?q=${encodeURIComponent(query)}&items_per_page=${Math.min(perTerm * 2, 50)}`;

      const response = await fetch(url, {
        headers: { Authorization: authHeader(), Accept: "application/json" },
      });

      if (response.status === 429) {
        throw new Error(
          "Companies House rate limit reached. Stopping this run rather than retrying.",
        );
      }
      if (response.status === 401) {
        throw new Error("Companies House rejected the API key.");
      }
      if (!response.ok) continue;

      const data = (await response.json()) as { items?: CHSearchItem[] };

      for (const item of data.items ?? []) {
        const number = item.company_number;
        const name = item.title?.trim();
        if (!number || !name || seen.has(number)) continue;
        seen.add(number);

        const postcode = item.address?.postal_code ?? null;
        const resolvedBorough = postcode ? boroughForPostcode(postcode) : null;
        const flags: string[] = [];

        // London only. A company registered elsewhere is not a prospect.
        if (postcode && !resolvedBorough) continue;
        if (!postcode) flags.push("No postcode on the register entry");

        const status = item.company_status ?? null;
        if (status && status !== "active") {
          flags.push(`Companies House status: ${status}`);
        }

        candidates.push({
          company_name: name,
          website: null, // The register does not hold websites.
          business_type_hint: null, // Resolved from SIC codes during enrichment.
          address: formatAddress(item.address, item.address_snippet),
          postcode,
          borough: resolvedBorough,
          email: null,
          phone: null,
          companies_house_number: number,
          companies_house_status: status,
          source: "companies_house",
          source_url: `https://find-and-update.company-information.service.gov.uk/company/${number}`,
          discovered_at: now,
          flags,
        });

        if (candidates.length >= limit) break;
      }
    }

    return candidates;
  },
};

/**
 * Confirms a company on the official register and returns what it says.
 * Used to verify prospects discovered from less authoritative sources.
 */
export async function verifyWithCompaniesHouse(companyNumber: string): Promise<{
  found: boolean;
  name?: string;
  status?: string;
  sic_codes?: string[];
  business_type?: BusinessType | null;
  address?: string | null;
  postcode?: string | null;
  source_url: string;
} | null> {
  if (!companiesHouseAdapter.available()) return null;
  await throttle();

  const response = await fetch(`${BASE}/company/${encodeURIComponent(companyNumber)}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });

  const sourceUrl = `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`;
  if (response.status === 404) return { found: false, source_url: sourceUrl };
  if (!response.ok) return null;

  const data = (await response.json()) as {
    company_name?: string;
    company_status?: string;
    sic_codes?: string[];
    registered_office_address?: CHAddress;
  };

  const sic = data.sic_codes ?? [];
  const matched = sic.map((code) => SIC_TO_TYPE[code]).find(Boolean) ?? null;

  return {
    found: true,
    name: data.company_name,
    status: data.company_status,
    sic_codes: sic,
    business_type: matched,
    address: formatAddress(data.registered_office_address),
    postcode: data.registered_office_address?.postal_code ?? null,
    source_url: sourceUrl,
  };
}
