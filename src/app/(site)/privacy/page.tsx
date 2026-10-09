import Link from "next/link";
import type { Metadata } from "next";
import { BUSINESS } from "@/lib/content";

export const metadata: Metadata = {
  title: "Privacy and your data",
  description:
    "How Merry Cleaners collects, uses and deletes personal data, written in plain English and in line with UK GDPR.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

/**
 * Plain-English privacy notice, matching what the application actually does.
 * The owner should have it reviewed before launch and add their ICO
 * registration number - see SETUP_REQUIRED.md.
 */
export default function PrivacyPage() {
  return (
    <>
      <section className="page-head">
        <div className="shell page-head-inner">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>Privacy</span>
          </nav>
          <p className="eyebrow">UK GDPR</p>
          <h1>Privacy and your data</h1>
          <p className="lede">
            What {BUSINESS.name} does with the information you give us, written
            to comply with UK GDPR and the Data Protection Act 2018.
          </p>
        </div>
      </section>

      <section className="bay">
        <div className="shell">
          <article className="prose">
            <h2>Who we are</h2>
            <p>
              {BUSINESS.name}, {BUSINESS.address}. You can reach us on{" "}
              {BUSINESS.phonePrimary} or at{" "}
              <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>. We are
              the data controller for the information described here.
            </p>

            <h2>What we collect</h2>
            <ul>
              <li>Your name, telephone number and email address</li>
              <li>The address and postcode of the property to be cleaned</li>
              <li>
                Details relevant to quoting: property type, number of bedrooms
                or floor area, and the service you have asked for
              </li>
              <li>Your preferred dates and any instructions you give us</li>
              <li>A record of our correspondence with you</li>
              <li>How you found us, so we know which advertising is working</li>
            </ul>
            <p>
              We do not ask for card or bank details on this website. Payments,
              when taken online, are handled by Stripe, and we never see your
              full card number.
            </p>

            <h2>Why we use it, and on what basis</h2>
            <ul>
              <li>
                <strong>To prepare a quote and answer your enquiry</strong> —
                our legitimate interest in responding to people who contact us
                about our services.
              </li>
              <li>
                <strong>To deliver a clean you have booked</strong> —
                performance of our contract with you.
              </li>
              <li>
                <strong>To follow up an enquiry you did not take further</strong>{" "}
                — our legitimate interest in following up our own enquiries. We
                send at most two follow-up messages, and we stop if you ask us
                to.
              </li>
              <li>
                <strong>To meet our legal and accounting obligations</strong> —
                compliance with a legal obligation.
              </li>
            </ul>

            <h2>Artificial intelligence</h2>
            <p>
              The assistant on this website is powered by AI and helps with
              general questions, estimates and bookings. Anything involving a
              complaint, a payment, a refund or a matter it is not certain about
              is passed to a member of our team, who replies to you personally.
              Replies to emails are drafted for a member of staff to review
              before they are sent. No automated decision is taken about you
              that produces a legal or similarly significant effect.
            </p>

            <h2>Who we share it with</h2>
            <p>
              Only the service providers that make this website work: our
              hosting provider, our database provider, our email provider, our
              payment provider, and Anthropic, who provide the AI assistant.
              Each processes data on our instructions. We do not sell your data,
              and we do not share it for anyone else&rsquo;s marketing.
            </p>

            <h2>How long we keep it</h2>
            <p>
              Enquiries and customer records are kept for 24 months after our
              last contact with you, after which they are deleted
              automatically. Accounting records are kept for six years where the
              law requires it.
            </p>

            <h2>Your rights</h2>
            <p>
              You may ask us for a copy of the data we hold about you, ask us to
              correct it, ask us to delete it, or object to our using it. Write
              to <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> and we
              will respond within one month. If you are not satisfied with our
              response, you may complain to the Information
              Commissioner&rsquo;s Office at{" "}
              <a href="https://ico.org.uk" rel="noreferrer">
                ico.org.uk
              </a>
              .
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
