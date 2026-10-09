import Link from "next/link";
import type { Metadata } from "next";
import { QuoteForm } from "@/components/QuoteForm";
import { store } from "@/lib/db";
import { BUSINESS, SERVICES, TRUST_SIGNALS } from "@/lib/content";

const telHref = (value: string) => `tel:${value.replace(/\s/g, "")}`;

export const metadata: Metadata = {
  title: "Request a quote",
  description:
    "Get an indicative price for office, end of tenancy or domestic cleaning anywhere in Greater London, confirmed by our team before anything is booked.",
  alternates: { canonical: "/quote" },
};

export const dynamic = "force-dynamic";

export default async function QuotePage() {
  const pricing = await store.getPricing();

  return (
    <>
      <section className="page-head">
        <div className="shell page-head-inner">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>Request a quote</span>
          </nav>
          <p className="eyebrow">Estimate in two minutes</p>
          <h1>Request a quote</h1>
          <p className="lede">
            Tell us about the property and you will have an indicative price
            immediately. A member of our team then confirms the final figure
            with you before anything is booked, so there are no surprises on
            either side.
          </p>
        </div>
      </section>

      <section className="bay">
        <div className="shell split split-wide">
          {/* Primary column: the form itself. */}
          <div>
            <QuoteForm
              addons={pricing.addons}
              services={SERVICES.map((service) => ({
                value: service.type,
                label: service.name,
              }))}
            />
          </div>

          {/* Supporting column: how to reach us, and what a quote covers. */}
          <div>
            <div className="aside-panel">
              <h2>Prefer to speak to someone?</h2>
              <p
                style={{
                  fontSize: "var(--t-body)",
                  color: "var(--ink-body)",
                  marginBottom: "1.25rem",
                }}
              >
                Our office is open {BUSINESS.hours}. We are always happy to talk
                a property through before quoting.
              </p>
              <ul className="spec">
                <li>
                  <a href={telHref(BUSINESS.phonePrimary)}>
                    {BUSINESS.phonePrimary}
                  </a>
                </li>
                <li>
                  <a href={telHref(BUSINESS.phoneSecondary)}>
                    {BUSINESS.phoneSecondary}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
                </li>
                <li>{BUSINESS.address}</li>
              </ul>
            </div>

            <div className="aside-panel">
              <h2>What every quote includes</h2>
              <ul className="spec">
                {TRUST_SIGNALS.slice(0, 4).map((signal) => (
                  <li key={signal.title}>{signal.title}</li>
                ))}
              </ul>
              <p
                style={{
                  fontSize: "var(--t-small)",
                  color: "var(--ink-meta)",
                  marginTop: "1.25rem",
                }}
              >
                We serve {BUSINESS.serviceArea} only, and we do not currently
                take contracts in schools or healthcare settings.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
