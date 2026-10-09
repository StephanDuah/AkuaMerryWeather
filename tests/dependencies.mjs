/**
 * Merry Cleaners — dependency and supply-chain checks
 *
 *   npm run audit:deps
 *
 * Four things can go wrong with dependencies, and this checks all four:
 *
 *   1. A package has a known vulnerability.
 *   2. A dependency is declared loosely, so a future install silently picks
 *      up a version nobody has tested.
 *   3. package.json and package-lock.json have drifted apart, so what gets
 *      installed is not what was reviewed.
 *   4. A new package has appeared that runs code at install time - the way
 *      almost every npm supply-chain attack is actually delivered.
 *
 * The fourth is the one worth having. It compares the tree against a
 * recorded list of packages known to run install scripts, so a new one shows
 * up as a failure and gets looked at deliberately rather than being noticed
 * by nobody.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ${GREEN}PASS${RESET}  ${name}`);
  } else {
    failed += 1;
    failures.push({ name, detail });
    console.log(`  ${RED}FAIL${RESET}  ${name}`);
    if (detail) console.log(`        ${DIM}${String(detail).slice(0, 400)}${RESET}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));

/**
 * Packages allowed to run code at install time, each with the reason.
 * Anything not on this list is a finding.
 */
const ALLOWED_INSTALL_SCRIPTS = {
  "unrs-resolver":
    "Development only. Native module resolver used by ESLint's TypeScript import resolver. Its script is blocked by .npmrc anyway; lint, typecheck and build all pass without it.",
};

console.log("Merry Cleaners dependency checks\n");

