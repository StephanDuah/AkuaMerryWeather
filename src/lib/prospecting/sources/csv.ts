import { boroughForPostcode } from "../boroughs";
import type { BusinessType, ProspectCandidate, SourceAdapter } from "../types";

/**
 * Manual CSV import.
 *
 * This adapter exists because several credible directories - Yell and
 * Checkatrade among them - prohibit automated extraction in their terms.
 * Rather than circumvent that, the owner can gather a permitted list by
 * hand or export it from a service they pay for, and import it here. The
 * rest of the pipeline then treats those rows exactly like any other
 * candidate: deduplicated, classified, verified and qualified.
 *
 * That is what keeps the system useful even where scraping is not allowed.
 */

export interface CsvParseResult {
  candidates: ProspectCandidate[];
  skipped: { row: number; reason: string }[];
  headers: string[];
}

/** Column names we recognise, in the forms people actually use. */
const COLUMN_ALIASES: Record<string, string[]> = {
  company_name: ["company", "company name", "name", "business", "business name", "organisation"],
  website: ["website", "url", "web", "site", "web address"],
  email: ["email", "e-mail", "email address", "contact email"],
  phone: ["phone", "telephone", "tel", "phone number", "contact number"],
  address: ["address", "street", "address line 1", "full address"],
  postcode: ["postcode", "post code", "zip", "postal code"],
  business_type: ["type", "business type", "category", "sector"],
  companies_house_number: ["company number", "companies house", "crn", "registration number"],
  notes: ["notes", "note", "comment", "comments"],
};

const TYPE_WORDS: { type: BusinessType; words: string[] }[] = [
  { type: "estate_agent", words: ["estate agent", "estate agency", "estates"] },
  { type: "letting_agent", words: ["letting", "lettings"] },
  { type: "property_management", words: ["property management", "block management", "managing agent"] },
  { type: "short_let_management", words: ["short let", "serviced", "airbnb", "holiday let"] },
  { type: "commercial_office", words: ["office", "professional services", "consultancy"] },
  { type: "coworking_space", words: ["coworking", "co-working", "workspace"] },
  { type: "hospitality", words: ["hotel", "hospitality", "guest house"] },
  { type: "restaurant", words: ["restaurant", "cafe", "bar"] },
  { type: "retail", words: ["retail", "shop", "store"] },
  { type: "landlord_operator", words: ["landlord", "property holdings", "investments"] },
  { type: "construction_property", words: ["construction", "developer", "developments"] },
];

/** A small RFC-4180-ish parser: handles quoted fields and embedded commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function mapHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((header, index) => {
    const clean = header.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (map[field] === undefined && aliases.includes(clean)) {
        map[field] = index;
      }
    }
  });
  return map;
}

function guessType(text: string): BusinessType | null {
  const lower = text.toLowerCase();
  for (const entry of TYPE_WORDS) {
    if (entry.words.some((word) => lower.includes(word))) return entry.type;
  }
  return null;
}

/**
 * Turns an uploaded CSV into candidates. Rows without a company name, or
 * with a postcode outside London, are skipped with a stated reason rather
 * than silently dropped.
 */
export function parseProspectCsv(
  text: string,
  options: { sourceLabel?: string; markAsTest?: boolean } = {},
): CsvParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { candidates: [], skipped: [], headers: rows[0] ?? [] };
  }

  const headers = rows[0].map((h) => h.trim());
  const map = mapHeaders(headers);
  const now = new Date().toISOString();

  const candidates: ProspectCandidate[] = [];
  const skipped: { row: number; reason: string }[] = [];

  if (map.company_name === undefined) {
    return {
      candidates: [],
      skipped: [{ row: 1, reason: "No recognisable company-name column" }],
      headers,
    };
  }

  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const get = (field: string) => {
      const index = map[field];
      return index === undefined ? null : (cells[index] ?? "").trim() || null;
    };

    const name = get("company_name");
    if (!name) {
      skipped.push({ row: i + 1, reason: "No company name" });
      continue;
    }

    const postcode = get("postcode");
    const borough = postcode ? boroughForPostcode(postcode) : null;
    const flags: string[] = [];

    if (postcode && !borough) {
      skipped.push({ row: i + 1, reason: `Postcode ${postcode} is not in Greater London` });
      continue;
    }
    if (!postcode) flags.push("No postcode supplied in the import");

    const typeText = [get("business_type"), name].filter(Boolean).join(" ");

    candidates.push({
      company_name: name,
      website: get("website"),
      business_type_hint: guessType(typeText),
      address: get("address"),
      postcode,
      borough,
      email: get("email"),
      phone: get("phone"),
      companies_house_number: get("companies_house_number"),
      companies_house_status: null,
      source: "manual_csv",
      source_url: options.sourceLabel ?? null,
      discovered_at: now,
      flags,
    });
  }

  return { candidates, skipped, headers };
}

/**
 * The adapter form. CSV import is driven by an upload rather than a search,
 * so `search` returns nothing - it is here to satisfy the same contract.
 */
export const csvAdapter: SourceAdapter = {
  id: "manual_csv",
  label: "Manual CSV import",
  reliability: "medium",
  available: () => true,
  unavailableReason: () => null,
  async search() {
    return [];
  },
};
