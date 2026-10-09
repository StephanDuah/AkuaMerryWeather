/**
 * Photography map.
 *
 * Each service is paired with photographs that show that specific work, so
 * an image never sits beside a section it does not illustrate.
 *
 * Provenance: these are stock photographs licensed for commercial use
 * (Pexels licence). They illustrate the type of work; they are not
 * photographs of Merry Cleaners' own staff or of jobs the company has
 * completed. Alt text and captions therefore describe what is happening in
 * the frame and never claim whose work it is. See DECISIONS.md.
 */

export interface Photo {
  src: string;
  alt: string;
  width: number;
  height: number;
}

const photo = (
  src: string,
  alt: string,
  width: number,
  height: number,
): Photo => ({ src, alt, width, height });

export const PHOTOS = {
  heroLivingRoom: photo(
    "/photos/hero-living-room.jpg",
    "A living room being vacuumed with professional equipment in a bright, high-ceilinged flat",
    2000,
    1333,
  ),
  officeDesk: photo(
    "/photos/office-desk.jpg",
    "A desk and workstation being wiped down with a cloth and spray during an office clean",
    2000,
    1333,
  ),
  officeInterior: photo(
    "/photos/office-interior.jpg",
    "An office with desks, chairs and glass partitions left clean and presentable",
    2000,
    3000,
  ),
  eotOven: photo(
    "/photos/eot-oven.jpg",
    "A gloved hand removing baked-on grease from a hob with a microfibre cloth",
    2000,
    3000,
  ),
  eotWorktop: photo(
    "/photos/eot-worktop.jpg",
    "A kitchen worktop being cleaned down during a deep clean",
    2000,
    1333,
  ),
  bathroomMirror: photo(
    "/photos/bathroom-mirror.jpg",
    "A bathroom mirror being cleaned to a streak-free finish",
    2000,
    3000,
  ),
  bathroomTap: photo(
    "/photos/bathroom-tap.jpg",
    "A bathroom tap being descaled and polished with a sponge",
    2000,
    3000,
  ),
  domesticVacuum: photo(
    "/photos/domestic-vacuum.jpg",
    "A living room carpet being vacuumed during a domestic clean",
    2000,
    1333,
  ),
  domesticFloor: photo(
    "/photos/domestic-floor.jpg",
    "A hard floor being wiped down by hand during a detailed clean",
    2000,
    3000,
  ),
  carpetVacuum: photo(
    "/photos/carpet-vacuum.jpg",
    "A carpet being vacuumed thoroughly with a cylinder machine",
    2000,
    3000,
  ),
  windowsInterior: photo(
    "/photos/windows-interior.jpg",
    "An interior window and frame being cleaned by hand",
    2000,
    3000,
  ),
} as const;

/** The lead photograph and supporting pair for each service page. */
export const SERVICE_PHOTOS: Record<
  string,
  { lead: Photo; detail: Photo; result: Photo }
> = {
  "office-cleaning": {
    lead: PHOTOS.officeDesk,
    detail: PHOTOS.windowsInterior,
    result: PHOTOS.officeInterior,
  },
  "end-of-tenancy-cleaning": {
    lead: PHOTOS.eotOven,
    detail: PHOTOS.bathroomTap,
    result: PHOTOS.eotWorktop,
  },
  "domestic-cleaning": {
    lead: PHOTOS.domesticVacuum,
    detail: PHOTOS.bathroomMirror,
    result: PHOTOS.carpetVacuum,
  },
};
