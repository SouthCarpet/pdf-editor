// Task T1.0 (plan 062): pure logic behind `capabilities.lint.test.ts`.
//
// Why this exists: on 2026-08-29 the close guard called
// `getCurrentWindow().destroy()` (indirectly, via `onCloseRequested`) and
// `close()`, but `src-tauri/capabilities/default.json` granted only
// `core:default`, which contains neither `core:window:allow-destroy` nor
// `core:window:allow-close`. A missing Tauri permission is a silent no-op:
// the window could only be killed from Task Manager, and unit tests that
// mock the `@tauri-apps` API never see it. This module reads the same
// capability files and the generated ACL manifest Tauri itself reads, so
// the check is mechanical instead of relying on someone remembering to
// grep for it.
//
// R2 (plan-062 brief): app-defined commands (`src/bindings.ts` `commands.*`,
// invoked as `invoke("<snake_command>")`) are exempt. In Tauri 2, the ACL
// only gates PLUGIN commands (`invoke("plugin:<name>|<command>")`); a
// command the app itself registers via `tauri::generate_handler!` needs no
// permission entry to be callable at all, so a bare (non "plugin:"-
// prefixed) invoke literal is not a permission-shaped question.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface CallSite {
  file: string;
  line: number;
  permission: string;
  detail: string;
}

export interface UnknownCall {
  file: string;
  line: number;
  detail: string;
}

interface AclNamespace {
  default_permission?: { permissions: string[] };
}
type AclManifest = Record<string, AclNamespace>;

/**
 * R1: expands `*:default` permission sets through the ACL manifest, the way
 * Tauri itself resolves a capability at build time. `core:default` unpacks
 * to `core:path:default`, `core:window:default`, ... (already namespace
 * qualified); each of those unpacks in turn to permissions unqualified
 * within their own namespace (for example `core:window:default` lists
 * `allow-get-all-windows`, meaning `core:window:allow-get-all-windows`).
 * Non-"default" entries (`fs:allow-read-file`, `core:window:allow-close`,
 * scope objects, `deny-*`) are leaves: added to the granted set as-is.
 */
export function expandGrantedPermissions(acl: AclManifest, rawEntries: string[]): Set<string> {
  const granted = new Set<string>();
  const visited = new Set<string>();
  const queue = [...rawEntries];

  while (queue.length > 0) {
    const raw = queue.shift();
    if (raw === undefined || visited.has(raw)) continue;
    visited.add(raw);

    const parts = raw.split(":");
    const localName = parts[parts.length - 1];
    const namespace = parts.slice(0, -1).join(":");

    if (localName !== "default") {
      granted.add(raw);
      continue;
    }

    const subPermissions = acl[namespace]?.default_permission?.permissions ?? [];
    for (const sub of subPermissions) {
      queue.push(sub.includes(":") ? sub : `${namespace}:${sub}`);
    }
  }

  return granted;
}

/** Reads every `src-tauri/capabilities/*.json` file and returns the raw
 * permission identifiers they grant (string entries and `{identifier}`
 * scope objects alike), unexpanded. */
