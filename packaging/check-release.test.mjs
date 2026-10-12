// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkRelease, checkTag, parseSums } from "./check-release.mjs";

const SETUP = "pdf-editor-setup-1.2.0.exe";
const SETUP_BYTES = "pretend setup";
const roots = [];

function sha(text) {
  return createHash("sha256").update(text).digest("hex");
}

function fakeRelease({ versions = ["1.2.0", "1.2.0", "1.2.0"], files } = {}) {
  const root = mkdtempSync(join(tmpdir(), "pdf-editor-release-"));
  roots.push(root);
  const [pkg, cargo, tauri] = versions;
  const all = {
    "package.json": JSON.stringify({ version: pkg }),
    "src-tauri/Cargo.toml": `[package]\nname = "pdf-editor"\nversion = "${cargo}"\n`,
    "src-tauri/tauri.conf.json": JSON.stringify({ version: tauri }),
    [`out/${SETUP}`]: SETUP_BYTES,
    "out/SHA256SUMS.txt": `${sha(SETUP_BYTES)}  ${SETUP}\n`,
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function check(root, tag = "v1.2.0") {
  return checkRelease(root, join(root, "out"), tag);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("check-release", () => {
  it("accepts a setup whose sums line, version and tag agree", () => {
    expect(check(fakeRelease())).toEqual({ version: "1.2.0", setup: SETUP, sha256: sha(SETUP_BYTES) });
  });

  it("refuses a tag that is not v<version>", () => {
    expect(() => check(fakeRelease(), "v1.2.1")).toThrow(
      "Tag v1.2.1 does not match the manifest version 1.2.0 (expected v1.2.0).",
    );
    expect(() => checkTag("1.2.0", "1.2.0")).toThrow("expected v1.2.0");
  });

  it("skips the tag check for a manual run without a tag", () => {
    expect(check(fakeRelease(), "").version).toBe("1.2.0");
  });

  it("refuses manifests that disagree on the version", () => {
    expect(() => check(fakeRelease({ versions: ["1.2.0", "1.1.0", "1.2.0"] }))).toThrow(
      "Version mismatch",
    );
  });

  it("refuses a missing setup", () => {
    expect(() => check(fakeRelease({ files: { [`out/${SETUP}`]: null } }))).toThrow(
      "Missing release asset",
    );
  });

  it("refuses a missing sums file", () => {
    expect(() => check(fakeRelease({ files: { "out/SHA256SUMS.txt": null } }))).toThrow(
      "Missing release asset",
    );
  });

  it("refuses a hash that differs from the setup", () => {
    const wrong = { "out/SHA256SUMS.txt": `${sha("other")}  ${SETUP}\n` };

    expect(() => check(fakeRelease({ files: wrong }))).toThrow(`${SETUP} has SHA-256`);
  });

  it("refuses a setup built under another asset name", () => {
    const renamed = {
      [`out/${SETUP}`]: null,
      "out/pdf-editor-setup-1.2.0-test.exe": SETUP_BYTES,
    };

    expect(() => check(fakeRelease({ files: renamed }))).toThrow("Missing release asset");
  });

  it("wants exactly one sums line that names the setup", () => {
    const hash = sha(SETUP_BYTES);

    expect(parseSums(`${hash}  ${SETUP}\r\n`, SETUP)).toBe(hash);
    expect(() => parseSums(`${hash}  other.exe\n`, SETUP)).toThrow("exactly one line");
    expect(() => parseSums(`${hash}  ${SETUP}\n${hash}  ${SETUP}\n`, SETUP)).toThrow(
      "exactly one line",
    );
    expect(() => parseSums(`${hash.toUpperCase()}  ${SETUP}\n`, SETUP)).toThrow("exactly one line");
  });
});
