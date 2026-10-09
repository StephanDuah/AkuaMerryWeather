import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PricingConfig, Settings, TableName } from "@/lib/types";
import { DEFAULT_PRICING, DEFAULT_SETTINGS, normalisePricing } from "@/lib/seed";
import type { DataStore, Filter, RowFor } from "./types";

/**
 * Supabase (Postgres) driver, used when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are present. The schema this expects lives in
 * supabase/schema.sql - run it once in the Supabase SQL editor.
 *
 * Only server code ever constructs this client: the service-role key
 * bypasses row level security and must never reach the browser.
 */

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase driver selected but credentials are missing.");
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

const CONFIG_TABLE = "app_config";

async function readConfig<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await db()
    .from(CONFIG_TABLE)
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`Supabase config read failed: ${error.message}`);
  if (!data) return fallback;
  return data.value as T;
}

async function writeConfig<T>(key: string, value: T): Promise<T> {
  const { error } = await db()
    .from(CONFIG_TABLE)
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Supabase config write failed: ${error.message}`);
  return value;
}

export const supabaseStore: DataStore = {
  driver: "supabase",

  async list<T extends TableName>(table: T, filter?: Filter<T>) {
    let query = db().from(table).select("*");
    for (const [column, value] of Object.entries(filter ?? {})) {
      if (value === undefined) continue;
      query = value === null ? query.is(column, null) : query.eq(column, value);
    }
    const { data, error } = await query.order("created_at", {
      ascending: false,
    });
    if (error) throw new Error(`Supabase list(${table}) failed: ${error.message}`);
    return (data ?? []) as RowFor[T][];
  },

  async get<T extends TableName>(table: T, id: string) {
    const { data, error } = await db()
      .from(table)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase get(${table}) failed: ${error.message}`);
    return (data as RowFor[T]) ?? null;
  },

  async insert<T extends TableName>(table: T, row: RowFor[T]) {
    const { data, error } = await db()
      .from(table)
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(`Supabase insert(${table}) failed: ${error.message}`);
    return data as RowFor[T];
  },

  async update<T extends TableName>(
    table: T,
    id: string,
    patch: Partial<RowFor[T]>,
  ) {
    const { data, error } = await db()
      .from(table)
      .update(patch as Record<string, unknown>)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`Supabase update(${table}) failed: ${error.message}`);
    return (data as RowFor[T]) ?? null;
  },

  async remove<T extends TableName>(table: T, id: string) {
    const { error } = await db().from(table).delete().eq("id", id);
    if (error) throw new Error(`Supabase delete(${table}) failed: ${error.message}`);
    return true;
  },

  async getPricing() {
    // Normalised on the way out: a card stored before a field existed has no
    // way of growing it, and reading one raw crashes the quote engine.
    return normalisePricing(await readConfig<PricingConfig>("pricing", DEFAULT_PRICING));
  },

  async savePricing(pricing: PricingConfig) {
    return writeConfig("pricing", {
      ...pricing,
      updated_at: new Date().toISOString(),
    });
  },

  async getSettings() {
    const stored = await readConfig<Partial<Settings>>("settings", {});
    return { ...DEFAULT_SETTINGS, ...stored };
  },

  async saveSettings(settings: Settings) {
    return writeConfig("settings", {
      ...settings,
      updated_at: new Date().toISOString(),
    });
  },

  async reset() {
    throw new Error(
      "Resetting demonstration data is only supported on the local JSON store.",
    );
  },
};
