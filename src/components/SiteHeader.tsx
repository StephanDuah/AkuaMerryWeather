"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BUSINESS, SERVICES } from "@/lib/content";

/**
 * Site header.
 *
 * Desktop: a quiet bar that gains a hairline rule once the page scrolls, so
 * the hero is never boxed in at rest. Mobile: a full panel rather than a
 * compressed copy of the desktop navigation.
 */

const NAV = [
  ...SERVICES.map((service) => ({
    href: `/services/${service.slug}` as const,
    label: service.shortName,
  })),
  { href: "/quote" as const, label: "Request a quote" },
  { href: "/privacy" as const, label: "Privacy" },
];

const telHref = (value: string) => `tel:${value.replace(/\s/g, "")}`;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock the page behind the mobile panel and allow Escape to dismiss it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header className="site-header" data-stuck={stuck}>
        <div className="shell header-bar">
          <Link href="/" className="brand" aria-label={`${BUSINESS.name} home`}>
            <Image
              src="/logo.png"
              alt=""
              width={88}
              height={88}
              priority
              sizes="44px"
            />
            <span>
              <span className="brand-name">{BUSINESS.name}</span>
              <span className="brand-strap">{BUSINESS.strapline}</span>
            </span>
          </Link>

          <nav className="nav" aria-label="Primary">
            {SERVICES.map((service) => (
              <Link key={service.slug} href={`/services/${service.slug}`}>
                {service.shortName}
              </Link>
            ))}
            <Link href="/privacy">Privacy</Link>
          </nav>

          <div className="header-actions">
            <a
              className="header-phone"
              href={telHref(BUSINESS.phonePrimary)}
            >
              {BUSINESS.phonePrimary}
            </a>
            <Link href="/quote" className="btn btn-primary header-cta">
              Request a quote
            </Link>
            <button
              type="button"
              className="menu-button"
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen(true)}
            >
              <span className="sr-only">Open the menu</span>
              <svg
                width="20"
                height="14"
                viewBox="0 0 20 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M0 1h20M0 7h20M0 13h13" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="mobile-nav" id="mobile-nav" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="mobile-nav-top">
            <span className="mobile-nav-title">{BUSINESS.name}</span>
            <button
              ref={closeRef}
              type="button"
              className="mobile-nav-close"
              onClick={() => setOpen(false)}
            >
              <span className="sr-only">Close the menu</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M1 1l14 14M15 1L1 15" />
              </svg>
            </button>
          </div>

          <nav className="mobile-nav-list" aria-label="Primary">
            {NAV.map((item, index) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                <span className="idx">{String(index + 1).padStart(2, "0")}</span>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mobile-nav-foot">
            <a href={telHref(BUSINESS.phonePrimary)}>{BUSINESS.phonePrimary}</a>
            <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
            <Link
              href="/quote"
              className="btn btn-light"
              onClick={() => setOpen(false)}
            >
              Request a quote
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
