import { newId, store } from "@/lib/db";
import { BOROUGH_NAMES } from "./boroughs";
import type { Campaign } from "./types";

/**
 * Prospecting campaigns.
 *
 * Configurable rather than hard-coded: a campaign is a stored record the
 * owner can edit, not a function in the source. The four below are seeded
 * as starting points, ordered by the business's own stated priorities -
 * estate agents first, then offices.
 */

export const DEFAULT_CAMPAIGNS: Omit<Campaign, "id" | "created_at">[] = [
  {
    name: "London estate and letting agents",
    description:
      "The business's highest-priority audience. Agents handle property turnarounds between tenancies, which is end of tenancy cleaning, and run their own offices.",
    target_types: ["estate_agent", "letting_agent"],
    boroughs: [],
    sources: ["openstreetmap", "companies_house"],
    enabled: true,
    last_run_at: null,
    last_run_summary: null,
  },
  {
    name: "London property management",
    description:
      "Block and residential managing agents, who hold portfolios rather than single properties and need both turnaround and communal-area cleaning.",
    target_types: ["property_management", "landlord_operator"],
    boroughs: [],
    sources: ["openstreetmap", "companies_house"],
    enabled: true,
    last_run_at: null,
    last_run_summary: null,
  },
  {
    name: "London offices and workspaces",
    description:
      "Second growth priority. Offices and co-working spaces typically hold a recurring cleaning contract.",
    target_types: ["commercial_office", "coworking_space"],
    boroughs: [],
    sources: ["openstreetmap"],
    enabled: true,
    last_run_at: null,
    last_run_summary: null,
  },
  {
    name: "Short-let and serviced accommodation",
    description:
      "Airbnb and serviced-apartment operators need turnaround cleaning between guests, often at short notice.",
    target_types: ["short_let_management"],
    boroughs: [],
    sources: ["companies_house"],
    enabled: true,
    last_run_at: null,
    last_run_summary: null,
  },
];

/** Creates the starting campaigns once, if none exist. */
export async function ensureCampaigns(): Promise<Campaign[]> {
  const existing = await store.list("campaigns");
  if (existing.length > 0) return existing;

  const created: Campaign[] = [];
  for (const template of DEFAULT_CAMPAIGNS) {
    const campaign: Campaign = {
      ...template,
      id: newId("camp"),
      created_at: new Date().toISOString(),
    };
    created.push(await store.insert("campaigns", campaign));
  }
  return created;
}

export async function listCampaigns(): Promise<Campaign[]> {
  const campaigns = await ensureCampaigns();
  return campaigns.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  return store.get("campaigns", id);
}

/**
 * Boroughs in a sensible order for systematic coverage: central first,
 * where the density of agents and offices is highest.
 */
export const BOROUGH_ORDER = BOROUGH_NAMES;
