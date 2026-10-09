import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared dashboard components.
 *
 * These render the classes defined in src/app/admin/admin.css, so the
 * dashboard's visual language lives in one stylesheet rather than being
 * scattered through the pages as utility classes.
 */

export function Card({
  title,
  description,
  children,
  actions,
  bodyless,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Set when the child supplies its own padding, e.g. a full-bleed table. */
  bodyless?: boolean;
}) {
  return (
    <section className="a-card">
      {(title || actions) && (
        <header className="a-card-head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p className="d">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {bodyless ? children : <div className="a-card-body">{children}</div>}
    </section>
  );
}

export function Tiles({ children }: { children: ReactNode }) {
  return <div className="a-tiles">{children}</div>;
}

export function Tile({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: "alert" | "good";
}) {
  const inner = (
    <>
      <p className="k">{label}</p>
      <p className="v">{value}</p>
      {hint && <p className="h">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="a-tile" data-tone={tone}>
      {inner}
    </Link>
  ) : (
    <div className="a-tile" data-tone={tone}>
      {inner}
    </div>
  );
}

/**
 * Status colour is semantic, not brand: green means settled, amber means
 * waiting, red means it needs a person.
 */
const TONES: Record<string, "good" | "warn" | "crit" | "info" | "neutral"> = {
  new: "info",
  quoted: "warn",
  booked: "good",
  followed_up: "neutral",
  lost: "crit",
  pending: "warn",
  confirmed: "good",
  completed: "neutral",
  cancelled: "crit",
  unpaid: "crit",
  link_sent: "warn",
  paid: "good",
  refunded: "neutral",
  not_applicable: "neutral",
  open: "warn",
  resolved: "good",
  draft: "warn",
  queued: "warn",
  sent: "good",
  failed: "crit",
  logged: "neutral",
  complaint: "crit",
  payment: "crit",
  refund: "crit",
  out_of_area: "warn",
  out_of_scope: "warn",
  excluded_sector: "warn",
  uncertain: "warn",
  email_approval: "info",
  manual: "neutral",
  connected: "good",
  simulated: "warn",
};

export function Badge({ value }: { value: string }) {
  return (
    <span className="a-badge" data-tone={TONES[value] ?? "neutral"}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="a-scroll">
      <table className="a-table">
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={`${header}-${index}`}>
                {header || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="a-empty">{children}</p>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {hint && <span className="hint">{hint}</span>}
      {children}
    </label>
  );
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function money(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}