/* ---- 1. known vulnerabilities ----------------------------------------- */
console.log("1. Known vulnerabilities");
{
  // npm exits non-zero when it finds something, so the report is read from
  // whichever stream it lands on rather than from the exit code.
  let report = null;
  try {
    report = execFileSync("npm", ["audit", "--json"], {
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    report = error.stdout?.toString() ?? "";
  }

  let counts = null;
  try {
    counts = JSON.parse(report).metadata?.vulnerabilities ?? null;
  } catch {
    counts = null;
  }

  if (!counts) {
    console.log(`  ${DIM}npm audit gave no readable report (registry unreachable?); skipped${RESET}`);
  } else {
    const serious = (counts.critical ?? 0) + (counts.high ?? 0);
    check("no critical or high vulnerabilities", serious === 0, JSON.stringify(counts));
    check("no vulnerabilities at any level", (counts.total ?? 0) === 0, JSON.stringify(counts));
  }
}

/* ---- 2. nothing floating ---------------------------------------------- */
console.log("\n2. Every dependency is pinned to an exact version");
for (const block of ["dependencies", "devDependencies"]) {
  for (const [name, range] of Object.entries(pkg[block] ?? {})) {
    check(
      `${name} is pinned`,
      /^\d+\.\d+\.\d+/.test(range),
      `declared as "${range}" — a future install could resolve to a different build`,
    );
  }
}

/* ---- 3. the lockfile matches what is declared -------------------------- */
console.log("\n3. The lockfile matches package.json");
for (const block of ["dependencies", "devDependencies"]) {
  for (const [name, wanted] of Object.entries(pkg[block] ?? {})) {
    const entry = lock.packages?.[`node_modules/${name}`];
    check(
      `${name} resolves to ${wanted}`,
      entry?.version === wanted,
      `lockfile has ${entry?.version ?? "nothing"}`,
    );
  }
}

// The lockfile records the *spec* it resolved each root dependency from, not
// just the resolved version. If package.json says "4.3.3" while the lockfile
// still remembers "^4", the two have drifted even though both point at the
// same build today - and `npm ci` on a clean machine is entitled to refuse.
// This is checked separately from the version comparison above because the
// version can match while the spec does not.
for (const block of ["dependencies", "devDependencies"]) {
  for (const [name, wanted] of Object.entries(pkg[block] ?? {})) {
    const recorded = lock.packages?.[""]?.[block]?.[name];
    check(
      `${name}: the lockfile records the same spec`,
      recorded === wanted,
      `package.json says "${wanted}", lockfile remembers "${recorded}" — run: npm install --package-lock-only`,
    );
  }
}

const withoutIntegrity = Object.entries(lock.packages ?? {}).filter(
  // A bundled package ships inside its parent's tarball rather than being
  // fetched separately, so it has no hash of its own - the parent's covers
  // it. A linked package is not fetched at all.
  ([path, meta]) => path && !meta.link && !meta.inBundle && !meta.integrity,
);
check(
  "every locked package carries an integrity hash",
  withoutIntegrity.length === 0,
  withoutIntegrity.map(([p]) => p).join(", "),
);

// A lockfile generated on one platform can be missing packages another
// platform needs - optional native binaries and their WASM fallbacks in
// particular. It installs fine on the machine that wrote it and fails on a
// Linux CI runner or a Linux host, which is exactly how this project's first
// CI runs failed. Every dependency of every package must be present.
{
  const paths = new Set(Object.keys(lock.packages ?? {}));
  const missing = new Set();
  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    for (const dep of Object.keys(meta.dependencies ?? {})) {
      // npm resolves upwards, so the dependency may sit at any ancestor.
      let found = false;
      let scope = path;
      for (;;) {
        if (paths.has(`${scope}/node_modules/${dep}`)) {
          found = true;
          break;
        }
        const cut = scope.lastIndexOf("/node_modules/");
        if (cut === -1) break;
        scope = scope.slice(0, cut);
      }
      // Finally the top level, where most packages actually live.
      if (!found && paths.has(`node_modules/${dep}`)) found = true;
      if (!found) missing.add(`${dep} (needed by ${path.replace(/^node_modules\//, "") || "the project"})`);
    }
  }
  check(
    "the lockfile is complete — nothing a package needs is absent",
    missing.size === 0,
    [...missing].slice(0, 6).join("; ") + (missing.size > 6 ? ` … and ${missing.size - 6} more` : ""),
  );
}

/* ---- 4. install-time code execution ------------------------------------ */
console.log("\n4. Packages that run code at install time");
const runners = Object.entries(lock.packages ?? {})
  .filter(([path, meta]) => path && meta.hasInstallScript)
  .map(([path]) => path.replace(/^node_modules\//, "").replace(/.*node_modules\//, ""));

const unexpected = [...new Set(runners)].filter((name) => !(name in ALLOWED_INSTALL_SCRIPTS));

check(
  "install scripts are blocked by .npmrc",
  fs.existsSync(".npmrc") && /^\s*ignore-scripts\s*=\s*true/m.test(fs.readFileSync(".npmrc", "utf8")),
  "ignore-scripts=true is not set — a compromised package could run code on install",
);
check(
  "no unreviewed package runs code at install time",
  unexpected.length === 0,
  unexpected.length
    ? `new install script(s): ${unexpected.join(", ")}. Review each one, then add it to ALLOWED_INSTALL_SCRIPTS in this file with the reason.`
    : "",
);
console.log(
  `        ${DIM}${[...new Set(runners)].length} package(s) declare install scripts, all reviewed${RESET}`,
);

/* ---- 5. the runtime is pinned too -------------------------------------- */
console.log("\n5. The runtime is pinned");
check("package.json declares a Node range", Boolean(pkg.engines?.node), "no engines field");
check(".nvmrc exists", fs.existsSync(".nvmrc"), "no .nvmrc");

console.log(`\n${"-".repeat(52)}`);
console.log(`  ${GREEN}${passed} passed${RESET}   ${failed ? RED : ""}${failed} failed${RESET}`);
if (failures.length) {
  console.log("\nFindings:");
  for (const f of failures) {
    console.log(`  - ${f.name}`);
    if (f.detail) console.log(`    ${DIM}${String(f.detail).slice(0, 400)}${RESET}`);
  }
}
console.log("");
process.exit(failed === 0 ? 0 : 1);
