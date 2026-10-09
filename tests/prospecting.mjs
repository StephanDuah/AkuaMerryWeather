/**
 * Merry Cleaners — prospecting pipeline tests
 *
 * Exercises the pipeline through the real admin API against a running
 * instance. Live-source discovery is tested against OpenStreetMap, which is
 * genuinely free and permits automated queries; everything downstream
 * (dedupe, classify, qualify, suppress) is tested with synthetic rows that
 * are clearly marked as test data and removed afterwards.
 *
 *   npm run dev              # in one terminal
 *   npm run test:prospecting # in another
 */

import crypto from "node:crypto";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;
const failures = [];

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

/** Mints an admin session the same way the app does. */
function adminCookie() {
  const env = fs.readFileSync(".env.local", "utf8");
  const secret =
    env.match(/^ADMIN_SESSION_SECRET=(.+)$/m)?.[1]?.trim() ||
    `dev-secret-${env.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim() ?? "merry-admin"}`;
  const expires = Date.now() + 3600_000;
  const payload = `admin.${expires}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `mc_admin_session=${payload}.${sig}`;
}

const COOKIE = adminCookie();

async function api(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Cookie: COOKIE },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: { raw: text.slice(0, 300) } };
  }
}

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ${GREEN}PASS${RESET}  ${name}`);
  } else {
    failed += 1;
    failures.push({ name, detail });
    console.log(`  ${RED}FAIL${RESET}  ${name}`);
    if (detail) console.log(`        ${DIM}${String(detail).slice(0, 260)}${RESET}`);
  }
}

async function scenario(n, title, fn) {
  console.log(`\n${n}. ${title}`);
  try {
    await fn();
  } catch (error) {
    failed += 1;
    failures.push({ name: title, detail: error.message });
    console.log(`  ${RED}ERROR${RESET} ${error.message}`);
  }
}

const TEST_PREFIX = "ZZTEST";

