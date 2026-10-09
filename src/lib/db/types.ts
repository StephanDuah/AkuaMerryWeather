import type {
  AdDraft,
  AgentAction,
  Booking,
  Communication,
  Escalation,
  Lead,
  PricingConfig,
  Settings,
  TableName,
} from "@/lib/types";
import type { Campaign, Prospect, Suppression } from "@/lib/prospecting/types";

/** Maps a table name to the row type it holds. */
export interface RowFor {
  leads: Lead;
  bookings: Booking;
  communications: Communication;
  escalations: Escalation;
  agent_actions: AgentAction;
  ad_drafts: AdDraft;
  prospects: Prospect;
  suppressions: Suppression;
  campaigns: Campaign;
}

/** Simple equality filter, which is all any screen in this app needs. */
export type Filter<T extends TableName> = Partial<
  Record<keyof RowFor[T], string | number | boolean | null>
>;

/**
 * The storage contract. Two drivers implement it: a local JSON file
 * (used automatically when Supabase is not configured, so the app runs
 * with zero third-party accounts) and Supabase Postgres (production).
 */
export interface DataStore {
  readonly driver: "json" | "supabase";

  list<T extends TableName>(table: T, filter?: Filter<T>): Promise<RowFor[T][]>;
  get<T extends TableName>(table: T, id: string): Promise<RowFor[T] | null>;
  insert<T extends TableName>(table: T, row: RowFor[T]): Promise<RowFor[T]>;
  update<T extends TableName>(
    table: T,
    id: string,
    patch: Partial<RowFor[T]>,
  ): Promise<RowFor[T] | null>;
  remove<T extends TableName>(table: T, id: string): Promise<boolean>;

  getPricing(): Promise<PricingConfig>;
  savePricing(pricing: PricingConfig): Promise<PricingConfig>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<Settings>;

  /** Wipes all records and restores the demonstration data. */
  reset(): Promise<void>;
}
