// Task T1.0 (plan 062): capability lint. See `capabilityLint.ts` for the
// rationale (2026-08-29 close-guard bug: `core:window:allow-destroy` was
// missing, the window could only be killed from Task Manager, and mocked
// unit tests never saw it) and for what each scan does and does not cover.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandGrantedPermissions, lintCapabilities, loadCapabilityEntries } from "./capabilityLint";

const REPO_ROOT = process.cwd();

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
    const acl = JSON.parse(readFileSync(join(REPO_ROOT, "src-tauri/gen/schemas/acl-manifests.json"), "utf8"));
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("core:window:allow-destroy")).toBe(true); // sanity: the mutation below is real

    granted.delete("core:window:allow-destroy");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission core:window:allow-destroy"))).toBe(true);
  });

  it("fails when fs:allow-stat is removed from default.json", () => {
    const acl = JSON.parse(readFileSync(join(REPO_ROOT, "src-tauri/gen/schemas/acl-manifests.json"), "utf8"));
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("fs:allow-stat")).toBe(true);

    granted.delete("fs:allow-stat");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission fs:allow-stat"))).toBe(true);
  });

  it("fails when opener:allow-reveal-item-in-dir is removed from default.json", () => {
    const acl = JSON.parse(readFileSync(join(REPO_ROOT, "src-tauri/gen/schemas/acl-manifests.json"), "utf8"));
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("opener:allow-reveal-item-in-dir")).toBe(true);

    granted.delete("opener:allow-reveal-item-in-dir");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission opener:allow-reveal-item-in-dir"))).toBe(true);
  });

  it("fails when core:event:allow-listen is removed from the granted set", () => {
    const acl = JSON.parse(readFileSync(join(REPO_ROOT, "src-tauri/gen/schemas/acl-manifests.json"), "utf8"));
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("core:event:allow-listen")).toBe(true);

    granted.delete("core:event:allow-listen");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission core:event:allow-listen"))).toBe(true);
  });

  it("fails when allow-startup-paths is removed from the granted set", () => {
    const acl = JSON.parse(readFileSync(join(REPO_ROOT, "src-tauri/gen/schemas/acl-manifests.json"), "utf8"));
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("allow-startup-paths")).toBe(true);

    granted.delete("allow-startup-paths");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission allow-startup-paths"))).toBe(true);
  });

  it("fails when the print renderer permission is removed from the granted set", () => {
    const acl = JSON.parse(readFileSync(join(REPO_ROOT, "src-tauri/gen/schemas/acl-manifests.json"), "utf8"));
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("allow-render-page-thumbnail")).toBe(true);

    granted.delete("allow-render-page-thumbnail");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission allow-render-page-thumbnail"))).toBe(true);
  });

  it("fails when temporary print-file removal is no longer allowed", () => {
    const acl = JSON.parse(readFileSync(join(REPO_ROOT, "src-tauri/gen/schemas/acl-manifests.json"), "utf8"));
    const rawEntries = loadCapabilityEntries(join(REPO_ROOT, "src-tauri/capabilities"));
    const granted = expandGrantedPermissions(acl, rawEntries);
    expect(granted.has("fs:allow-remove")).toBe(true);

    granted.delete("fs:allow-remove");
    const { violations } = lintCapabilities({ repoRoot: REPO_ROOT, grantedOverride: granted });

    expect(violations.some((v) => v.includes("needs permission fs:allow-remove"))).toBe(true);
  });
});
