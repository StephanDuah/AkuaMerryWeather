import { findBorough, boroughForPostcode } from "../boroughs";
import type {
  BusinessType,
  ProspectCandidate,
  SourceAdapter,
} from "../types";

/**
 * OpenStreetMap, via the Overpass API.
 *
 * Why this source: it is genuinely free, needs no account, and its data is
 * published under the Open Database Licence which permits automated use.
 * Unlike Yell or Checkatrade - whose terms prohibit automated extraction -
 * querying Overpass is the intended way to use it.
 *
 * Responsible use, per their published usage policy:
 *   - a real User-Agent identifying us and giving a contact address
 *   - modest query sizes and a hard timeout
 *   - one query at a time, with a pause between them
 *   - we stop on a 429 or 504 rather than retrying harder
 *
 * ATTRIBUTION: data is © OpenStreetMap contributors, ODbL. Any published
 * use of this data must say so.
 */

const ENDPOINT = "https://overpass-api.de/api/interpreter";

const USER_AGENT =
  "MerryCleanersProspector/1.0 (+https://merry-cleaners.vercel.app; contact admin@merrycleaners.co.uk)";

/** Minimum gap between requests, enforced process-wide. */
const MIN_INTERVAL_MS = 2500;
let lastRequestAt = 0;

/**
 * OSM tags that correspond to the organisation types we prospect. A type
 * with no mapping simply is not discoverable here, which is honest - not
 * every category exists in OSM.
 */
const TAG_QUERIES: Partial<Record<BusinessType, string[]>> = {
  estate_agent: ['["office"="estate_agent"]'],
  letting_agent: ['["office"="estate_agent"]'],
  property_management: ['["office"="property_management"]'],
  commercial_office: ['["office"="company"]', '["office"="consulting"]'],
  coworking_space: ['["office"="coworking"]', '["amenity"="coworking_space"]'],
  hospitality: ['["tourism"="hotel"]', '["tourism"="guest_house"]'],
  restaurant: ['["amenity"="restaurant"]'],
  retail: ['["shop"="department_store"]'],
  construction_property: ['["office"="architect"]', '["craft"="builder"]'],
};

/** Maps the tag a result carried back to our own classification. */
function typeFromTags(tags: Record<string, string>): BusinessType | null {
  const office = tags.office;
  if (office === "estate_agent") return "estate_agent";
  if (office === "property_management") return "property_management";
  if (office === "coworking") return "coworking_space";
  if (office === "company" || office === "consulting") return "commercial_office";
  if (office === "architect") return "construction_property";
  if (tags.amenity === "coworking_space") return "coworking_space";
  if (tags.amenity === "restaurant") return "restaurant";
  if (tags.tourism === "hotel" || tags.tourism === "guest_house") return "hospitality";
  if (tags.craft === "builder") return "construction_property";
  if (tags.shop) return "retail";
  return null;
}

function buildAddress(tags: Record<string, string>): string | null {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:suburb"],
    tags["addr:city"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

async function throttle() {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
}

export const overpassAdapter: SourceAdapter = {
  id: "openstreetmap",
  label: "OpenStreetMap",
  reliability: "medium",

  available() {
    return true;
  },

  unavailableReason() {
    return null;
  },

  async search({ businessTypes, borough, limit }) {
    const tagSets = businessTypes.flatMap((type) => TAG_QUERIES[type] ?? []);
    if (tagSets.length === 0) return [];

    const uniqueTags = [...new Set(tagSets)];
    const resolved = borough ? findBorough(borough) : null;
    if (borough && !resolved) {
      throw new Error(`Unknown London borough: ${borough}`);
    }

    // Without a borough we still confine the search to Greater London.
    const areaName = resolved?.osmName ?? "Greater London";
    const perTag = Math.max(5, Math.ceil(limit / uniqueTags.length));

    const body = [
      "[out:json][timeout:45];",
      `area["name"="${areaName}"]["boundary"="administrative"]->.a;`,
      "(",
      ...uniqueTags.flatMap((tag) => [
        `node${tag}(area.a);`,
        `way${tag}(area.a);`,
      ]),
      ");",
      `out center tags ${Math.min(perTag * uniqueTags.length * 2, 200)};`,
    ].join("\n");

    await throttle();

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ data: body }).toString(),
    });

    // Their policy is explicit: back off, do not hammer.
    if (response.status === 429 || response.status === 504) {
      throw new Error(
        "OpenStreetMap asked us to slow down. Stopping this run rather than retrying.",
      );
    }
    if (!response.ok) {
      throw new Error(`Overpass returned ${response.status}.`);
    }

    const data = (await response.json()) as { elements?: OverpassElement[] };
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const candidates: ProspectCandidate[] = [];

    for (const element of data.elements ?? []) {
      const tags = element.tags ?? {};
      const name = tags.name?.trim();
      if (!name) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const postcode = tags["addr:postcode"] ?? null;
      const flags: string[] = [];

      // OSM covers more than Greater London if a boundary name is ambiguous.
      if (postcode && !boroughForPostcode(postcode)) {
        flags.push("Postcode does not resolve to a London borough");
      }

      candidates.push({
        company_name: name,
        website: tags.website ?? tags["contact:website"] ?? null,
        business_type_hint: typeFromTags(tags),
        address: buildAddress(tags),
        postcode,
        borough: postcode ? boroughForPostcode(postcode) : (resolved?.name ?? null),
        email: tags.email ?? tags["contact:email"] ?? null,
        phone: tags.phone ?? tags["contact:phone"] ?? null,
        companies_house_number: null,
        companies_house_status: null,
        source: "openstreetmap",
        source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        discovered_at: now,
        flags,
      });

      if (candidates.length >= limit) break;
    }

    return candidates;
  },
};
