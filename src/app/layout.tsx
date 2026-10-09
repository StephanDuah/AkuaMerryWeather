import type { Metadata } from "next";
import { Archivo, Newsreader, Noto_Sans_Mono } from "next/font/google";
import { BUSINESS } from "@/lib/content";
import "./globals.css";

/*
 * Three typefaces, three jobs.
 *
 * Archivo, a precise grotesk, is the voice of the site: it carries the
 * headlines at large sizes and tight tracking, and everything functional.
 *
 * Newsreader, an editorial serif, is kept for the few places where warmth
 * earns its keep - the promise, the pull quotes - so the page has a human
 * register as well as a technical one.
 *
 * Noto Sans Mono carries labels, specifications and figures. A monospace in
 * that role is what makes a page read as measured rather than marketed, and
 * here it is not decoration: this company sells work done to a written
 * specification, photographed and checked. Setting the specifications in a
 * typeface built for exactness says that before a word is read.
 *
 * All three are open-licensed and self-hosted by next/font, so there is no
 * third-party font request at runtime and no licensing question.
 */

const newsreader = Newsreader({
  variable: "--font-newsreader",
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

const archivo = Archivo({
  variable: "--font-archivo",
  // 700 and 800 added: the display sizes below need real weight behind them,
  // and a grotesk set large at 600 looks hesitant rather than confident.
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

const mono = Noto_Sans_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? BUSINESS.website;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BUSINESS.name} | Office, End of Tenancy & Domestic Cleaning in London`,
    template: `%s | ${BUSINESS.name}`,
  },
  description:
    "Office, end of tenancy and domestic cleaning across Greater London. Trained, DBS-checked and fully insured cleaners, before and after photographs on every job, and a re-clean guarantee.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: BUSINESS.name,
    title: `${BUSINESS.name} | Professional Cleaning Services in London`,
    description:
      "Office, end of tenancy and domestic cleaning across Greater London, by trained, DBS-checked and fully insured staff.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`${newsreader.variable} ${archivo.variable} ${mono.variable} h-full`}
      /*
        The script below adds a class to this element before React hydrates,
        which React then reports as a mismatch between the server's markup
        and the client's. That is the known cost of setting anything before
        paint, and this is the documented way to pay it: the warning is
        suppressed for this element's own attributes only, one level deep,
        so a genuine mismatch anywhere else in the tree is still reported.
      */
      suppressHydrationWarning
    >
      <head>
        {/*
          Marks the document as able to animate, before anything paints.

          Every reveal below is hidden only while this class is present, so
          the page has a correct resting state: if JavaScript never runs, or
          fails, or the visitor has asked for reduced motion, the content is
          simply visible. Without it, a headline that waits for an observer
          is a headline that is missing when the observer never arrives -
          and a blank hero is a far worse failure than an unanimated one.

          It is inline and blocking on purpose. Adding the class from a
          component would paint the text first and then hide it, which reads
          as a flicker.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches===false)" +
              "document.documentElement.classList.add('motion-ready')}catch(e){}",
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
