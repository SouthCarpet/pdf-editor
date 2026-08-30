// Phase 18 Task 90j, hardened under plan 029.
//
// Original job: scan src for t("...") calls and fail if a called key is
// missing from en or sk. That check is necessary and it is not sufficient. It
// validates that CALLED keys EXIST; it never validates that EXISTING keys are
// CALLED, and it never sees text that skipped t() altogether.
//
// Both gaps were live on 2026-08-02. src/locales/sk/tools.json held 185 keys
// matching en exactly and exactly two of them were reached, so the app showed
// Slovak titles over English body text while this script printed
// "[OK] i18n parity: 182 key(s) covered in both en + sk". A green gate over
// 183 unused Slovak strings.
//
// Three checks now, each able to fail the build:
//   1. PARITY   en and sk must hold the same key set.
//   2. MISSING  every called key exists in both. (the original check)
//   3. UNUSED   every catalog key is called, unless allow-listed as dynamic.
//   4. ERRORS   every key produced by Rust AppError exists in both catalogs.
//   5. LITERAL  no hardcoded user-facing attribute or JSX text node.
//
// Checks 3 and 4 carry allowlists rather than thresholds. A threshold rots
// quietly; an allowlist entry has to be written by a person who can be asked
// why. Keep them short and justify each line.
//
// Run: node scripts/check-i18n.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { createHash } from "node:crypto";

const SRC = "src";
const LOCALES = ["src/locales/en", "src/locales/sk"];
const APP_ERROR_SOURCE = "src-tauri/src/error.rs";
const SHORTCUT_SOURCE = "src/components/workspace/shortcuts.ts";
const KEY_RE = /\bt\(\s*["'`]([A-Za-z0-9_.:-]+)["'`]/g;
const SHORTCUT_LABEL_RE = /\blabelKey:\s*["']([A-Za-z0-9_.:-]+)["']/g;

// Key families built at runtime, so no literal call site exists to find.
// Each entry is a prefix. Justify every addition.
const DYNAMIC_KEY_PREFIXES = [
  // errors are looked up by code: t(`errors:${err.code}`)
  "errors:",
];

// Files whose literal strings are deliberately not translated.
const LITERAL_FILE_ALLOW = [
  // Generated. Do not hand-edit, so do not police either.
  "src/bindings.ts",
  "src/routeTree.gen.ts",
];

// Attributes that reach a user and therefore must come from the catalog.
const USER_FACING_ATTRS = ["aria-label", "placeholder", "title", "alt"];

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if ([".ts", ".tsx"].includes(extname(f))) out.push(p);
  }
  return out;
}

function loadLocale(dir) {
  const merged = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const ns = f.replace(/\.json$/, "");
    const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const flatten = (obj, prefix) => {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === "object" && !Array.isArray(v)) flatten(v, key);
        else merged[`${ns}:${key}`] = v;
      }
    };
    flatten(data, "");
  }
  return merged;
}

const files = walk(SRC);
const calledKeys = new Set();
for (const f of files) {
  for (const m of readFileSync(f, "utf8").matchAll(KEY_RE)) calledKeys.add(m[1]);
}
for (const match of readFileSync(SHORTCUT_SOURCE, "utf8").matchAll(SHORTCUT_LABEL_RE)) {
  const key = match[1];
  calledKeys.add(key.includes(":") ? key : `workspace:${key}`);
}

const locales = LOCALES.map((d) => ({ dir: d, data: loadLocale(d) }));
const [en, sk] = locales;
const namespaces = Array.from(new Set(Object.keys(en.data).map((k) => k.split(":")[0])));

const failures = [];

// ---- 1. PARITY -------------------------------------------------------------
// Slovak has legitimate `few` variants for four counted workspace labels.
// Keep the exception explicit so an unrelated key such as tools:merge.run_few
// still fails parity.
const PLURAL_SUFFIX = /_(few|many)$/;
const baseOf = (k) => k.replace(PLURAL_SUFFIX, "");
const ALLOWED_SK_PLURAL_BASES = new Set([
  "workspace:forms.detected_field_count",
  "workspace:forms.field_count",
  "workspace:forms.unsaved_count",
  "workspace:ocr_edit.word_count",
]);
const enKeys = new Set(Object.keys(en.data));
const skKeys = new Set(Object.keys(sk.data));
const allowedSkOnlyPlurals = [...skKeys].filter(
  (k) => !enKeys.has(k) && ALLOWED_SK_PLURAL_BASES.has(baseOf(k))
);
const onlyEn = [...enKeys].filter((k) => !skKeys.has(k)).sort();
const onlySk = [...skKeys]
  .filter(
    (k) => !enKeys.has(k) && !(PLURAL_SUFFIX.test(k) && ALLOWED_SK_PLURAL_BASES.has(baseOf(k)))
  )
  .sort();
