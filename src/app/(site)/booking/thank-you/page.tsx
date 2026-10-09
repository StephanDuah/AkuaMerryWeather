import Link from "next/link";
import type { Metadata } from "next";
import { BUSINESS } from "@/lib/content";

const telHref = (value: string) => `tel:${value.replace(/\s/g, "")}`;

export const metadata: Metadata = {
  title: "Thank you",
  description: "Your payment has been received.",
  robots: { index: false, follow: false },
};

/** Where Stripe returns the customer after a successful payment. */
export default function BookingThankYouPage() {
  return (
    <section className="bay">
      <div className="shell">
        <div style={{ maxWidth: "38rem" }}>
          <p className="eyebrow">Payment received</p>
          <h1 style={{ fontSize: "var(--t-h1)" }}>
            Thank you &mdash; that is all settled.
          </h1>
          <p className="lede" style={{ marginTop: "1.5rem" }}>
            A receipt is on its way to you by email. Our team will confirm the
            arrangements for your clean, including access and timings, before
            the day itself.
          </p>
          <p
            style={{
              fontSize: "var(--t-body)",
              color: "var(--ink-meta)",
              marginTop: "1rem",
            }}
          >
            If anything changes in the meantime, call us on{" "}
            <a href={telHref(BUSINESS.phonePrimary)}>{BUSINESS.phonePrimary}</a>{" "}
            or reply to your confirmation email.
          </p>
          <div className="hero-actions">
            <Link href="/" className="btn btn-primary">
              Back to the website
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
