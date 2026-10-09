import type { ServiceType } from "@/lib/types";

/**
 * Single source of truth for customer-facing copy.
 *
 * The marketing pages, the chatbot's knowledge and the email templates all
 * read from here, so the business never has to correct the same sentence in
 * three places - and the assistant can never describe a service in terms the
 * website does not also use.
 */

export const BUSINESS = {
  name: "Merry Cleaners",
  strapline: "Professional Cleaning Services",
  promise:
    "Premium commercial and domestic cleaning across Greater London, delivered by trained, DBS-checked and fully insured staff.",
  phonePrimary: "+44 7491 873636",
  phoneSecondary: "+44 7351 553205",
  email: "admin@merrycleaners.co.uk",
  address: "313 Mare Street, London E8 1EJ",
  serviceArea: "Greater London",
  hours: "Monday to Saturday, 08:00 - 18:00",
  website: "https://www.merrycleaners.co.uk",
} as const;

export const TRUST_SIGNALS = [
  {
    title: "Fully insured",
    detail:
      "Comprehensive public liability cover is in place for every job we undertake, with documentation available on request.",
  },
  {
    title: "DBS-checked staff",
    detail:
      "Every cleaner who enters your property or premises has been DBS-checked and reference-verified before their first shift.",
  },
  {
    title: "Trained to a written standard",
    detail:
      "Our teams are trained against documented checklists for each service, so the same standard is delivered on every visit.",
  },
  {
    title: "Before and after photographs",
    detail:
      "We record the condition of the property on arrival and on completion, which gives landlords and agents clear evidence of the work.",
  },
  {
    title: "Our re-clean guarantee",
    detail:
      "If any area falls short of the agreed specification, tell us within 48 hours and we will return and put it right at no further cost.",
  },
  {
    title: "Greater London only",
    detail:
      "We work across Greater London and nowhere else, which is what allows us to hold arrival times and turn a property around at short notice.",
  },
] as const;

export interface ServiceContent {
  slug: string;
  type: ServiceType;
  name: string;
  shortName: string;
  audience: string;
  summary: string;
  /** Precisely what is covered, so nothing is ever over-promised. */
  includes: string[];
  /** Explicit exclusions, which prevents disputes later. */
  excludes: string[];
  proofPoints: string[];
  priceHint: string;
}

export const SERVICES: ServiceContent[] = [
  {
    slug: "office-cleaning",
    type: "office",
    name: "Office & Commercial Cleaning",
    shortName: "Office cleaning",
    audience: "For offices, studios, retail units and managed workspaces",
    summary:
      "A scheduled, contract-quality clean that keeps your workplace presentable for staff, clients and building management. Daily, several times a week, or weekly - always by the same vetted team wherever possible.",
    includes: [
      "Desks, workstations, meeting rooms and communal surfaces sanitised",
      "Floors vacuumed and hard floors mopped throughout",
      "Kitchens and breakout areas cleaned, with appliances wiped down",
      "Washrooms cleaned, sanitised and restocked with your consumables",
      "Waste and recycling collected and taken to your designated point",
      "Touch points - handles, switches, lift buttons - disinfected",
      "Reception and client-facing areas presented to a front-of-house standard",
    ],
    excludes: [
      "External window cleaning above ground floor",
      "Specialist IT equipment cleaning",
      "Clinical or laboratory decontamination",
    ],
    proofPoints: [
      "Out-of-hours and weekend slots so your working day is never disrupted",
      "A named account contact and a documented cleaning specification",
      "Key-holding and alarm procedures agreed in writing before we start",
    ],
    priceHint:
      "Priced on floor area, frequency and scope. Ask for an estimate in the chat, or request a site visit.",
  },
  {
    slug: "end-of-tenancy-cleaning",
    type: "end_of_tenancy",
    name: "End of Tenancy Cleaning",
    shortName: "End of tenancy",
    audience: "For estate agents, letting agents, landlords and Airbnb hosts",
    summary:
      "A full property clean prepared to inventory-checkout standard, with before and after photographs supplied as evidence. Built for agents and landlords who need a property turned around quickly and let again without dispute.",
    includes: [
      "Kitchen deep cleaned, including cupboards inside and out",
      "Appliances cleaned inside, including oven, hob and extractor",
      "Bathrooms descaled, sanitised and polished throughout",
      "Limescale removed from taps, screens, tiles and sanitaryware",
      "All floors vacuumed, mopped and edges detailed",
      "Skirting boards, doors, frames, switches and sockets wiped",
      "Interior windows, sills and frames cleaned",
      "Cobwebs removed and light fittings dusted",
    ],
    excludes: [
      "Removal of tenants' belongings or bulky waste",
      "Repairs, redecoration or damage restoration",
      "Exterior windows above ground floor",
    ],
    proofPoints: [
      "Photographic before and after record supplied with every job",
      "Our re-clean guarantee covers you if the inventory clerk raises a point",
      "Rapid turnarounds for agents working to a check-in date",
    ],
    priceHint:
      "Priced on the number of bedrooms, the condition of the property and any extras such as carpets or ovens.",
  },
  {
    slug: "domestic-cleaning",
    type: "domestic",
    name: "Domestic Cleaning",
    shortName: "Domestic cleaning",
    audience: "For homeowners, tenants and busy households across London",
    summary:
      "Regular or one-off cleaning of your home by the same trusted, DBS-checked cleaner wherever possible, worked to a checklist you agree with us in advance.",
    includes: [
      "Kitchen surfaces, sink and appliance exteriors cleaned",
      "Bathrooms cleaned, sanitised and polished",
      "Dusting and wiping of all reachable surfaces",
      "Floors vacuumed and mopped throughout",
      "Beds made and general tidying to your instructions",
      "Bins emptied and liners replaced",
    ],
    excludes: [
      "Clearance of hoarded or heavily soiled properties",
      "Cleaning requiring ladders above two metres",
      "Care or childcare duties of any kind",
    ],
    proofPoints: [
      "Weekly, fortnightly or one-off visits to suit your household",
      "The same cleaner each visit wherever scheduling allows",
      "All products and equipment supplied unless you prefer your own",
    ],
    priceHint:
      "Priced on the number of bedrooms, how often you would like us, and any extras.",
  },
];

export function serviceByType(type: ServiceType): ServiceContent {
  const found = SERVICES.find((service) => service.type === type);
  if (!found) throw new Error(`Unknown service type: ${type}`);
  return found;
}

export function serviceBySlug(slug: string): ServiceContent | undefined {
  return SERVICES.find((service) => service.slug === slug);
}

/** Ranked in the order the business wants to win work. */
export const PRIORITY_AUDIENCES = [
  {
    title: "Estate and letting agents",
    detail:
      "Fast, photographed end of tenancy turnarounds that stand up to an inventory check, with invoicing that suits your office.",
    href: "/services/end-of-tenancy-cleaning",
  },
  {
    title: "Offices and businesses",
    detail:
      "Contract cleaning delivered out of hours by a vetted team, to a written specification and a named account contact.",
    href: "/services/office-cleaning",
  },
  {
    title: "Landlords and Airbnb hosts",
    detail:
      "Reliable turnarounds between tenancies and stays, with photographic evidence of the condition on completion.",
    href: "/services/end-of-tenancy-cleaning",
  },
] as const;

/*
 * Testimonials are deliberately absent.
 *
 * No signed-off client quotation has been supplied, and inventing one would
 * misrepresent the business. When the owner has real reviews they have
 * permission to publish, add them here as { quote, attribution } and
 * reinstate the section on the home page.
 */
