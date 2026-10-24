// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkPayload,
  checkVersions,
  innoFilesSection,
  readVersions,
  setupFileName,
} from "./check-payload.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const roots = [];

function fakeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "pdf-editor-payload-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const manifest = {
  files: [
    { kind: "app", from: "bin/pdf-editor.exe", to: "pdf-editor.exe" },
    { kind: "sidecar", from: "sidecars/qpdf-x86_64-pc-windows-msvc.exe", to: "qpdf.exe" },
    { kind: "dll", from: "sidecars/qpdf30.dll", to: "sidecars/qpdf30.dll" },
    { kind: "tessdata", from: "tessdata/eng.traineddata", to: "resources/tessdata/eng.traineddata" },
    { kind: "ocr", from: "ocr/det.onnx", to: "resources/ocr/det.onnx" },
    { kind: "licence", from: "fira/OFL.txt", to: "resources/licenses/FiraSans-OFL.txt" },
  ],
};

const complete = {
  "bin/pdf-editor.exe": "exe",
  "sidecars/qpdf-x86_64-pc-windows-msvc.exe": "qpdf",
  "sidecars/qpdf30.dll": "dll",
  "tessdata/eng.traineddata": "eng",
  "ocr/det.onnx": "onnx",
  "fira/OFL.txt": "ofl",
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("checkPayload", () => {
  it("hashes every file when the payload is complete", () => {
    const entries = checkPayload(fakeRepo(complete), manifest);

    expect(entries).toHaveLength(6);
    expect(entries[0].sha256).toBe("9095bdb859308b62acf04036ffd4adfe366d7f737d276eb6c46ae434f3816c9b");
  });

  it("fails and names the sidecar when a sidecar is missing", () => {
    const files = { ...complete };
    delete files["sidecars/qpdf-x86_64-pc-windows-msvc.exe"];

    expect(() => checkPayload(fakeRepo(files), manifest)).toThrow(
      "sidecar: sidecars/qpdf-x86_64-pc-windows-msvc.exe",
    );
  });

  it("fails on a zero-byte tessdata stub like the CI placeholder", () => {
    const root = fakeRepo({ ...complete, "tessdata/eng.traineddata": "" });

    expect(() => checkPayload(root, manifest)).toThrow("tessdata: tessdata/eng.traineddata");
  });

  it("fails and names the font licence when it is missing", () => {
    const files = { ...complete };
    delete files["fira/OFL.txt"];

    expect(() => checkPayload(fakeRepo(files), manifest)).toThrow("licence: fira/OFL.txt");
  });

  it("lists every gap in one error when a DLL and a model are missing", () => {
    const files = { ...complete };
    delete files["sidecars/qpdf30.dll"];
    delete files["ocr/det.onnx"];

    expect(() => checkPayload(fakeRepo(files), manifest)).toThrow(
      "Missing or empty payload files (2):\n  DLL: sidecars/qpdf30.dll\n  OCR model: ocr/det.onnx",
    );
  });
});

describe("checkVersions", () => {
  it("returns the version when all three manifests agree", () => {
    const version = checkVersions({
      "package.json": "0.1.0",
      "src-tauri/Cargo.toml": "0.1.0",
      "src-tauri/tauri.conf.json": "0.1.0",
    });

    expect(version).toBe("0.1.0");
  });

  it("fails and shows every value when one manifest differs", () => {
    expect(() =>
      checkVersions({
        "package.json": "0.1.0",
        "src-tauri/Cargo.toml": "1.1.0",
        "src-tauri/tauri.conf.json": "0.1.0",
      }),
    ).toThrow("src-tauri/Cargo.toml: 1.1.0");
  });

  it("fails on a version that is not X.Y.Z", () => {
    expect(() =>
      checkVersions({
        "package.json": "1.1",
        "src-tauri/Cargo.toml": "1.1",
        "src-tauri/tauri.conf.json": "1.1",
      }),
    ).toThrow("Version mismatch or not X.Y.Z");
  });

  it("reads the package version, not a dependency version, from Cargo.toml", () => {
    const root = fakeRepo({
      "package.json": '{"version":"0.1.0"}',
      "src-tauri/Cargo.toml": '[package]\nname = "x"\nversion = "0.1.0"\n\n[dependencies]\nfoo = { version = "9.9.9" }\n',
      "src-tauri/tauri.conf.json": '{"version":"0.1.0"}',
    });

    expect(readVersions(root)["src-tauri/Cargo.toml"]).toBe("0.1.0");
  });

  it("agrees across the real repo manifests and names the setup after that version", () => {
    const version = checkVersions(readVersions(repoRoot));
    const iss = readFileSync(join(repoRoot, "packaging", "pdf-editor.iss"), "utf8");

    expect(setupFileName(version)).toBe(`pdf-editor-setup-${version}.exe`);
    expect(iss).toContain("OutputBaseFilename=pdf-editor-setup-{#AppVersion}");
  });
});

describe("innoFilesSection", () => {
  it("installs a renamed sidecar beside the app and a DLL under sidecars", () => {
    const section = innoFilesSection([
      { source: "C:/repo/sidecars/qpdf-x86_64-pc-windows-msvc.exe", to: "qpdf.exe" },
      { source: "C:/repo/sidecars/qpdf30.dll", to: "sidecars/qpdf30.dll" },
    ]);

    expect(section).toBe(
      "[Files]\n" +
        'Source: "C:\\repo\\sidecars\\qpdf-x86_64-pc-windows-msvc.exe"; DestDir: "{app}"; DestName: "qpdf.exe"; Flags: ignoreversion\n' +
        'Source: "C:\\repo\\sidecars\\qpdf30.dll"; DestDir: "{app}\\sidecars"; DestName: "qpdf30.dll"; Flags: ignoreversion\n',
    );
  });
});
