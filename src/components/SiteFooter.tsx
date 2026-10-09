import Image from "next/image";
import Link from "next/link";
import { BUSINESS, SERVICES, TRUST_SIGNALS } from "@/lib/content";

const telHref = (value: string) => `tel:${value.replace(/\s/g, "")}`;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-top">
        <div>
          <div className="footer-brand">
            <Image src="/logo.png" alt="" width={96} height={96} sizes="48px" />
            <span>
              <span className="brand-name">{BUSINESS.name}</span>
              <span className="brand-strap">{BUSINESS.strapline}</span>
            </span>
          </div>
          <p className="footer-about">{BUSINESS.promise}</p>
        </div>

        <div className="footer-col">
          <h2>Services</h2>
          <ul>
            {SERVICES.map((service) => (
              <li key={service.slug}>
                <Link href={`/services/${service.slug}`}>{service.name}</Link>
              </li>
            ))}
            <li>
              <Link href="/quote">Request a quote</Link>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h2>Contact</h2>
          <ul>
            <li>
              <a href={telHref(BUSINESS.phonePrimary)}>{BUSINESS.phonePrimary}</a>
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
            <li>{BUSINESS.hours}</li>
          </ul>
        </div>

        <div className="footer-col">
          <h2>Standards</h2>
          <ul>
            {TRUST_SIGNALS.map((signal) => (
              <li key={signal.title}>{signal.title}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="shell footer-bottom">
        <p>
          &copy; {new Date().getFullYear()} {BUSINESS.name}. Serving{" "}
          {BUSINESS.serviceArea}.
        </p>
        <nav aria-label="Legal and staff">
          <Link href="/privacy">Privacy &amp; data</Link>
          <Link href="/admin">Team login</Link>
        </nav>
      </div>
    </footer>
  );
}
