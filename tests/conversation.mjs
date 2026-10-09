/**
 * Merry Cleaners — conversation quality tests
 *
 *   npm run dev              # in one terminal
 *   npm run test:conversation # in another
 *
 * These exist because of a real failure: the assistant answered every message
 * with the same sentence. A visitor typed "Which part of london" and was told
 * to pick one of three services — then told it again, and again.
 *
 * So the rule these enforce is blunt: **the assistant must never send the same
 * message twice in a row**, and a question must be answered rather than
 * funnelled. Everything else here is a variation on those two.
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
    if (detail) console.log(`        ${DIM}${String(detail).slice(0, 320)}${RESET}`);
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

/** Holds one conversation, returning every reply in order. */
async function converse(lines) {
  const messages = [];
  const replies = [];
  let leadId = null;

  for (const line of lines) {
    messages.push({ role: "user", content: line });
    let response;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      response = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, leadId }),
      });
      if (response.status !== 429) break;
      const wait = Number(response.headers.get("retry-after") ?? 20);
      console.log(`        ${DIM}rate limited; waiting ${wait}s${RESET}`);
      await new Promise((r) => setTimeout(r, wait * 1000 + 1000));
    }
    const body = await response.json().catch(() => ({}));
    const text = body.reply ?? "";
    replies.push(text);
    messages.push({ role: "assistant", content: text });
    leadId = body.leadId ?? leadId;
  }
  return replies;
}

const normalise = (t) =>
  t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** The failure that started this: the same words, over and over. */
function assertNoRepeats(replies, label) {
  const seen = new Map();
  let repeated = null;
  for (const reply of replies) {
    const key = normalise(reply);
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (seen.get(key) > 1) repeated = reply;
  }
  check(
    `${label}: never says the same thing twice`,
    repeated === null,
    repeated ? `repeated: "${repeated.slice(0, 140)}"` : "",
  );
}

async function run() {
  console.log("Merry Cleaners conversation tests");
  console.log(`${DIM}target: ${BASE}${RESET}`);

  /* ---- the exact conversation from the bug report -------------------- */
  await scenario(1, "The reported loop: asking where they cover", async () => {
    const replies = await converse([
      "Which part of london",
      "Which part of london",
      "so where do you cover",
    ]);
    assertNoRepeats(replies, "coverage question");
    check(
      "the first reply actually answers the question",
      /greater london/i.test(replies[0]) && !/which of the three/i.test(replies[0].slice(0, 80)),
      replies[0],
    );
    check(
      "it does not just list the three services",
      !replies.every((r) => /which of the three can we help you with/i.test(r)),
      replies.join(" || ").slice(0, 200),
    );
  });

  /* ---- questions the knowledge base can answer ----------------------- */
  await scenario(2, "Common questions get real answers", async () => {
    const cases = [
      ["are you insured", /public liability|insur/i],
      ["do you bring your own products", /equipment|product|bring/i],
      ["what are your opening hours", /monday|saturday|hours|08|18/i],
      ["are your cleaners vetted", /dbs|vetted|checked|reference/i],
    ];
    for (const [question, expected] of cases) {
      const [reply] = await converse([question]);
      check(`"${question}" is answered`, expected.test(reply), reply.slice(0, 160));
    }
  });

  /* ---- a question with no answer on file ----------------------------- */
  await scenario(3, "An unanswerable question is handed over, not guessed", async () => {
    const [reply] = await converse(["do you clean swimming pools in surrey"]);
    check(
      "it does not invent an answer",
      !/yes we (do|clean)/i.test(reply),
      reply.slice(0, 200),
    );
    check(
      "it offers a person or a phone number",
      /team|call us|07|\+44/i.test(reply),
      reply.slice(0, 200),
    );
  });

  /* ---- the funnel still works, and still does not repeat ------------- */
  await scenario(4, "A normal enquiry reaches a price", async () => {
    const replies = await converse([
      "I need a regular clean for my home",
      "E8 1EJ",
      "3 bedrooms",
    ]);
    assertNoRepeats(replies, "domestic enquiry");
    const last = replies[replies.length - 1];
    check("it quotes the published price of £155", /£155/.test(last), last.slice(0, 220));
    check(
      "it states it as a price, not a range of one number",
      !/£155 to £155|region of £155 to £155/i.test(last),
      last.slice(0, 220),
    );
  });

  await scenario(5, "A deep clean is priced as a deep clean", async () => {
    const replies = await converse([
      "I would like a deep clean of my flat",
      "N1 1AA",
      "2 bedrooms",
    ]);
    const last = replies[replies.length - 1];
    check("quotes £295, not the regular £125", /£295/.test(last), last.slice(0, 220));
  });

  /* ---- awkward visitors ---------------------------------------------- */
  await scenario(6, "A visitor who will not answer is handed to a person", async () => {
    const replies = await converse(["hello", "hmm", "not sure", "dunno really"]);
    assertNoRepeats(replies, "unhelpful answers");
    const last = replies[replies.length - 1];
    check(
      "it eventually offers a person rather than asking again",
      /team|call us|telephone|07|\+44/i.test(last),
      last.slice(0, 200),
    );
  });

  await scenario(7, "Greetings are answered like a person would", async () => {
    const [hello] = await converse(["hi"]);
    check("says hello back", /hello|thank you for getting in touch/i.test(hello), hello.slice(0, 140));
    check("and still offers to help", /help|cleaning/i.test(hello), hello.slice(0, 140));
  });

  await scenario(8, "A question mid-enquiry is answered without losing the thread", async () => {
    const replies = await converse([
      "I need an end of tenancy clean",
      "are you insured?",
    ]);
    assertNoRepeats(replies, "mid-enquiry question");
    check(
      "the insurance question is answered",
      /public liability|insur/i.test(replies[1]),
      replies[1].slice(0, 200),
    );
    check(
      "and it still moves the enquiry along",
      /postcode/i.test(replies[1]),
      replies[1].slice(0, 200),
    );
  });

  console.log(`\n${"-".repeat(52)}`);
  console.log(`  ${GREEN}${passed} passed${RESET}   ${failed ? RED : ""}${failed} failed${RESET}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - ${f.name}`);
      if (f.detail) console.log(`    ${DIM}${String(f.detail).slice(0, 320)}${RESET}`);
    }
  }
  console.log("");
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(2);
});
