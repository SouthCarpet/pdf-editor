// Task T1.0 (plan 062): capability lint. See `capabilityLint.ts` for the
// rationale (2026-08-29 close-guard bug: `core:window:allow-destroy` was
// missing, the window could only be killed from Task Manager, and mocked
// unit tests never saw it) and for what each scan does and does not cover.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AclManifest,
  FALLBACK_ACL_MANIFEST,
  expandGrantedPermissions,
  lintCapabilities,
  loadAclManifest,
  loadCapabilityEntries,
} from "./capabilityLint";

const REPO_ROOT = process.cwd();
const ACL_MANIFEST_PATH = join(REPO_ROOT, "src-tauri/gen/schemas/acl-manifests.json");
// W4 (plan 067): set by the CI job that builds Rust before running this file,
// so a missing manifest there is a broken job, not a reason to skip.
const MANIFEST_IS_REQUIRED = process.env.PDF_EDITOR_REQUIRE_ACL_MANIFEST === "1";

describe("Tauri capability lint (T1.0, plan 062)", () => {
  it("has no source call using a permission the current capabilities do not grant", () => {
    const { violations, unknownCalls } = lintCapabilities({ repoRoot: REPO_ROOT });

    // R4: an unmapped call is a defect in the lint's own table, not a
    // permission gap - fail with its own message so the two causes are
    // never confused.
    expect(unknownCalls, unknownCalls.join("\n")).toEqual([]);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("fails when core:window:allow-destroy is removed from default.json (R3)", () => {
    // Simulated in memory: clone the real granted-permission set and strip
    // the one entry, then re-run the same lint against the clone. The real
    // `src-tauri/capabilities/default.json` is never written to - this task
    // is not allowed to touch `src-tauri/`, and other makers are editing
    // application files in the same tree concurrently.
    const acl = loadAclManifest(ACL_MANIFEST_PATH);
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("core:window:allow-destroy")).toBe(true); // sanity: the mutation below is real

    granted.delete("core:window:allow-destroy");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission core:window:allow-destroy"))).toBe(true);
  });

  it("fails when fs:allow-stat is removed from default.json", () => {
    const acl = loadAclManifest(ACL_MANIFEST_PATH);
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("fs:allow-stat")).toBe(true);

    granted.delete("fs:allow-stat");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission fs:allow-stat"))).toBe(true);
  });

  it("fails when opener:allow-reveal-item-in-dir is removed from default.json", () => {
    const acl = loadAclManifest(ACL_MANIFEST_PATH);
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("opener:allow-reveal-item-in-dir")).toBe(true);

    granted.delete("opener:allow-reveal-item-in-dir");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission opener:allow-reveal-item-in-dir"))).toBe(true);
  });

  it("fails when core:event:allow-listen is removed from the granted set", () => {
    const acl = loadAclManifest(ACL_MANIFEST_PATH);
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("core:event:allow-listen")).toBe(true);

    granted.delete("core:event:allow-listen");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission core:event:allow-listen"))).toBe(true);
  });

  it("build.rs carries no AppManifest command list (every app command must stay allowed by default)", () => {
    // Listing ANY app command in tauri_build::AppManifest puts EVERY app
    // command under the ACL; the unlisted ones then fail at runtime with
    // "not allowed by ACL" (check_for_update and open_document broke this
    // way in the 2026-08-30 build).
    const buildRs = readFileSync(join(REPO_ROOT, "src-tauri/build.rs"), "utf8");
    expect(buildRs).not.toMatch(/AppManifest::new|app_manifest\s*\(/);
  });

  it("fails when temporary print-file removal is no longer allowed", () => {
    const acl = loadAclManifest(ACL_MANIFEST_PATH);
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("fs:allow-remove")).toBe(true);

    granted.delete("fs:allow-remove");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission fs:allow-remove"))).toBe(true);
  });

  // F1 (plan 066): the frontend-unit CI job has no generated
  // src-tauri/gen/schemas/acl-manifests.json (never runs a cargo build), so
  // lintCapabilities() falls back to a vendored copy of the same
  // default_permission data (FALLBACK_ACL_MANIFEST). This test is the proof
  // that the vendor copy stays honest: whenever a real manifest DOES exist
  // (any local run after `cargo build`/`cargo test`, or a CI job that builds
  // Rust before this suite), every namespace the fallback carries must match
  // the real file's default_permission.permissions exactly.
  //
  // W4 (plan 067): a skip when the file is absent is right on a developer's
  // machine and wrong in CI. `frontend-unit`, the only job that ran Vitest,
  // never builds Rust, so this comparison never ran anywhere and a `tauri`
  // upgrade past the pinned `=2.11` could stale the fallback in silence. The
  // `lint` job now runs this file with PDF_EDITOR_REQUIRE_ACL_MANIFEST=1
  // after clippy has generated the manifest, and that flag turns the absent
  // file from a skip into a failure.
  it.runIf(MANIFEST_IS_REQUIRED || existsSync(ACL_MANIFEST_PATH))(
    "vendored ACL fallback stays in sync with the generated manifest when one is present",
    () => {
      expect(
        existsSync(ACL_MANIFEST_PATH),
        `PDF_EDITOR_REQUIRE_ACL_MANIFEST=1, but ${ACL_MANIFEST_PATH} does not exist. ` +
          "The step that builds Rust (tauri_build::build writes it) must run before this test.",
      ).toBe(true);
      const real = JSON.parse(readFileSync(ACL_MANIFEST_PATH, "utf8")) as AclManifest;
      for (const [namespace, fallbackEntry] of Object.entries(FALLBACK_ACL_MANIFEST)) {
        expect(real[namespace]?.default_permission?.permissions, `namespace: ${namespace}`).toEqual(
          fallbackEntry.default_permission?.permissions,
        );
      }
    },
  );
});
