/**
 * Merry Cleaners — pricing tests
 *
 * Checks that the quote engine reproduces Merry_Cleaners_Price_List.docx
 * exactly, and that the services the list does not cover still refuse to
 * quote rather than falling back to a formula.
 *
 * These are the client's real published prices. If one of these assertions
 * fails, a customer is being told a figure the business does not charge.
 *
 *   npm run dev           # in one terminal
 *   npm run test:pricing  # in another
 */
const BASE = "http://localhost:3000";

const PUBLISHED = {
  regular: { 1: 95, 2: 125, 3: 155, 4: 195, 5: 240 },
  deep: { 1: 200, 2: 295, 3: 395, 4: 520, 5: 650 },
};

let ok = 0;
let bad = 0;
const check = (name, cond, detail = "") => {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${name}${cond ? "" : "   -> " + detail}`);
  cond ? ok++ : bad++;
};

/**
 * Asks for a quote, waiting out the rate limiter rather than reporting its
 * refusal as a pricing failure. This suite makes twenty requests, so running
 * it twice inside a minute would otherwise trip the public limit and look
 * like the prices had changed.
 */
const quote = async (body, attempt = 1) => {
  const r = await fetch(`${BASE}/api/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 429 && attempt <= 3) {
    const wait = Number(r.headers.get("retry-after") ?? 20) * 1000;
    console.log(`        ${"[2m"}rate limited; waiting ${Math.round(wait / 1000)}s${"[0m"}`);
    await new Promise((resolve) => setTimeout(resolve, wait + 1000));
    return quote(body, attempt + 1);
  }
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

console.log("\nPUBLISHED PRICES — must match the document exactly");
for (const [tier, rows] of Object.entries(PUBLISHED)) {
  for (const [beds, expected] of Object.entries(rows)) {
    const { body } = await quote({
      service_type: "domestic",
      postcode: "E8 1EJ",
      bedrooms: Number(beds),
      tier,
      addons: [],
    });
    const q = body.quote ?? body;
    check(
      `${tier} ${beds}-bed = £${expected}`,
      body.ok === true && q.low === expected && q.high === expected,
      JSON.stringify(body).slice(0, 160),
    );
  }
}

console.log("\nPRICE IS THE SAME ACROSS LONDON (the list quotes one price)");
for (const pc of ["EC1A 1BB", "E8 1EJ", "HA8 7AA", "BR1 1AA"]) {
  const { body } = await quote({
    service_type: "domestic",
    postcode: pc,
    bedrooms: 3,
    tier: "regular",
    addons: [],
  });
  const q = body.quote ?? body;
  check(`${pc} 3-bed regular = £155`, q?.low === 155, JSON.stringify(body).slice(0, 140));
}

console.log("\nUPSELLS");
const withOven = await quote({
  service_type: "domestic",
  postcode: "E8 1EJ",
  bedrooms: 3,
  tier: "deep",
  addons: ["oven_deep_clean"],
});
const q1 = withOven.body.quote ?? withOven.body;
check("3-bed deep + oven = £395 + £65 = £460", q1?.low === 460, JSON.stringify(withOven.body).slice(0, 160));

const twoAddons = await quote({
  service_type: "domestic",
  postcode: "E8 1EJ",
  bedrooms: 2,
  tier: "regular",
  addons: ["carpet_clean_room", "balcony_terrace"],
});
const q2 = twoAddons.body.quote ?? twoAddons.body;
check("2-bed regular + carpet + balcony = £125 + £45 + £40 = £210", q2?.low === 210, JSON.stringify(twoAddons.body).slice(0, 160));

console.log("\nDEFAULTS AND LIMITS");
const noTier = await quote({ service_type: "domestic", postcode: "E8 1EJ", bedrooms: 2, addons: [] });
const q3 = noTier.body.quote ?? noTier.body;
check("no tier given defaults to the regular clean (£125)", q3?.low === 125, JSON.stringify(noTier.body).slice(0, 140));

const tooBig = await quote({ service_type: "domestic", postcode: "E8 1EJ", bedrooms: 7, tier: "regular", addons: [] });
check(
  "7 bedrooms is beyond the list, so no price is invented",
  tooBig.body.ok === false && /tailored/i.test(tooBig.body.message ?? ""),
  JSON.stringify(tooBig.body).slice(0, 180),
);

console.log("\nSERVICES THE LIST DOES NOT COVER MUST STILL DEFER");
const eot = await quote({ service_type: "end_of_tenancy", postcode: "E8 1EJ", bedrooms: 3, addons: [] });
check(
  "end of tenancy gives no price",
  eot.body.ok === false && /confirmed by a member of the team/i.test(eot.body.message ?? ""),
  JSON.stringify(eot.body).slice(0, 180),
);
const office = await quote({ service_type: "office", postcode: "E8 1EJ", floor_area_sqft: 2000, addons: [] });
check(
  "office gives no price",
  office.body.ok === false && /confirmed by a member of the team/i.test(office.body.message ?? ""),
  JSON.stringify(office.body).slice(0, 180),
);

console.log(`\n${"-".repeat(52)}\n  ${ok} passed   ${bad} failed\n`);
process.exit(bad === 0 ? 0 : 1);