if (onlyEn.length || onlySk.length) {
  failures.push({
    title: `PARITY: en and sk key sets differ (${onlyEn.length} en-only, ${onlySk.length} sk-only)`,
    items: [...onlyEn.map((k) => `en only: ${k}`), ...onlySk.map((k) => `sk only: ${k}`)],
  });
}

// ---- 2. MISSING (the original check) ---------------------------------------
const missing = new Map();
for (const k of calledKeys) {
  for (const { dir, data } of locales) {
    // A bare key cannot be resolved to a namespace without parsing
    // useTranslation("<ns>"), so accept it if ANY namespace defines it.
    const lookups = k.includes(":") ? [k] : namespaces.map((ns) => `${ns}:${k}`);
    if (!lookups.some((l) => Object.prototype.hasOwnProperty.call(data, l))) {
      if (!missing.has(dir)) missing.set(dir, new Set());
      missing.get(dir).add(k);
    }
  }
}
for (const [dir, set] of missing) {
  failures.push({
    title: `MISSING: ${dir} lacks ${set.size} called key(s)`,
    items: [...set].sort(),
  });
}

// ---- 3. UNUSED -------------------------------------------------------------
// A key is used if it is called with its namespace, or bare.
const bareCalled = new Set([...calledKeys].filter((k) => !k.includes(":")));
const unused = [...enKeys]
  .filter((full) => {
    if (DYNAMIC_KEY_PREFIXES.some((p) => full.startsWith(p))) return false;
    if (calledKeys.has(full)) return false;
    const bare = full.slice(full.indexOf(":") + 1);
    const pluralBase = full.replace(/_(one|other)$/, "");
    if (
      pluralBase !== full &&
      ALLOWED_SK_PLURAL_BASES.has(pluralBase) &&
      (calledKeys.has(pluralBase) || bareCalled.has(pluralBase.slice(pluralBase.indexOf(":") + 1)))
    ) {
      return false;
    }
    return !bareCalled.has(bare);
  })
  .sort();
if (unused.length) {
  failures.push({
    title:
      `UNUSED: ${unused.length} catalog key(s) are never called. ` +
      `A translated string nobody reaches is invisible to the old parity check ` +
      `and shows up as untranslated UI`,
    items: unused,
  });
}

// ---- 4. RUST ERROR CATALOG -------------------------------------------------
// Error keys are produced dynamically by Rust and therefore cannot be found
// by the literal t() call scanner. Enumerate the key() match arms directly.
const errorSource = readFileSync(APP_ERROR_SOURCE, "utf8");
const keyFunction = errorSource.slice(
  errorSource.indexOf("pub fn key"),
  errorSource.indexOf("impl Serialize")
);
const rustErrorKeys = new Set([...keyFunction.matchAll(/=>\s*"([a-z0-9_]+)"/g)].map((m) => m[1]));
for (const { dir, data } of locales) {
  const missingErrors = [...rustErrorKeys]
    .filter((key) => !Object.prototype.hasOwnProperty.call(data, `errors:${key}`))
    .sort();
  if (missingErrors.length) {
    failures.push({
      title: `ERRORS: ${dir} lacks ${missingErrors.length} Rust AppError key(s)`,
      items: missingErrors,
    });
  }
}