export function loadCapabilityEntries(capabilitiesDir: string): string[] {
  const entries: string[] = [];
  for (const fileName of readdirSync(capabilitiesDir)) {
    if (!fileName.endsWith(".json")) continue;
    const parsed = JSON.parse(readFileSync(join(capabilitiesDir, fileName), "utf8")) as {
      permissions?: Array<string | { identifier: string }>;
    };
    for (const permission of parsed.permissions ?? []) {
      entries.push(typeof permission === "string" ? permission : permission.identifier);
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// R1/R4: the mapping table. Small and explicit on purpose: a call this table
// does not know about must fail loudly ("unknown Tauri call, add it to the
// map") rather than silently pass. Keys:
//   - `window:<method>`        methods called on the object `getCurrentWindow()`
//                              (or `getCurrentWebviewWindow()`) returns.
//   - `plugin-<name>:<fn>`     named imports from `@tauri-apps/plugin-<name>`.
//   - `api/path:<fn>`          named imports from `@tauri-apps/api/path`.
// Raw `invoke("plugin:<name>|<command>")` literals are not looked up here:
// their permission is derived mechanically as `<name>:allow-<kebab command>`
// (Tauri's own naming convention), so an unmapped plugin invoke is checked
// against the ACL directly instead of failing as "unknown".
export const CALL_PERMISSIONS: Record<string, string> = {
  "window:close": "core:window:allow-close",
  "window:destroy": "core:window:allow-destroy",
  // onCloseRequested calls destroy() itself once the handler does not call
  // preventDefault() (see node_modules/@tauri-apps/api/window.js,
  // Window.onCloseRequested) - that unvetoed path is exactly the
  // 2026-08-29 bug this lint exists to catch, so it needs allow-destroy.
  "window:onCloseRequested": "core:window:allow-destroy",
  "window:setTitle": "core:window:allow-set-title",
  "window:minimize": "core:window:allow-minimize",
  "window:maximize": "core:window:allow-maximize",
  "window:show": "core:window:allow-show",
  "window:hide": "core:window:allow-hide",
  "window:setFullscreen": "core:window:allow-set-fullscreen",

  "plugin-dialog:open": "dialog:allow-open",
  "plugin-dialog:save": "dialog:allow-save",
  "plugin-dialog:message": "dialog:allow-message",
  "plugin-dialog:ask": "dialog:allow-ask",
  "plugin-dialog:confirm": "dialog:allow-confirm",

  "plugin-fs:readFile": "fs:allow-read-file",
  "plugin-fs:writeFile": "fs:allow-write-file",
  "plugin-fs:readTextFile": "fs:allow-read-text-file",
  "plugin-fs:writeTextFile": "fs:allow-write-text-file",
  "plugin-fs:readDir": "fs:allow-read-dir",
  "plugin-fs:exists": "fs:allow-exists",
  "plugin-fs:stat": "fs:allow-stat",
  "plugin-fs:remove": "fs:allow-remove",
  "plugin-fs:mkdir": "fs:allow-mkdir",

  "plugin-opener:openPath": "opener:allow-open-path",
  "plugin-opener:openUrl": "opener:allow-open-url",
  "plugin-opener:revealItemInDir": "opener:allow-reveal-item-in-dir",

  "plugin-shell:open": "shell:allow-open",

  "api/path:tempDir": "core:path:allow-resolve-directory",
  "api/path:appDataDir": "core:path:allow-resolve-directory",
  "api/path:appConfigDir": "core:path:allow-resolve-directory",
  "api/path:appLocalDataDir": "core:path:allow-resolve-directory",
  "api/path:join": "core:path:allow-join",
  "api/path:resolve": "core:path:allow-resolve",
  "api/path:dirname": "core:path:allow-dirname",
  "api/path:basename": "core:path:allow-basename",
  "api/path:extname": "core:path:allow-extname",
  "api/path:normalize": "core:path:allow-normalize",
};

interface ImportedName {
  local: string;
  original: string;
}

function parseNamedImports(spec: string): ImportedName[] {
  return spec
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const asMatch = part.match(/^(\w+)\s+as\s+(\w+)$/);
      return asMatch ? { original: asMatch[1], local: asMatch[2] } : { original: part, local: part };
    });
}

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

const IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*["']@tauri-apps\/([\w./-]+)["']/g;

/** Scans one file's text for the three call shapes R1 lists. `filePath` is
 * used only for messages, so callers can pass a repo-relative path. */
export function scanFile(filePath: string, text: string): { calls: CallSite[]; unknown: UnknownCall[] } {
  const calls: CallSite[] = [];
  const unknown: UnknownCall[] = [];

  const aliasKey = new Map<string, string>();
  let windowAlias: string | null = null;
  let invokeLocal: string | null = null;

  for (const [, namedSpec, modulePath] of text.matchAll(IMPORT_RE)) {
    const names = parseNamedImports(namedSpec);
    if (modulePath === "api/window") {
      for (const { original, local } of names) {
        if (original === "getCurrentWindow" || original === "getCurrentWebviewWindow") windowAlias = local;
      }
    } else if (modulePath === "api/core") {
      for (const { original, local } of names) {
        if (original === "invoke") invokeLocal = local;
      }
    } else if (modulePath === "api/path" || modulePath.startsWith("plugin-")) {
      for (const { original, local } of names) aliasKey.set(local, `${modulePath}:${original}`);
    }
  }

  for (const [local, key] of aliasKey) {
    const callRe = new RegExp(`\\b${local}\\s*\\(`, "g");
    for (const m of text.matchAll(callRe)) {
      const line = lineNumberAt(text, m.index ?? 0);
      const permission = CALL_PERMISSIONS[key];
      if (permission === undefined) unknown.push({ file: filePath, line, detail: `${local}(...) [${key}]` });
      else calls.push({ file: filePath, line, permission, detail: `${local}(...)` });
    }
  }

  if (windowAlias) {
    const methodRe = new RegExp(`\\b${windowAlias}\\s*\\(\\s*\\)\\s*\\.\\s*(\\w+)\\s*\\(`, "g");
    for (const m of text.matchAll(methodRe)) {
      const methodName = m[1];
      const line = lineNumberAt(text, m.index ?? 0);
      const key = `window:${methodName}`;
      const permission = CALL_PERMISSIONS[key];
      const detail = `${windowAlias}().${methodName}(...)`;
      if (permission === undefined) unknown.push({ file: filePath, line, detail });
      else calls.push({ file: filePath, line, permission, detail });
    }
  }

  if (invokeLocal) {
    const invokeRe = new RegExp(`\\b${invokeLocal}\\s*(?:<[^>]*>)?\\s*\\(\\s*["']([^"']+)["']`, "g");
    for (const m of text.matchAll(invokeRe)) {
      const literal = m[1];
      if (!literal.startsWith("plugin:")) continue; // R2: app-defined command, exempt.
      const line = lineNumberAt(text, m.index ?? 0);
      const [pluginName, command] = literal.slice("plugin:".length).split("|");
      if (!pluginName || !command) {
        unknown.push({ file: filePath, line, detail: `invoke("${literal}") [malformed plugin call]` });
        continue;
      }
      const permission = `${pluginName}:allow-${command.replace(/_/g, "-")}`;
      calls.push({ file: filePath, line, permission, detail: `invoke("${literal}")` });
    }
  }

  return { calls, unknown };
}

const EXCLUDED_DIR_NAMES = new Set(["test", "tests", "__tests__"]);
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;
const SOURCE_FILE_RE = /\.(ts|tsx)$/;

/** Lists `src/**\/*.{ts,tsx}`, excluding test files/dirs and `bindings.ts`
 * (R1/R2: generated Specta bindings, exempt by construction). */
export function listSourceFiles(srcDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIR_NAMES.has(entry.name)) walk(join(dir, entry.name));
        continue;
      }
      if (!SOURCE_FILE_RE.test(entry.name) || TEST_FILE_RE.test(entry.name)) continue;
      if (entry.name === "bindings.ts" && dir === srcDir) continue;
      results.push(join(dir, entry.name));
    }
  }

  walk(srcDir);
  return results;
}

