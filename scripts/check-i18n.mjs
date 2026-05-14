// Phase 18 Task 90j — i18n parity checker (en + sk).
//
// Scans src/**/*.{ts,tsx} for `t("…")` calls and cross-references each
// key against src/locales/{en,sk}/*.json. Fails on any missing key.
//
// Run locally: `node scripts/check-i18n.mjs`. Wired into npm `check:i18n`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SRC = "src";
const LOCALES = ["src/locales/en", "src/locales/sk"];
// Matches both bare and namespaced keys: t("foo"), t('ns:foo.bar')
const KEY_RE = /\bt\(\s*["'`]([A-Za-z0-9_.:-]+)["'`]/g;

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if ([".ts", ".tsx"].includes(extname(f))) {
      out.push(p);
    }
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
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
          flatten(v, key);
        } else {
          merged[`${ns}:${key}`] = v;
        }
      }
    };
    flatten(data, "");
  }
  return merged;
}

const files = walk(SRC);
const keys = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(KEY_RE)) {
    // Skip dynamic interpolation patterns (e.g. `t(\`errors:${e.key}\`)`)
    // which the regex won't match anyway because of the backtick check.
    keys.add(m[1]);
  }
}

const locales = LOCALES.map((d) => ({ dir: d, data: loadLocale(d) }));
let errors = 0;
const missing = {}; // dir -> Set<key>

// Determine the set of namespaces we have (en is authoritative for the
// namespace list; sk should mirror it).
const namespaces = Array.from(
  new Set(Object.keys(locales[0].data).map((k) => k.split(":")[0])),
);

for (const k of keys) {
  for (const { dir, data } of locales) {
    let lookups;
    if (k.includes(":")) {
      // Explicit namespace.
      lookups = [k];
    } else {
      // Component-scoped useTranslation("<ns>") is impossible to track
      // statically without parsing — accept the key if ANY namespace
      // defines it. False negatives stay rare; false positives would
      // be noisy without the tradeoff.
      lookups = namespaces.map((ns) => `${ns}:${k}`);
    }
    const found = lookups.some((l) =>
      Object.prototype.hasOwnProperty.call(data, l),
    );
    if (!found) {
      missing[dir] ??= new Set();
      missing[dir].add(k);
      errors++;
    }
  }
}

if (errors > 0) {
  for (const [dir, set] of Object.entries(missing)) {
    console.error(`\n[FAIL] ${dir} missing ${set.size} key(s):`);
    for (const k of Array.from(set).sort()) console.error(`  - ${k}`);
  }
  console.error(`\nTotal missing: ${errors}`);
  process.exit(1);
}

console.log(`[OK] i18n parity: ${keys.size} key(s) covered in both en + sk`);
