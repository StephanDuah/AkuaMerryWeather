import { normalisePricing } from "@/lib/seed";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  Database,
  PricingConfig,
  Settings,
  TableName,
} from "@/lib/types";
import { seedDatabase } from "@/lib/seed";
import type { DataStore, Filter, RowFor } from "./types";

/**
 * File-backed store used whenever Supabase credentials are absent.
 *
 * This keeps the whole application runnable with no third-party accounts
 * at all - `npm run dev` gives a working site, dashboard and chatbot.
 * On a read-only filesystem (a serverless host, for example) writes fall
 * back to memory so nothing crashes; see DECISIONS.md.
 */

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

let cache: Database | null = null;
let writeChain: Promise<unknown> = Promise.resolve();
let warnedReadOnly = false;

async function readFromDisk(): Promise<Database> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Database>;
    const fresh = seedDatabase();
    // Merge so a store written by an older version still loads.
    return {
      leads: parsed.leads ?? fresh.leads,
      bookings: parsed.bookings ?? fresh.bookings,
      communications: parsed.communications ?? fresh.communications,
      escalations: parsed.escalations ?? fresh.escalations,
      agent_actions: parsed.agent_actions ?? fresh.agent_actions,
      ad_drafts: parsed.ad_drafts ?? fresh.ad_drafts,
      prospects: parsed.prospects ?? fresh.prospects,
      suppressions: parsed.suppressions ?? fresh.suppressions,
      campaigns: parsed.campaigns ?? fresh.campaigns,
      pricing: parsed.pricing ?? fresh.pricing,
      settings: { ...fresh.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    const fresh = seedDatabase();
    await persist(fresh);
    return fresh;
  }
}

async function persist(db: Database): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch (error) {
    if (!warnedReadOnly) {
      warnedReadOnly = true;
      console.warn(
        "[merry-cleaners] Local data directory is not writable; " +
          "changes will be kept in memory only for this process. " +
          "Configure Supabase for durable storage.",
        error,
      );
    }
  }
}

async function load(): Promise<Database> {
  if (!cache) cache = await readFromDisk();
  return cache;
}

/** Serialises mutations so two concurrent requests cannot clobber the file. */
function mutate<T>(fn: (db: Database) => Promise<T> | T): Promise<T> {
  const next = writeChain.then(async () => {
    const db = await load();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  writeChain = next.catch(() => undefined);
  return next;
}

function matches(row: Record<string, unknown>, filter?: Record<string, unknown>) {
  if (!filter) return true;
  return Object.entries(filter).every(([key, value]) => {
    if (value === undefined) return true;
    return row[key] === value;
  });
}

export const jsonStore: DataStore = {
  driver: "json",

  async list<T extends TableName>(table: T, filter?: Filter<T>) {
    const db = await load();
    const rows = db[table] as unknown as Record<string, unknown>[];
    return rows.filter((row) =>
      matches(row, filter as Record<string, unknown> | undefined),
    ) as unknown as RowFor[T][];
  },

  async get<T extends TableName>(table: T, id: string) {
    const db = await load();
    const rows = db[table] as unknown as { id: string }[];
    return (rows.find((row) => row.id === id) as RowFor[T]) ?? null;
  },

  async insert<T extends TableName>(table: T, row: RowFor[T]) {
    return mutate((db) => {
      (db[table] as unknown as RowFor[T][]).unshift(row);
      return row;
    });
  },

  async update<T extends TableName>(
    table: T,
    id: string,
    patch: Partial<RowFor[T]>,
  ) {
    return mutate((db) => {
      const rows = db[table] as unknown as ({ id: string } & RowFor[T])[];
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return null;
      rows[index] = { ...rows[index], ...patch };
      return rows[index] as RowFor[T];
    });
  },

  async remove<T extends TableName>(table: T, id: string) {
    return mutate((db) => {
      const rows = db[table] as unknown as { id: string }[];
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return false;
      rows.splice(index, 1);
      return true;
    });
  },

  async getPricing() {
    return normalisePricing((await load()).pricing);
  },

  async savePricing(pricing: PricingConfig) {
    return mutate((db) => {
      db.pricing = { ...pricing, updated_at: new Date().toISOString() };
      return db.pricing;
    });
  },

  async getSettings() {
    return (await load()).settings;
  },

  async saveSettings(settings: Settings) {
    return mutate((db) => {
      db.settings = { ...settings, updated_at: new Date().toISOString() };
      return db.settings;
    });
  },

  async reset() {
    cache = seedDatabase();
    await persist(cache);
  },
};
