/**
 * The 32 London boroughs plus the City of London.
 *
 * Used to drive systematic geographic prospecting and to place a prospect
 * from its postcode. The OSM names are the official administrative boundary
 * names Overpass expects, which are not always what people say aloud.
 */

export interface Borough {
  name: string;
  /** The administrative boundary name in OpenStreetMap. */
  osmName: string;
  /** Outward postcode prefixes that fall mostly in this borough. */
  prefixes: string[];
  zone: "central" | "inner" | "outer";
}

export const BOROUGHS: Borough[] = [
  { name: "City of London", osmName: "City of London", prefixes: ["EC1", "EC2", "EC3", "EC4"], zone: "central" },
  { name: "Westminster", osmName: "City of Westminster", prefixes: ["SW1", "W1", "WC2", "NW8"], zone: "central" },
  { name: "Kensington and Chelsea", osmName: "Royal Borough of Kensington and Chelsea", prefixes: ["SW3", "SW5", "SW7", "SW10", "W8", "W10", "W11"], zone: "central" },
  { name: "Camden", osmName: "London Borough of Camden", prefixes: ["NW1", "NW3", "NW5", "WC1", "N6"], zone: "inner" },
  { name: "Islington", osmName: "London Borough of Islington", prefixes: ["N1", "N5", "N7", "N19", "EC1"], zone: "inner" },
  { name: "Hackney", osmName: "London Borough of Hackney", prefixes: ["E2", "E5", "E8", "E9", "N1", "N16"], zone: "inner" },
  { name: "Tower Hamlets", osmName: "London Borough of Tower Hamlets", prefixes: ["E1", "E2", "E3", "E14"], zone: "inner" },
  { name: "Southwark", osmName: "London Borough of Southwark", prefixes: ["SE1", "SE5", "SE15", "SE16", "SE17", "SE22"], zone: "inner" },
  { name: "Lambeth", osmName: "London Borough of Lambeth", prefixes: ["SE11", "SE24", "SE27", "SW2", "SW4", "SW8", "SW9", "SW16"], zone: "inner" },
  { name: "Wandsworth", osmName: "London Borough of Wandsworth", prefixes: ["SW8", "SW11", "SW12", "SW15", "SW17", "SW18"], zone: "inner" },
  { name: "Hammersmith and Fulham", osmName: "London Borough of Hammersmith and Fulham", prefixes: ["W6", "W12", "W14", "SW6"], zone: "inner" },
  { name: "Lewisham", osmName: "London Borough of Lewisham", prefixes: ["SE4", "SE6", "SE8", "SE13", "SE14", "SE23"], zone: "inner" },
  { name: "Greenwich", osmName: "Royal Borough of Greenwich", prefixes: ["SE3", "SE7", "SE9", "SE10", "SE18"], zone: "inner" },
  { name: "Haringey", osmName: "London Borough of Haringey", prefixes: ["N4", "N8", "N15", "N17", "N22"], zone: "inner" },
  { name: "Newham", osmName: "London Borough of Newham", prefixes: ["E6", "E7", "E12", "E13", "E15", "E16"], zone: "inner" },
  { name: "Brent", osmName: "London Borough of Brent", prefixes: ["NW2", "NW6", "NW9", "NW10", "HA0", "HA9"], zone: "outer" },
  { name: "Ealing", osmName: "London Borough of Ealing", prefixes: ["W3", "W5", "W7", "W13", "UB1", "UB6"], zone: "outer" },
  { name: "Barnet", osmName: "London Borough of Barnet", prefixes: ["N2", "N3", "N11", "N12", "N20", "NW4", "NW7", "NW11", "EN5"], zone: "outer" },
  { name: "Enfield", osmName: "London Borough of Enfield", prefixes: ["EN1", "EN2", "EN3", "N9", "N13", "N14", "N18", "N21"], zone: "outer" },
  { name: "Waltham Forest", osmName: "London Borough of Waltham Forest", prefixes: ["E4", "E10", "E11", "E17"], zone: "outer" },
  { name: "Redbridge", osmName: "London Borough of Redbridge", prefixes: ["IG1", "IG2", "IG4", "IG5", "IG6", "E18"], zone: "outer" },
  { name: "Havering", osmName: "London Borough of Havering", prefixes: ["RM1", "RM2", "RM3", "RM11", "RM12", "RM13", "RM14"], zone: "outer" },
  { name: "Barking and Dagenham", osmName: "London Borough of Barking and Dagenham", prefixes: ["IG11", "RM8", "RM9", "RM10"], zone: "outer" },
  { name: "Bexley", osmName: "London Borough of Bexley", prefixes: ["DA5", "DA6", "DA7", "DA8", "DA14", "DA15", "SE2"], zone: "outer" },
  { name: "Bromley", osmName: "London Borough of Bromley", prefixes: ["BR1", "BR2", "BR3", "BR4", "BR5", "BR6", "BR7", "SE20"], zone: "outer" },
  { name: "Croydon", osmName: "London Borough of Croydon", prefixes: ["CR0", "CR2", "CR7", "CR8", "SE25"], zone: "outer" },
  { name: "Sutton", osmName: "London Borough of Sutton", prefixes: ["SM1", "SM2", "SM3", "SM5", "SM6"], zone: "outer" },
  { name: "Merton", osmName: "London Borough of Merton", prefixes: ["SW19", "SW20", "CR4", "SM4"], zone: "outer" },
  { name: "Kingston upon Thames", osmName: "Royal Borough of Kingston upon Thames", prefixes: ["KT1", "KT2", "KT3", "KT5", "KT6", "KT9"], zone: "outer" },
  { name: "Richmond upon Thames", osmName: "London Borough of Richmond upon Thames", prefixes: ["TW1", "TW2", "TW9", "TW10", "TW11", "SW13", "SW14"], zone: "outer" },
  { name: "Hounslow", osmName: "London Borough of Hounslow", prefixes: ["TW3", "TW4", "TW5", "TW7", "TW8", "TW13", "TW14", "W4"], zone: "outer" },
  { name: "Hillingdon", osmName: "London Borough of Hillingdon", prefixes: ["UB3", "UB4", "UB7", "UB8", "UB9", "UB10", "HA4"], zone: "outer" },
  { name: "Harrow", osmName: "London Borough of Harrow", prefixes: ["HA1", "HA2", "HA3", "HA5", "HA7", "HA8"], zone: "outer" },
];

