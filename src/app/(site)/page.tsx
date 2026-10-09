import Image from "next/image";
import Link from "next/link";
import { Lines } from "@/components/Lines";
import {
  BUSINESS,
  PRIORITY_AUDIENCES,
  SERVICES,
  TRUST_SIGNALS,
} from "@/lib/content";

const telHref = (value: string) => `tel:${value.replace(/\s/g, "")}`;

/** Structured data built only from information the business actually publishes. */
const localBusiness = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: BUSINESS.name,
  description: BUSINESS.promise,
  telephone: BUSINESS.phonePrimary,
  email: BUSINESS.email,
  url: process.env.NEXT_PUBLIC_SITE_URL ?? BUSINESS.website,
  address: {
    "@type": "PostalAddress",
    streetAddress: "313 Mare Street",
    addressLocality: "London",
    postalCode: "E8 1EJ",
    addressCountry: "GB",
  },
  areaServed: { "@type": "AdministrativeArea", name: "Greater London" },
  openingHours: "Mo-Sa 08:00-18:00",
  makesOffer: SERVICES.map((service) => ({
    "@type": "Offer",
    itemOffered: { "@type": "Service", name: service.name },
  })),
};

/**
 * Photography is matched to the service it sits beside, and the alt text
 * describes what the photograph shows rather than claiming whose work it is.
 */
const SERVICE_MEDIA: Record<
  string,
  { src: string; alt: string }
> = {
  "office-cleaning": {
    src: "/photos/office-desk.jpg",
    alt: "A desk and workstation being wiped down with a cloth and spray during an office clean",
  },
  "end-of-tenancy-cleaning": {
    src: "/photos/eot-oven.jpg",
    alt: "A gloved hand removing baked-on grease from a hob with a microfibre cloth",
  },
  "domestic-cleaning": {
    src: "/photos/domestic-vacuum.jpg",
    alt: "A living room carpet being vacuumed during a domestic clean",
  },
};

const Arrow = () => (
  <svg
    width="14"
    height="10"
    viewBox="0 0 14 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden="true"
  >
    <path d="M0 5h12M8.5 1L12.5 5l-4 4" />
  </svg>
);

/**
 * The six characters a JSON string uses for "<".
 *
 * Built from the character code rather than written as an escape, because
 * a literal escape sequence in this position is easy to collapse back into
 * "<" by accident - which silently turns the guard below into a no-op. 92
 * is a backslash.
 */
const ESCAPED_LT = String.fromCharCode(92) + "u003c";