// ---- 5. LITERAL ------------------------------------------------------------
// Scan every non-generated source file. Components without useTranslation are
// the most important inputs, not an exemption. Attributes and capitalized
// multi-word JSX text nodes cover both accessible and visible copy.
const attrRe = new RegExp(
  `\\b(${USER_FACING_ATTRS.join("|")})\\s*=\\s*(["'])([^"'{}]{2,})\\2`,
  "g"
);
const textNodeRe = />([^<>{}]+)</g;
const literals = [];
for (const f of files) {
  const rel = relative(".", f).replace(/\\/g, "/");
  if (LITERAL_FILE_ALLOW.includes(rel)) continue;
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(attrRe)) {
    const line = src.slice(0, m.index).split("\n").length;
    literals.push(`${rel}:${line}  ${m[1]}="${m[3]}"`);
  }
  if (extname(f) !== ".tsx") continue;
  for (const m of src.matchAll(textNodeRe)) {
    const value = m[1].replace(/\s+/g, " ").trim();
    if (!/^[A-Z][a-z]+(?:\s+[A-Za-z][A-Za-z0-9'()/.,:-]*)+/.test(value)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    literals.push(`${rel}:${line}  text="${value.replaceAll('"', '\\"')}"`);
  }
}
const literalDetailsByBaselineItem = new Map();
const literalsByFile = new Map();
for (const literal of literals) {
  const match = literal.match(/^(.*?):\d+\s{2}(.*)$/);
  if (!match) continue;
  if (!literalsByFile.has(match[1])) literalsByFile.set(match[1], []);
  literalsByFile.get(match[1]).push(match[2]);
}
const literalBaselineItems = [...literalsByFile]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([file, details]) => {
    const stableDetails = [...details].sort();
    const digest = createHash("sha256").update(stableDetails.join("\n")).digest("hex").slice(0, 16);
    const item = `${file}  ${stableDetails.length} literal(s)  sha256:${digest}`;
    literalDetailsByBaselineItem.set(
      item,
      literals.filter((literal) => literal.startsWith(`${file}:`))
    );
    return item;
  });
if (literalBaselineItems.length) {
  failures.push({
    title:
      `LITERAL: ${literals.length} hardcoded user-facing string(s). ` +
      `These bypass the catalog entirely, so no key check can see them`,
    items: literalBaselineItems,
  });
}

// ---- baseline ratchet ------------------------------------------------------
// The hardened checks found 326 uncalled keys and 23 hardcoded strings on
// their first run. Failing the build on all of them would have got the gate
// switched off within a week, which is worse than not having it. So known
// debt is recorded in scripts/i18n-baseline.json and the build fails only on
// items that are NOT in it.
//
// The ratchet has teeth in both directions. A NEW uncalled key or hardcoded
// string fails immediately. And a baseline entry that is no longer a problem
// ALSO fails, so the file has to shrink as debt is paid and cannot quietly
// become a permanent exemption list.
const BASELINE_PATH = "scripts/i18n-baseline.json";
let baseline = { unused: [], literals: [] };
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
} catch {
  // No baseline yet: every finding is new, which is the correct default.
}

const filtered = [];
for (const f of failures) {
  const kind = f.title.startsWith("UNUSED")
    ? "unused"
    : f.title.startsWith("LITERAL")
      ? "literals"
      : null;
  if (!kind) {
    filtered.push(f);
    continue;
  }
  const known = new Set(baseline[kind] ?? []);
  const fresh = f.items.filter((i) => !known.has(i));
  if (fresh.length) {
    const displayed =
      kind === "literals"
        ? fresh.flatMap((item) => literalDetailsByBaselineItem.get(item) ?? [item])
        : fresh;
    filtered.push({
      title: `${f.title.split(":")[0]}: ${displayed.length} NEW item(s) not in the baseline`,
      items: displayed,
    });
  }
  const stale = [...known].filter((i) => !f.items.includes(i)).sort();
  if (stale.length) {
    filtered.push({
      title:
        `BASELINE: ${stale.length} ${kind} entr(ies) are fixed but still listed. ` +
        `Remove them from ${BASELINE_PATH} so the debt list keeps shrinking`,
      items: stale,
    });
  }
}
failures.length = 0;
failures.push(...filtered);

// ---- report ----------------------------------------------------------------
if (failures.length) {
  for (const f of failures) {
    console.error(`\n[FAIL] ${f.title}:`);
    for (const item of f.items) console.error(`  - ${item}`);
  }
  console.error("");
  process.exit(1);
}

console.log(
  `[OK] i18n: en ${enKeys.size} keys, sk ${skKeys.size} keys, ` +
    `${allowedSkOnlyPlurals.length} allowed sk-only plurals, ${calledKeys.size} called, ` +
    `${unused.length} known unused, ${literals.length} known hardcoded user-facing strings, ` +
    `${failures.length} new issues`
);
