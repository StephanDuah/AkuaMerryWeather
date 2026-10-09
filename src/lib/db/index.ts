import { jsonStore } from "./jsonStore";
import { supabaseStore } from "./supabaseStore";
import type { DataStore } from "./types";

export type { DataStore, Filter, RowFor } from "./types";

/**
 * Picks the storage driver at runtime. Supabase is used when its two
 * environment variables are set; otherwise the app falls back to the
 * local JSON store so it runs with no accounts configured at all.
 */
export function getStore(): DataStore {
  const hasSupabase =
    Boolean(process.env.SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return hasSupabase ? supabaseStore : jsonStore;
}

export const store = new Proxy({} as DataStore, {
  get(_target, prop: keyof DataStore) {
    const active = getStore();
    const value = active[prop];
    return typeof value === "function" ? value.bind(active) : value;
  },
});

/** Short, sortable, human-scannable identifiers. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}${random}`;
}
