import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BUSINESS, SERVICES, serviceBySlug } from "@/lib/content";
import { SERVICE_PHOTOS } from "@/lib/media";

const telHref = (value: string) => `tel:${value.replace(/\s/g, "")}`;

export function generateStaticParams() {
  return SERVICES.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) return { title: "Service not found" };
  const photo = SERVICE_PHOTOS[service.slug];
  return {
    title: `${service.name} in London`,
    description: service.summary.slice(0, 155),
    alternates: { canonical: `/services/${service.slug}` },
    openGraph: {
      title: `${service.name} | ${BUSINESS.name}`,
      description: service.summary.slice(0, 200),
      images: photo ? [{ url: photo.lead.src, alt: photo.lead.alt }] : undefined,
    },
  };
}

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

export default async function ServicePage({
  params,
}: PageProps<"/services/[slug]">) {
  const { slug } = await params;
  const service = serviceBySlug(slug);
  if (!service) notFound();

  const photos = SERVICE_PHOTOS[service.slug];
  const others = SERVICES.filter((item) => item.slug !== service.slug);

  return (
    <>
      {/* ---- Hero: the service shown, not only described ---- */}
      <section
        className="hero-media"
        style={{ minHeight: "clamp(22rem, 48vh, 32rem)" }}
      >
        <Image
          src={photos.lead.src}
          alt={photos.lead.alt}
          fill
          priority
          sizes="100vw"
        />
        <div className="shell hero-media-inner hero-enter">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/" style={{ color: "var(--on-dark-2)" }}>
              Home
            </Link>
            <span aria-hidden="true" style={{ color: "var(--on-dark-4)" }}>
              /
            </span>
            <span style={{ color: "var(--on-dark-4)" }}>
              {service.shortName}
            </span>
          </nav>
          <h1 style={{ fontSize: "var(--t-h1)" }}>
            {service.name} across {BUSINESS.serviceArea}
          </h1>
          <p className="lede">{service.summary}</p>
          <div className="hero-actions">
            <Link href="/quote" className="btn btn-light">
              Get an estimate
            </Link>
            <a href={telHref(BUSINESS.phonePrimary)} className="btn btn-outline">
              {BUSINESS.phonePrimary}
            </a>
          </div>
        </div>
      </section>

      {/* ---- Specification ---- */}
      <section className="bay">
        <div className="shell split">
          <div data-reveal>
            <p className="eyebrow">The specification</p>
            <h2 style={{ fontSize: "var(--t-h2)", marginBottom: "1.5rem" }}>
              What is included
            </h2>
            <ul className="spec">
              {service.includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div data-reveal data-delay="1">
            <div className="photo photo-4x3" style={{ marginBottom: "1.5rem" }}>
              <Image
                src={photos.detail.src}
                alt={photos.detail.alt}
                width={photos.detail.width}
                height={photos.detail.height}
                sizes="(min-width: 64rem) 45vw, 100vw"
              />
            </div>

            <div className="aside-panel">
              <h2>What is not included</h2>
              <p
                style={{
                  fontSize: "var(--t-small)",
                  color: "var(--ink-meta)",
                  marginBottom: "1rem",
                }}
              >
                Stated plainly so there are no surprises. Most of these can be
                arranged separately if you need them.
              </p>
              <ul className="spec muted">
                {service.excludes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="aside-panel">
              <h2>How we work</h2>
              <ul className="spec">
                {service.proofPoints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Pricing, beside the finished result ---- */}
      <section
        className="bay on-panel"
        style={{ borderTop: "1px solid var(--rule)" }}
      >
        <div className="shell band band-media-right">
          <div
            className="band-media photo photo-3x2 photo-zoom"
            data-reveal="media"
          >
            <Image
              src={photos.result.src}
              alt={photos.result.alt}
              width={photos.result.width}
              height={photos.result.height}
              sizes="(min-width: 60rem) 48vw, 100vw"
            />
          </div>
          <div className="band-body" data-reveal>
            <p className="eyebrow">Pricing</p>
            <h2>Priced on the property, not on a guess.</h2>
            <p className="lede">{service.priceHint}</p>
            <p style={{ marginTop: "1rem", fontSize: "var(--t-body)" }}>
              Prices vary by London postcode, so the estimate you receive
              reflects where the property actually is. Every figure we give
              remains an estimate until our team has confirmed the scope with
              you.
            </p>
            <p>
              <Link href="/quote" className="link-arrow">
                Request an estimate <Arrow />
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ---- Other services ---- */}
      <section className="bay">
        <div className="shell">
          <p className="eyebrow" data-reveal>
            Also available
          </p>
          <div className="index" style={{ marginTop: "1.5rem" }}>
            {others.map((item, index) => {
              const media = SERVICE_PHOTOS[item.slug];
              return (
                <article className="index-row-media" key={item.slug}>
                  <Link
                    href={`/services/${item.slug}`}
                    className="index-media photo photo-4x3"
                    data-reveal="media"
                    aria-label={`${item.name}: full specification`}
                  >
                    <span className="num">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Image
                      src={media.lead.src}
                      alt={media.lead.alt}
                      width={media.lead.width}
                      height={media.lead.height}
                      sizes="(min-width: 60rem) 42vw, 100vw"
                    />
                  </Link>
                  <div data-reveal data-delay="1">
                    <h3 style={{ fontSize: "var(--t-h3)" }}>{item.name}</h3>
                    <p className="index-audience">{item.audience}</p>
                    <p
                      style={{
                        marginTop: "0.875rem",
                        fontSize: "var(--t-body)",
                      }}
                    >
                      {item.summary}
                    </p>
                    <p style={{ marginTop: "1.25rem" }}>
                      <Link
                        href={`/services/${item.slug}`}
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
    </>
  );
}