export interface LintResult {
  violations: string[];
  unknownCalls: string[];
}

/** Runs the full lint: load capabilities + ACL, expand grants, scan every
 * source file, and report every call whose required permission is not in
 * the granted set. `grantedOverride` lets the R3 mutation test simulate a
 * capability file change entirely in memory, without writing to
 * `src-tauri/capabilities/default.json`. */
export function lintCapabilities(options: { repoRoot: string; grantedOverride?: Set<string> }): LintResult {
  const capabilitiesDir = join(options.repoRoot, "src-tauri", "capabilities");
  const aclPath = join(options.repoRoot, "src-tauri", "gen", "schemas", "acl-manifests.json");
  const srcDir = join(options.repoRoot, "src");

  const granted =
    options.grantedOverride ??
    expandGrantedPermissions(
      JSON.parse(readFileSync(aclPath, "utf8")) as AclManifest,
      loadCapabilityEntries(capabilitiesDir),
    );

  const violations: string[] = [];
  const unknownCalls: string[] = [];

  for (const filePath of listSourceFiles(srcDir)) {
    const relPath = relative(options.repoRoot, filePath).split(sep).join("/");
    const { calls, unknown } = scanFile(relPath, readFileSync(filePath, "utf8"));

    for (const call of calls) {
      if (!granted.has(call.permission)) {
        violations.push(`${call.file}:${call.line} needs permission ${call.permission} (${call.detail}), not granted`);
      }
    }
    for (const u of unknown) {
      unknownCalls.push(`${u.file}:${u.line} unknown Tauri call, add it to the map (${u.detail})`);
    }
  }

  return { violations, unknownCalls };
}