export const BOROUGH_NAMES = BOROUGHS.map((b) => b.name);

export function findBorough(name: string): Borough | null {
  const key = name.toLowerCase().trim();
  return (
    BOROUGHS.find(
      (b) =>
        b.name.toLowerCase() === key ||
        b.osmName.toLowerCase() === key ||
        b.osmName.toLowerCase().endsWith(key),
    ) ?? null
  );
}

/**
 * Places a postcode in a borough. Several boroughs share outward codes, so
 * the longest matching prefix wins and ties are left unresolved rather than
 * guessed at - a wrong borough is worse than a blank one.
 */
export function boroughForPostcode(postcode: string): string | null {
  const outward = postcode.toUpperCase().replace(/\s+/g, "").match(/^[A-Z]{1,2}\d[A-Z\d]?/);
  if (!outward) return null;
  const code = outward[0];

  let best: { name: string; length: number } | null = null;
  for (const borough of BOROUGHS) {
    for (const prefix of borough.prefixes) {
      if (code.startsWith(prefix) && (!best || prefix.length > best.length)) {
        best = { name: borough.name, length: prefix.length };
      }
    }
  }
  return best?.name ?? null;
}

/** True when a postcode is anywhere in Greater London. */
export function isLondonPostcode(postcode: string): boolean {
  return boroughForPostcode(postcode) !== null;
}
