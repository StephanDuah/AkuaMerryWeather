/**
 * Merry Cleaners — field error tests
 *
 *   npm run dev              # in one terminal
 *   npm run test:field-errors # in another
 *
 * Every public endpoint used to answer a bad submission with one sentence —
 * "Please check the details supplied." — which tells the customer that
 * something is wrong and nothing about what.
 *
 * The rule these enforce: **a refused submission must always name the field
 * that caused it**, and the message must be one a customer can act on
 * without knowing how the system is built.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;
const failures = [];

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ${GREEN}PASS${RESET}  ${name}`);
  } else {
    failed += 1;
    failures.push({ name, detail });
    console.log(`  ${RED}FAIL${RESET}  ${name}`);
    if (detail) console.log(`        ${DIM}${String(detail).slice(0, 300)}${RESET}`);
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

async function post(path, body, attempt = 1) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 429 && attempt <= 3) {
    const wait = Number(r.headers.get("retry-after") ?? 20);
    console.log(`        ${DIM}rate limited; waiting ${wait}s${RESET}`);
    await new Promise((res) => setTimeout(res, wait * 1000 + 1000));
    return post(path, body, attempt + 1);
  }
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Developer wording that must never reach a customer. */
// Case-sensitive on NaN deliberately: a case-insensitive "nan" matches
// inside "tenancy", and failed a perfectly good message.
const DEVELOPER_SPEAK =
  /string must contain|expected string|invalid_type|received undefined|\bNaN\b|\bzod\b|\bregex\b|at least \d+ character/;

function assertUsable(fields, label) {
  for (const [field, message] of Object.entries(fields ?? {})) {
    check(
      `${label}: "${field}" is explained in plain English`,
      typeof message === "string" &&
        message.length > 12 &&
        !DEVELOPER_SPEAK.test(message),
      `${field}: ${message}`,
    );
  }
}

const VALID_QUOTE = {
  service_type: "domestic",
  postcode: "E8 1EJ",
  bedrooms: 3,
  tier: "regular",
  addons: [],
};

async function run() {
  console.log("Merry Cleaners field error tests");
  console.log(`${DIM}target: ${BASE}${RESET}`);

  await scenario(1, "A missing postcode names the postcode", async () => {
    const { body } = await post("/api/quote", { ...VALID_QUOTE, postcode: "" });
    check("the submission is refused", body.ok === false, JSON.stringify(body).slice(0, 160));
    check("postcode is named", Boolean(body.fields?.postcode), JSON.stringify(body.fields));
    check(
      "the cursor is sent to it",
      body.focus === "postcode",
      String(body.focus),
    );
    check(
      "the message says what to do",
      /postcode/i.test(body.fields?.postcode ?? ""),
      body.fields?.postcode,
    );
    assertUsable(body.fields, "missing postcode");
  });

  await scenario(2, "A bad service names the service", async () => {
    const { body } = await post("/api/quote", { ...VALID_QUOTE, service_type: "gardening" });
    check("refused", body.ok === false, JSON.stringify(body).slice(0, 160));
    check("service_type is named", Boolean(body.fields?.service_type), JSON.stringify(body.fields));
    assertUsable(body.fields, "bad service");
  });

  await scenario(3, "An impossible bedroom count names the bedrooms", async () => {
    const { body } = await post("/api/quote", { ...VALID_QUOTE, bedrooms: 99 });
    check("refused", body.ok === false, JSON.stringify(body).slice(0, 160));
    check("bedrooms is named", Boolean(body.fields?.bedrooms), JSON.stringify(body.fields));
    assertUsable(body.fields, "bad bedrooms");
  });

  await scenario(4, "Several bad fields are all named at once", async () => {
    const { body } = await post("/api/quote", {
      service_type: "gardening",
      postcode: "",
      bedrooms: 99,
      addons: [],
    });
    const named = Object.keys(body.fields ?? {});
    check("more than one field is reported", named.length >= 2, JSON.stringify(body.fields));
    check(
      "the summary lists them rather than saying 'check the details'",
      !/^please check the details supplied\.?$/i.test(body.message ?? ""),
      body.message,
    );
    assertUsable(body.fields, "several bad fields");
  });

  await scenario(5, "A property too large names the size, not the form", async () => {
    const { body } = await post("/api/quote", { ...VALID_QUOTE, bedrooms: 8 });
    check("refused rather than guessed at", body.ok === false, JSON.stringify(body).slice(0, 160));
    check(
      "bedrooms is named",
      Boolean(body.fields?.bedrooms),
      JSON.stringify(body.fields ?? body),
    );
    check(
      "and it offers a tailored quote rather than an error",
      /tailored|team/i.test(body.fields?.bedrooms ?? body.message ?? ""),
      body.fields?.bedrooms ?? body.message,
    );
  });

  await scenario(6, "An address outside London names the postcode", async () => {
    const { body } = await post("/api/quote", { ...VALID_QUOTE, postcode: "M1 1AA" });
    check("refused", body.ok === false, JSON.stringify(body).slice(0, 160));
    check("postcode is named", Boolean(body.fields?.postcode), JSON.stringify(body.fields ?? body));
    check(
      "and says why",
      /london/i.test(body.fields?.postcode ?? ""),
      body.fields?.postcode,
    );
  });

  await scenario(7, "The enquiry form names its fields too", async () => {
    const { body } = await post("/api/leads", {
      name: "",
      email: "not-an-email",
      postcode: "E8 1EJ",
      service_type: "domestic",
      bedrooms: 2,
      addons: [],
      consent: true,
    });
    check("refused", body.ok === false, JSON.stringify(body).slice(0, 180));
    const named = Object.keys(body.fields ?? {});
    check("at least one field is named", named.length >= 1, JSON.stringify(body.fields));
    if (body.fields?.email) {
      check(
        "the email message is about the email",
        /email/i.test(body.fields.email),
        body.fields.email,
      );
    }
    assertUsable(body.fields, "enquiry form");
  });

  await scenario(8, "The booking form names its fields too", async () => {
    const { body } = await post("/api/bookings", {
      customer_name: "A",
      postcode: "E8 1EJ",
      address: "",
      service_type: "domestic",
      addons: [],
      date: "not-a-date",
      slot: "midnight",
    });
    check("refused", body.ok === false, JSON.stringify(body).slice(0, 180));
    const named = Object.keys(body.fields ?? {});
    check("the bad fields are named", named.length >= 2, JSON.stringify(body.fields));
    assertUsable(body.fields, "booking form");
  });

  await scenario(9, "A valid submission is not disturbed", async () => {
    const { body } = await post("/api/quote", VALID_QUOTE);
    check("it succeeds", body.ok === true, JSON.stringify(body).slice(0, 160));
    check("no field errors are attached", !body.fields, JSON.stringify(body.fields));
    check("and it is the published price", body.low === 155, `low=${body.low}`);
  });

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