export default function HomePage() {
  const credentials = TRUST_SIGNALS.slice(0, 3).concat(TRUST_SIGNALS[5]);
  const evidence = [TRUST_SIGNALS[3], TRUST_SIGNALS[4]];

  return (
    <>
      {/*
        Structured data for search engines. The values are our own constants,
        not user input, but the escaping is not optional: a "</script>" in any
        future value would end this tag early and turn the rest into markup.
        Escaping "<" removes that whole class of mistake in advance.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(localBusiness).replaceAll("<", ESCAPED_LT),
        }}
      />

      {/* ---- Hero: a real clean in progress, with the promise over it ---- */}
      <section className="hero-media">
        <Image
          src="/photos/hero-living-room.jpg"
          alt="A living room being vacuumed with professional equipment in a bright, high-ceilinged flat"
          fill
          priority
          sizes="100vw"
        />
        <div className="shell hero-media-inner hero-enter">
          <p className="eyebrow">
            {BUSINESS.serviceArea} &middot; Commercial &amp; domestic
          </p>
          <div className="hero-rule" data-reveal="rule" />
          <h1>
            <Lines
              spoken="A cleaning company built around evidence, not promises."
              lines={[
                "A cleaning company",
                <>
                  built around <em>evidence</em>,
                </>,
                "not promises.",
              ]}
            />
          </h1>
          <p className="lede">
            Every job is worked to a written specification, photographed on
            arrival and on completion, and covered by our re-clean guarantee.
            Our staff are trained, DBS-checked and fully insured.
          </p>
          <div className="hero-actions">
            <Link href="/quote" className="btn btn-light">
              Request a quote
            </Link>
            <a href={telHref(BUSINESS.phonePrimary)} className="btn btn-outline">
              {BUSINESS.phonePrimary}
            </a>
          </div>
        </div>
        <div className="hero-scroll" aria-hidden="true">
          Scroll
          <span />
        </div>
      </section>

      <section className="hero-strip" aria-label="How to reach us">
        <div className="shell">
          <dl className="hero-strip-row">
            <div className="hero-strip-item">
              <dt>Service area</dt>
              <dd>{BUSINESS.serviceArea}</dd>
            </div>
            <div className="hero-strip-item">
              <dt>Working hours</dt>
              <dd>{BUSINESS.hours}</dd>
            </div>
            <div className="hero-strip-item">
              <dt>Telephone</dt>
              <dd>
                <a href={telHref(BUSINESS.phonePrimary)}>
                  {BUSINESS.phonePrimary}
                </a>
              </dd>
            </div>
            <div className="hero-strip-item">
              <dt>Office</dt>
              <dd>{BUSINESS.address}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ---- Credentials ---- */}
      <section className="credentials" aria-label="Our credentials">
        <div className="shell">
          <dl className="credentials-row">
            {credentials.map((signal, index) => (
              <div
                className="credential"
                key={signal.title}
                data-reveal
                data-delay={Math.min(index, 3)}
              >
                <dt>{signal.title}</dt>
                <dd>{signal.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---- Services, each with the work it describes ---- */}
      <section className="bay">
        <div className="shell">
          <div className="split" style={{ marginBottom: "2.5rem" }}>
            <div data-reveal>
              <p className="eyebrow">What we do</p>
              <h2 style={{ fontSize: "var(--t-h2)" }}>
                Three services, each worked to a documented checklist.
              </h2>
            </div>
            <p className="lede" data-reveal data-delay="1">
              We concentrate on the work we do well rather than offering
              everything, which is why we can tell you exactly what is included
              before a team arrives.
            </p>
          </div>

          <div className="index">
            {SERVICES.map((service, index) => {
              const media = SERVICE_MEDIA[service.slug];
              return (
                <article className="index-row-media" key={service.slug}>
                  <Link
                    href={`/services/${service.slug}`}
                    className="index-media photo photo-4x3"
                    data-reveal="mask"
                    aria-label={`${service.name}: full specification`}
                  >
                    <span className="num">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Image
                      src={media.src}
                      alt={media.alt}
                      width={1200}
                      height={900}
                      sizes="(min-width: 60rem) 45vw, 100vw"
                    />
                  </Link>

                  <div data-reveal data-delay="1">
                    <h3 style={{ fontSize: "var(--t-h2)" }}>{service.name}</h3>
                    <p className="index-audience">{service.audience}</p>
                    <p style={{ marginTop: "1rem", fontSize: "var(--t-body)" }}>
                      {service.summary}
                    </p>
                    <ul className="index-includes" style={{ marginTop: "1.25rem" }}>
                      {service.includes.slice(0, 4).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <p style={{ marginTop: "1.5rem" }}>
                      <Link
                        href={`/services/${service.slug}`}
                        className="link-arrow"
                      >
                        Full specification <Arrow />
                      </Link>
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- The work, then the result ---- */}
      <section className="bay on-panel" style={{ borderTop: "1px solid var(--rule)" }}>
        <div className="shell band band-wide-text">
          <div className="band-body" data-reveal>
            <p className="eyebrow">Detail is the difference</p>
            <h2>
              The places an inventory clerk looks first are the places we start.
            </h2>
            <p className="lede">
              Limescale on a shower screen, grease behind a hob, dust along a
              skirting board. These are what a checkout report picks up, and
              they are written into the checklist our teams work from.
            </p>
            <p>
              <Link
                href="/services/end-of-tenancy-cleaning"
                className="link-arrow"
              >
                What an end of tenancy clean covers <Arrow />
              </Link>
            </p>
          </div>

          <div className="band-media pair" data-reveal="media">
            <div className="photo photo-tall photo-zoom">
              <Image
                src="/photos/bathroom-tap.jpg"
                alt="A bathroom tap being descaled and polished with a sponge"
                width={800}
                height={1067}
                sizes="(min-width: 60rem) 22vw, 45vw"
              />
            </div>
            <div className="photo photo-tall photo-zoom">
              <Image
                src="/photos/bathroom-mirror.jpg"
                alt="A bathroom mirror being cleaned to a streak-free finish"
                width={800}
                height={1067}
                sizes="(min-width: 60rem) 22vw, 45vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Full-bleed photographic break ---- */}
      <section className="plate">
        <Image
          src="/photos/office-interior.jpg"
          alt="An office with desks, chairs and glass partitions left clean and presentable"
          fill
          sizes="100vw"
        />
        <div className="shell plate-inner" data-reveal>
          <p className="eyebrow">Out of hours, every time</p>
          <h2>Your team arrives to a workplace that is already ready.</h2>
          <p className="lede">
            Offices are cleaned around your working day, to a written
            specification, by a vetted team with a named account contact.
          </p>
          <p style={{ marginTop: "1.5rem" }}>
            <Link href="/services/office-cleaning" className="link-arrow">
              Office and commercial cleaning <Arrow />
            </Link>
          </p>
        </div>
      </section>

      {/* ---- Who we work with ---- */}
      <section className="bay">
        <div className="shell split">
          <div className="split-sticky" data-reveal>
            <p className="eyebrow">Who we work with</p>
            <h2 style={{ fontSize: "var(--t-h2)" }}>
              Built for the people who hand over the keys.
            </h2>
            <p className="lede" style={{ marginTop: "1.25rem" }}>
              Most of our work comes from professionals who need a property
              ready on a date they have already committed to.
            </p>
            <div className="photo photo-4x3" style={{ marginTop: "2rem" }} data-reveal="media">
              <Image
                src="/photos/domestic-floor.jpg"
                alt="A hard floor being wiped down by hand during a detailed clean"
                width={1000}
                height={750}
                sizes="(min-width: 64rem) 32vw, 100vw"
              />
            </div>
          </div>

          <div className="audience-list">
            {PRIORITY_AUDIENCES.map((audience, index) => (
              <article
                className="audience"
                key={audience.title}
                data-reveal
                data-delay={Math.min(index + 1, 3)}
              >
                <h3>{audience.title}</h3>
                <p>{audience.detail}</p>
                <p>
                  <Link href={audience.href} className="link-arrow">
                    How this works <Arrow />
                  </Link>
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Evidence ---- */}
      <section className="bay on-dark-section">
        <div className="shell">
          <div className="split" style={{ marginBottom: "3rem" }}>
            <div data-reveal>
              <p className="eyebrow">How we prove the work</p>
              <h2 style={{ fontSize: "var(--t-h2)" }}>
                A standard you can hold us to.
              </h2>
            </div>
            <p className="lede" data-reveal data-delay="1">
              Two things separate a clean that passes an inventory check from
              one that does not: a record of what was done, and a commitment to
              put right anything that falls short.
            </p>
          </div>

          <div className="standards-grid">
            {evidence.map((signal, index) => (
              <div
                className="standard"
                key={signal.title}
                data-reveal
                data-delay={Math.min(index + 1, 3)}
              >
                <h3>{signal.title}</h3>
                <p>{signal.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Closing call to action ---- */}
      <section className="cta-band">
        <div className="shell cta-inner">
          <div data-reveal>
            <h2>Tell us about the property and we will take it from there.</h2>
            <p className="lede" style={{ marginTop: "1rem" }}>
              You will have an indicative price straight away, and a member of
              our team will confirm the final figure with you before anything is
              booked.
            </p>
          </div>
          <div className="cta-actions" data-reveal data-delay="1">
            <Link href="/quote" className="btn btn-primary">
              Request a quote
            </Link>
            <a href={`mailto:${BUSINESS.email}`} className="btn btn-outline">
              Email us
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
