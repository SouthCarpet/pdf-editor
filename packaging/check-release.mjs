// Release asset check (plan 119). The release workflow runs it after
// build-installer.ps1 and before it attaches anything to a GitHub release.
//
// It fails when:
// - package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json do not
//   share one X.Y.Z version,
// - the tag (when given) is not exactly v<version>,
// - packaging/output has no pdf-editor-setup-<version>.exe or no
//   SHA256SUMS.txt,
// - SHA256SUMS.txt is not exactly one "<sha256>  <setup name>" line, or the
//   hash differs from the setup file.
//
// The app's updater accepts only this asset name and this sums line
// (src-tauri/src/services/update_install.rs).
//
// CLI: node packaging/check-release.mjs <repoRoot> <outDir> [tag]
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkVersions, readVersions, setupFileName } from "./check-payload.mjs";

export const SUMS_FILE = "SHA256SUMS.txt";

export function checkTag(tag, version) {
  if (tag && tag !== `v${version}`) {
    throw new Error(`Tag ${tag} does not match the manifest version ${version} (expected v${version}).`);
  }
}

/** The hash of the one sums line, which must name `setupName`. */
export function parseSums(text, setupName) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const match = lines.length === 1 ? /^([0-9a-f]{64}) {2}(\S+)$/.exec(lines[0]) : null;
  if (!match || match[2] !== setupName) {
    throw new Error(`${SUMS_FILE} must hold exactly one line "<sha256>  ${setupName}", found:\n${text}`);
  }
  return match[1];
}

function requireFile(path) {
  if (!existsSync(path)) throw new Error(`Missing release asset: ${path}`);
  return path;
}

export function checkRelease(repoRoot, outDir, tag) {
  const version = checkVersions(readVersions(repoRoot));
  checkTag(tag, version);
  const setup = setupFileName(version);
  const setupPath = requireFile(join(outDir, setup));
  const expected = parseSums(readFileSync(requireFile(join(outDir, SUMS_FILE)), "utf8"), setup);
  const actual = createHash("sha256").update(readFileSync(setupPath)).digest("hex");
  if (actual !== expected) {
    throw new Error(`${setup} has SHA-256 ${actual}, ${SUMS_FILE} lists ${expected}.`);
  }
  return { version, setup, sha256: actual };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const outDir = resolve(process.argv[3] ?? join(repoRoot, "packaging", "output"));
  try {
    const report = checkRelease(repoRoot, outDir, process.argv[4] ?? "");
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