async function run() {
  console.log("Merry Cleaners prospecting test suite");
  console.log(`${DIM}target: ${BASE}${RESET}`);

  const health = await api("/api/prospecting/sources");
  if (health.status !== 200) {
    console.error(
      `\n${RED}Cannot reach the prospecting API (${health.status}). Is the server running?${RESET}`,
    );
    console.error(JSON.stringify(health.body).slice(0, 300));
    process.exit(2);
  }

  await scenario(1, "Source availability is reported honestly", async () => {
    const { body } = await api("/api/prospecting/sources");
    const osm = body.sources?.find((s) => s.id === "openstreetmap");
    const ch = body.sources?.find((s) => s.id === "companies_house");
    check("OpenStreetMap is available (free, no key)", osm?.available === true, JSON.stringify(osm));
    check(
      "Companies House states why it is unavailable when no key is set",
      ch?.available === true || typeof ch?.reason === "string",
      JSON.stringify(ch),
    );
  });

  await scenario(2, "CSV import: classify, qualify, provenance", async () => {
    const csv = [
      "Company,Website,Email,Phone,Postcode,Type",
      `${TEST_PREFIX} Camden Lettings Ltd,https://example.invalid,info@example.invalid,020 7946 0001,NW1 8AB,Letting agent`,
      `${TEST_PREFIX} Southwark Property Management,https://example2.invalid,,020 7946 0002,SE1 9SG,Property management`,
      `${TEST_PREFIX} Manchester Estates,https://example3.invalid,,0161 496 0003,M1 1AA,Estate agent`,
    ].join("\n");

    const { body } = await api("/api/prospecting/import", { csv, markAsTest: true });
    check("import accepted", body.ok === true, JSON.stringify(body).slice(0, 200));
    check(
      "two London rows imported, non-London row rejected",
      body.summary?.new_prospects === 2,
      JSON.stringify(body.summary),
    );
    check(
      "the Manchester row was skipped with a stated reason",
      (body.skipped ?? []).some((s) => /not in Greater London/i.test(s.reason)),
      JSON.stringify(body.skipped),
    );
  });

  await scenario(3, "Deduplication merges rather than duplicating", async () => {
    const csv = [
      "Company,Website,Postcode",
      `${TEST_PREFIX} Camden Lettings Limited,https://example.invalid,NW1 8AB`,
    ].join("\n");
    const { body } = await api("/api/prospecting/import", { csv, markAsTest: true });
    check(
      "same domain recognised as the same organisation",
      body.summary?.duplicates_merged === 1 && body.summary?.new_prospects === 0,
      JSON.stringify(body.summary),
    );
  });

  await scenario(4, "Prospects carry provenance and transparent priority", async () => {
    const { body } = await api("/api/prospecting/prospects?test=1");
    const p = (body.prospects ?? []).find((x) => x.company_name.includes("Camden Lettings"));
    check("prospect found", Boolean(p), JSON.stringify(body).slice(0, 200));
    if (!p) return;
    check("has at least one provenance record", (p.provenance ?? []).length > 0, "");
    check("records its source", (p.sources ?? []).includes("manual_csv"), JSON.stringify(p.sources));
    check(
      "priority is explained by named factors",
      Array.isArray(p.qualification?.factors) && p.qualification.factors.length >= 5,
      JSON.stringify(p.qualification?.factors?.length),
    );
    check(
      "reasoning is human-readable",
      typeof p.qualification?.reasoning === "string" && p.qualification.reasoning.length > 30,
      p.qualification?.reasoning,
    );
    check(
      "classified as a letting agent",
      p.business_type === "letting_agent" || p.business_type === "estate_agent",
      p.business_type,
    );
    check(
      "potential services identified, framed as potential",
      (p.qualification?.potential_services ?? []).includes("end_of_tenancy"),
      JSON.stringify(p.qualification?.potential_services),
    );
    check(
      "is NOT counted as a lead",
      !["interested", "qualified_lead", "customer"].includes(p.status),
      p.status,
    );
    check("marked as test data", p.is_test === true, String(p.is_test));
  });

  await scenario(5, "Excluded sectors are never prospected", async () => {
    const csv = [
      "Company,Postcode",
      `${TEST_PREFIX} St Mary Primary School,SW1A 1AA`,
      `${TEST_PREFIX} Royal London Hospital Trust,E1 1BB`,
    ].join("\n");
    await api("/api/prospecting/import", { csv, markAsTest: true });
    const { body } = await api("/api/prospecting/prospects?test=1");
    const excluded = (body.prospects ?? []).filter(
      (p) => /School|Hospital/i.test(p.company_name),
    );
    check("they are imported but classified irrelevant", excluded.length === 2, String(excluded.length));
    check(
      "every one is marked not suitable",
      excluded.every((p) => p.status === "not_suitable" && p.business_type === "irrelevant"),
      JSON.stringify(excluded.map((p) => [p.business_type, p.status])),
    );
    check(
      "no service is proposed for them",
      excluded.every((p) => (p.qualification?.potential_services ?? []).length === 0),
      "",
    );
  });

  await scenario(6, "Do-not-contact suppression is permanent", async () => {
    const add = await api("/api/prospecting/suppress", {
      identifier: "example.invalid",
      identifier_type: "domain",
      reason: "Test suppression",
    });
    check("suppression recorded", add.body.ok === true, JSON.stringify(add.body));

    const csv = [
      "Company,Website,Postcode",
      `${TEST_PREFIX} Blocked Agency,https://example.invalid,NW1 8AB`,
    ].join("\n");
    const { body } = await api("/api/prospecting/import", { csv, markAsTest: true });
    check(
      "a suppressed domain is excluded from import",
      body.summary?.suppressed === 1 && body.summary?.new_prospects === 0,
      JSON.stringify(body.summary),
    );
  });

  await scenario(7, "Live discovery from OpenStreetMap", async () => {
    const { body } = await api("/api/prospecting/discover", {
      businessTypes: ["estate_agent"],
      borough: "Camden",
      limit: 6,
      markAsTest: true,
      verify: false,
    });
    check("discovery ran", body.ok === true, JSON.stringify(body).slice(0, 240));
    if (!body.ok) return;

    // OpenStreetMap rate-limits by IP. Backing off is the REQUIRED
    // behaviour, so a throttle is a pass, not a failure - what would fail
    // is retrying through it.
    const throttled = (body.summary?.errors ?? []).some((e) =>
      /slow down|rate limit/i.test(e),
    );
    if (throttled) {
      check(
        "rate limit respected: stopped rather than retrying",
        (body.summary?.candidates_found ?? 0) === 0,
        JSON.stringify(body.summary?.errors),
      );
      console.log(
        `        ${DIM}OpenStreetMap throttled this run; back-off verified instead of discovery.${RESET}`,
      );
      return;
    }

    check(
      "real organisations were found",
      (body.summary?.candidates_found ?? 0) > 0,
      JSON.stringify(body.summary),
    );
    check(
      "every one carries a source URL",
      body.sample?.every((p) => typeof p.source_url === "string" && p.source_url.length > 0),
      JSON.stringify(body.sample?.slice(0, 2)),
    );
    check(
      "all placed in London",
      body.sample?.every((p) => p.borough !== null),
      JSON.stringify(body.sample?.map((p) => p.borough)),
    );
  });

  await scenario(8, "Report separates prospects from leads", async () => {
    const { body } = await api("/api/prospecting/report?test=1");
    check("report generated", body.ok === true, JSON.stringify(body).slice(0, 200));
    check(
      "counts prospects and leads separately",
      typeof body.report?.prospects_total === "number" &&
        typeof body.report?.actual_leads === "number",
      JSON.stringify(body.report),
    );
    check(
      "no prospect is counted as a lead",
      body.report?.actual_leads === 0,
      `actual_leads=${body.report?.actual_leads}`,
    );
    check(
      "sources used are named",
      Array.isArray(body.report?.sources_used),
      JSON.stringify(body.report?.sources_used),
    );
  });

  await scenario(9, "A named individual's email address is never stored", async () => {
    const csv = [
      "Company,Website,Email,Phone,Postcode,Type",
      `${TEST_PREFIX} Personal Contact Agency,https://personal.invalid,sarah.jones@personal.invalid,020 7946 0009,N1 2AA,Letting agent`,
      `${TEST_PREFIX} General Mailbox Agency,https://general.invalid,lettings@general.invalid,020 7946 0010,N1 3AA,Letting agent`,
    ].join("\n");
    await api("/api/prospecting/import", { csv, markAsTest: true });

    const { body } = await api("/api/prospecting/prospects?test=1");
    const personal = (body.prospects ?? []).find((p) =>
      p.company_name.includes("Personal Contact Agency"),
    );
    const general = (body.prospects ?? []).find((p) =>
      p.company_name.includes("General Mailbox Agency"),
    );

    check("the row was imported", Boolean(personal), JSON.stringify(body).slice(0, 160));
    if (!personal) return;
    check(
      "a person's address is not stored on the record",
      personal.email === null,
      String(personal.email),
    );
    check(
      "and the record says why, so the owner is not left guessing",
      personal.flags.some((f) => /naming an individual/i.test(f)),
      JSON.stringify(personal.flags),
    );
    check(
      "a general business mailbox is still kept",
      general?.email === "lettings@general.invalid",
      String(general?.email),
    );
  });

  await scenario(10, "Every stored field carries its own evidence", async () => {
    const { body } = await api("/api/prospecting/prospects?test=1");
    const p = (body.prospects ?? []).find((x) =>
      x.company_name.includes("General Mailbox Agency"),
    );
    check("prospect found", Boolean(p), "");
    if (!p) return;

    const fields = new Set((p.provenance ?? []).map((e) => e.field));
    for (const field of ["company_name", "website", "email", "phone", "postcode", "borough"]) {
      check(`provenance recorded for ${field}`, fields.has(field), [...fields].join(", "));
    }
    check(
      "every line of evidence names a source and a confidence",
      (p.provenance ?? []).every((e) => e.source && e.reliability),
      JSON.stringify(p.provenance?.[0]),
    );
  });

  await scenario(11, "No approach is drafted for an unverified prospect", async () => {
    const { body } = await api("/api/prospecting/prospects?test=1");
    const p = (body.prospects ?? []).find((x) =>
      x.company_name.includes("General Mailbox Agency"),
    );
    if (!p) {
      check("prospect found", false, "");
      return;
    }
    const response = await fetch(`${BASE}/admin/prospects/${p.id}`, {
      headers: { Cookie: COOKIE },
    });
    const html = await response.text();
    check("the record opens", response.status === 200, String(response.status));
    check(
      "it refuses to draft an approach",
      html.includes("No approach can be prepared"),
      "a draft was offered for a prospect that has never been verified",
    );
    check(
      "it states that verification is what is missing",
      /Not verified yet/.test(html),
      "no reason given",
    );
    check(
      "it warns that this is test data",
      html.includes("NOT A REAL PROSPECT"),
      "test records must be labelled",
    );
  });

  // ---- clean up every test record --------------------------------------
  console.log(`\n${DIM}removing test prospects…${RESET}`);
  const purge = await api("/api/prospecting/purge-test", { confirm: true });
  console.log(`${DIM}  removed ${purge.body?.removed ?? "?"} test record(s)${RESET}`);

  console.log(`\n${"-".repeat(52)}`);
  console.log(`  ${GREEN}${passed} passed${RESET}   ${failed ? RED : ""}${failed} failed${RESET}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - ${f.name}`);
      if (f.detail) console.log(`    ${DIM}${String(f.detail).slice(0, 300)}${RESET}`);
    }
  }
  console.log("");
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(2);
});
