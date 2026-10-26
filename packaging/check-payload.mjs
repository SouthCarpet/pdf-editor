// Payload and version checks for the per-user setup (plan 119).
//
// build-installer.ps1 runs this before ISCC. It fails when a file of
// packaging/payload.json is missing or empty, or when package.json,
// src-tauri/Cargo.toml and src-tauri/tauri.conf.json disagree on the
// version. On success it writes the Inno [Files] include that
// pdf-editor.iss installs, so the setup holds exactly the checked list.
//
// CLI: node packaging/check-payload.mjs <repoRoot> <outDir>
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const KIND_LABELS = {
  app: "application",
  sidecar: "sidecar",
  dll: "DLL",
  tessdata: "tessdata",
  ocr: "OCR model",
  licence: "licence",
};

export function setupFileName(version) {
  return `pdf-editor-setup-${version}.exe`;
}

function cargoPackageVersion(cargoToml) {
  const packageSection = cargoToml.split(/^\[/m).find((s) => s.startsWith("package]"));
  return packageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

export function readVersions(repoRoot) {
  const read = (path) => readFileSync(join(repoRoot, path), "utf8");
  return {
    "package.json": JSON.parse(read("package.json")).version ?? null,
    "src-tauri/Cargo.toml": cargoPackageVersion(read("src-tauri/Cargo.toml")),
    "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version ?? null,
  };
}

/** Returns the one version all three manifests share, or throws. */
export function checkVersions(versions) {
  const distinct = new Set(Object.values(versions));
  const [version] = distinct;
  if (distinct.size !== 1 || !/^\d+\.\d+\.\d+$/.test(version ?? "")) {
    const list = Object.entries(versions)
      .map(([file, v]) => `  ${file}: ${v}`)
      .join("\n");
    throw new Error(`Version mismatch or not X.Y.Z:\n${list}`);
  }
  return version;
}

function fileSize(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/** Hashes every payload file, or throws one error that lists every gap. */
export function checkPayload(repoRoot, manifest) {
  const missing = [];
  const entries = [];
  for (const file of manifest.files) {
    const source = join(repoRoot, file.from);
    const size = fileSize(source);
    if (size === 0) {
      missing.push(`  ${KIND_LABELS[file.kind] ?? file.kind}: ${file.from}`);
      continue;
    }
    const sha256 = createHash("sha256").update(readFileSync(source)).digest("hex");
    entries.push({ ...file, source, size, sha256 });
  }
  if (missing.length > 0) {
    throw new Error(`Missing or empty payload files (${missing.length}):\n${missing.join("\n")}`);
  }
  return entries;
}

/** Inno [Files] lines for the checked entries, with absolute sources. */
export function innoFilesSection(entries) {
  const lines = entries.map((entry) => {
    const to = win32.normalize(entry.to);
    const destDir = win32.dirname(to);
    const appDir = destDir === "." ? "{app}" : `{app}\\${destDir}`;
    const source = win32.normalize(entry.source);
    return `Source: "${source}"; DestDir: "${appDir}"; DestName: "${win32.basename(to)}"; Flags: ignoreversion`;
  });
  return `[Files]\n${lines.join("\n")}\n`;
}

export function runCheck(repoRoot, outDir) {
  const version = checkVersions(readVersions(repoRoot));
  const manifest = JSON.parse(readFileSync(join(repoRoot, "packaging", "payload.json"), "utf8"));
  const entries = checkPayload(repoRoot, manifest);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "payload-files.iss"), innoFilesSection(entries));
  const report = {
    version,
    setup: setupFileName(version),
    exeSha256: entries.find((e) => e.kind === "app").sha256,
    files: entries.map(({ kind, to, size, sha256 }) => ({ kind, to, size, sha256 })),
  };
  writeFileSync(join(outDir, `pdf-editor-payload-${version}.json`), JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const outDir = resolve(process.argv[3] ?? join(repoRoot, "packaging", "output"));
  try {
    const report = runCheck(repoRoot, outDir);
    process.stdout.write(
      JSON.stringify({ version: report.version, setup: report.setup, exeSha256: report.exeSha256, files: report.files.length }) + "\n",
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
