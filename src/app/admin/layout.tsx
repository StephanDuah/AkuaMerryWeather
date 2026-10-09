import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { isAdmin, usingDefaultPassword } from "@/lib/auth";
import { LoginForm } from "@/components/admin/LoginForm";
import { BUSINESS } from "@/lib/content";
import { logout } from "./actions";
import "./admin.css";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/escalations", label: "Escalations" },
  { href: "/admin/prospects", label: "Prospects" },
  { href: "/admin/activity", label: "AI activity" },
  { href: "/admin/simulator", label: "Mock mode" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/marketing", label: "Marketing" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  if (!(await isAdmin())) {
    return (
      <div className="a-login-page">
        <div className="a-login">
          <div className="a-login-brand">
            <Image src="/logo.png" alt="" width={88} height={88} sizes="44px" />
            <span>
              <span className="n">{BUSINESS.name}</span>
              <span className="s">Team dashboard</span>
            </span>
          </div>
          <LoginForm usingDefault={usingDefaultPassword()} />
          <Link href="/" className="a-back">
            Back to the website
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="a-shell">
      <header className="a-topbar">
        <div className="shell a-topbar-row">
          <Link href="/admin" className="a-brand">
            <Image src="/logo.png" alt="" width={72} height={72} sizes="36px" />
            <span>
              <span className="a-brand-name">{BUSINESS.name}</span>
              <span className="a-brand-sub">Team dashboard</span>
            </span>
          </Link>
          <div className="a-topbar-actions">
            <Link href="/">View website</Link>
            <form action={logout}>
              <button type="submit">Sign out</button>
            </form>
          </div>
        </div>
        <nav className="shell a-nav" aria-label="Dashboard sections">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="shell a-main">{children}</main>
    </div>
  );
}
