// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkRelease, checkTag, parseSums, releaseAction } from "./check-release.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

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

describe("release action for an existing GitHub release", () => {
  it("creates a draft when no release has the tag", () => {
    expect(releaseAction("")).toBe("create");
    expect(releaseAction("  \n")).toBe("create");
  });

  it("replaces the assets of a draft release", () => {
    expect(releaseAction('{"isDraft":true}')).toBe("upload");
  });

  it("stops at a published release", () => {
    expect(() => releaseAction('{"isDraft":false}')).toThrow("is published");
  });

  it("stops at an answer it cannot read", () => {
    expect(() => releaseAction("not json")).toThrow("cannot read");
    expect(() => releaseAction("{}")).toThrow("is published");
  });

  it("fails the workflow step with exit code 1 for a published release", () => {
    const run = spawnSync(process.execPath, [join(HERE, "check-release.mjs"), "--release-action", '{"isDraft":false}'], {
      encoding: "utf8",
    });

    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("is published");
  });

  it("prints the action for the workflow", () => {
    const run = spawnSync(process.execPath, [join(HERE, "check-release.mjs"), "--release-action", '{"isDraft":true}'], {
      encoding: "utf8",
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toBe("upload\n");
  });

  it("is the gate in front of every clobber upload in release.yml", () => {
    const workflow = readFileSync(join(HERE, "..", ".github", "workflows", "release.yml"), "utf8");
    const gate = workflow.indexOf("check-release.mjs --release-action");
    const clobbers = [...workflow.matchAll(/gh release upload[^\n]*--clobber/g)].map((match) => match.index);

    expect(gate).toBeGreaterThan(-1);
    expect(clobbers).toHaveLength(1);
    expect(clobbers[0]).toBeGreaterThan(gate);
    expect(workflow.slice(gate, clobbers[0])).toContain("upload)");
  });
});
