// Phase 16 Task 81 / Delta U: Recovery wizard (Dictionary / Mask / Brute).
//
// Three tabs:
//   - Dictionary: bundled top-1k wordlist and Custom .txt picker, preview of
//     the first 20 lines, runtime estimate based on candidate count and a
//     conservative 200 attempts/sec assumption for pdfcrack.
//   - Mask: visual mask builder (drag-free, button-driven token append).
//     Run button is disabled. The backend surfaces Unimplemented per the
//     NON-NEGOTIABLE rule (no silent fallback). A clear banner explains
//     why and points users to the Brute tab.
//   - Brute: charset multi-select + min/max length sliders; live candidate
//     count + runtime estimate.
//
// Shared top bar: while running, shows "Time spent / Estimated remaining"
// and a Stop button that calls cancel_job.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { tempDir } from "@tauri-apps/api/path";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands, type RecoveryResult } from "@/bindings";
// Use Vite's ?url import so the bundled wordlist file is resolved through
// the dev server / production bundle pipeline (Tauri's resource resolver
// can't reach src/assets, so we serve the file through the webview itself).
import top1kUrl from "@/assets/wordlists/top-1k.txt?url";

// Conservative throughput for pdfcrack on a typical CPU. Used purely for
// the "Estimated remaining" UI label - the actual run rate varies wildly
// with PDF encryption strength (V=5 is ~1000x slower than V<=4).
const PDFCRACK_ATTEMPTS_PER_SEC = 200;

type Tab = "dictionary" | "mask" | "brute";

interface Props {
  inputPath: string;
}

const MASK_TOKENS = [
  { key: "?d", chars: 10 },
  { key: "?l", chars: 26 },
  { key: "?u", chars: 26 },
  { key: "?s", chars: 32 },
  { key: "?a", chars: 52 },
  { key: "?n", chars: 62 },
];

interface CharsetOption {
  key: string;
  chars: string;
}
const CHARSETS: CharsetOption[] = [
  { key: "digits", chars: "0123456789" },
  {
    key: "lower",
    chars: "abcdefghijklmnopqrstuvwxyz",
  },
  {
    key: "upper",
    chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  },
  { key: "special", chars: "!@#$%^&*()-_=+[]{};:'\",.<>/?\\|`~" },
];

function tabLabel(t: TFunction, tab: Tab): string {
  switch (tab) {
    case "dictionary":
      return t("recovery:mode_dictionary");
    case "mask":
      return t("recovery:mode_mask");
    case "brute":
      return t("recovery:mode_brute");
  }
}

function maskTokenLabel(t: TFunction, key: string): string {
  switch (key) {
    case "?d":
      return t("recovery:mask_token_digits");
    case "?l":
      return t("recovery:mask_token_lower");
    case "?u":
      return t("recovery:mask_token_upper");
    case "?s":
      return t("recovery:mask_token_special");
    case "?a":
      return t("recovery:mask_token_alpha");
    case "?n":
      return t("recovery:mask_token_alphanum");
    default:
      return key;
  }
}

function charsetLabel(t: TFunction, key: string): string {
  switch (key) {
    case "digits":
      return t("recovery:charset_digits");
    case "lower":
      return t("recovery:charset_lower");
    case "upper":
      return t("recovery:charset_upper");
    case "special":
      return t("recovery:charset_special");
    default:
      return key;
  }
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "-";
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`;
  if (seconds < 86400 * 365) return `${(seconds / 86400).toFixed(1)} d`;
  if (seconds === Infinity) return "∞";
  return `${(seconds / (86400 * 365)).toFixed(1)} y`;
}

export function RecoveryWizard({ inputPath }: Props) {
  const { t } = useTranslation(["recovery", "common"]);
  const [tab, setTab] = useState<Tab>("dictionary");

  // Shared run state.
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [startTs, setStartTs] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running || startTs === null) return;
    const i = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTs) / 1000));
    }, 500);
    return () => window.clearInterval(i);
  }, [running, startTs]);

  // Dictionary state.
  const [wordlist, setWordlist] = useState<"top-1k" | "custom">("top-1k");
  const [customWordlistPath, setCustomWordlistPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [wordlistCount, setWordlistCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (wordlist === "top-1k") {
          const r = await fetch(top1kUrl);
          const txt = await r.text();
          if (cancelled) return;
          const lines = txt.split(/\r?\n/).filter(Boolean);
          setWordlistCount(lines.length);
          setPreview(lines.slice(0, 20));
        } else if (customWordlistPath) {
          const txt = await readTextFile(customWordlistPath);
          if (cancelled) return;
          const lines = txt.split(/\r?\n/).filter(Boolean);
          setWordlistCount(lines.length);
          setPreview(lines.slice(0, 20));
        } else {
          setWordlistCount(null);
          setPreview([]);
        }
      } catch {
        setPreview([]);
        setWordlistCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wordlist, customWordlistPath]);

  const dictionaryEta = useMemo(() => {
    if (wordlistCount === null) return "-";
    return formatDuration(wordlistCount / PDFCRACK_ATTEMPTS_PER_SEC);
  }, [wordlistCount]);

  // Mask state (UI-only - Run disabled).
  const [maskTokens, setMaskTokens] = useState<string[]>([]);
  const maskCandidateCount = useMemo(() => {
    let count = 1;
    for (const tok of maskTokens) {
      const info = MASK_TOKENS.find((m) => m.key === tok);
      if (!info) return 0;
      count *= info.chars;
      if (count > 1e18) return Infinity;
    }
    return maskTokens.length === 0 ? 0 : count;
  }, [maskTokens]);

  // Brute state.
  const [selectedCharsets, setSelectedCharsets] = useState<string[]>(["digits"]);
  const [customCharset, setCustomCharset] = useState("");
  const [minLen, setMinLen] = useState(1);
  const [maxLen, setMaxLen] = useState(4);
  const fullCharset = useMemo(() => {
    let s = "";
    for (const k of selectedCharsets) {
      const c = CHARSETS.find((x) => x.key === k);
      if (c) s += c.chars;
    }
    s += customCharset;
    return Array.from(new Set(s.split(""))).join("");
  }, [selectedCharsets, customCharset]);

  const bruteCandidateCount = useMemo(() => {
    const base = fullCharset.length;
    if (base === 0) return 0;
    let total = 0;
    for (let n = minLen; n <= maxLen; n++) {
      total += Math.pow(base, n);
      if (total > 1e18) return Infinity;
    }
    return total;
  }, [fullCharset.length, minLen, maxLen]);

  const bruteEta = useMemo(
    () => formatDuration(bruteCandidateCount / PDFCRACK_ATTEMPTS_PER_SEC),
    [bruteCandidateCount]
  );

  async function pickCustomWordlist() {
    const p = await openDialog({
      multiple: false,
      filters: [{ name: "Wordlist", extensions: ["txt", "lst", "dict"] }],
    });
    if (typeof p === "string") setCustomWordlistPath(p);
  }

  async function runDictionary() {
    let path: string | null = null;
    if (wordlist === "top-1k") {
      // Materialize the bundled wordlist to a temp .txt on disk so pdfcrack
      // can read it. Tauri's fs APIs can't write directly into the resource
      // dir, so we write into the user's appdata path via tempfile-style
      // naming.
      const r = await fetch(top1kUrl);
      const txt = await r.text();
      const dir = await tempDir();
      const tmp = `${dir}/recovery-top-1k-${crypto.randomUUID()}.txt`;
      await writeTextFile(tmp, txt);
      path = tmp;
    } else if (customWordlistPath) {
      path = customWordlistPath;
    }
    if (!path) {
      setError(t("recovery:no_wordlist"));
      return;
    }
    const id = crypto.randomUUID();
    setJobId(id);
    setRunning(true);
    setStartTs(Date.now());
    setResult(null);
    setError(null);
    const r = await commands.recoveryAttempt({
      mode: "dictionary",
      input: inputPath,
      wordlist_path: path,
      job_id: id,
    });
    setRunning(false);
    setJobId(null);
    if (r.status === "ok") setResult(r.data);
    else setError(JSON.stringify(r.error));
  }

  async function runBrute() {
    if (fullCharset.length === 0) {
      setError(t("recovery:select_charset"));
      return;
    }
    const id = crypto.randomUUID();
    setJobId(id);
    setRunning(true);
    setStartTs(Date.now());
    setResult(null);
    setError(null);
    const r = await commands.recoveryAttempt({
      mode: "brute",
      input: inputPath,
      charset: fullCharset,
      min_len: minLen,
      max_len: maxLen,
      job_id: id,
    });
    setRunning(false);
    setJobId(null);
    if (r.status === "ok") setResult(r.data);
    else setError(JSON.stringify(r.error));
  }

  async function stop() {
    if (!jobId) return;
    await commands.cancelJob(jobId);
  }

  const etaSeconds = useMemo(() => {
    if (!running) return null;
    if (tab === "dictionary" && wordlistCount !== null) {
      const total = wordlistCount / PDFCRACK_ATTEMPTS_PER_SEC;
      return Math.max(0, total - elapsed);
    }
    if (tab === "brute" && bruteCandidateCount > 0) {
      const total = bruteCandidateCount / PDFCRACK_ATTEMPTS_PER_SEC;
      return Math.max(0, total - elapsed);
    }
    return null;
  }, [running, tab, wordlistCount, bruteCandidateCount, elapsed]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">{t("recovery:title")}</h1>
      <p className="truncate text-sm text-[var(--color-muted)]" title={inputPath}>
        {inputPath}
      </p>

      <div className="flex gap-1 rounded border border-[var(--color-border)] p-1">
        {(["dictionary", "mask", "brute"] as Tab[]).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            disabled={running}
            className={`flex-1 rounded px-3 py-2 text-sm capitalize ${
              tab === id
                ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                : "hover:bg-[var(--color-control-hover)]"
            }`}
          >
            {tabLabel(t, id)}
          </button>
        ))}
      </div>

      {tab === "dictionary" && (
        <div className="space-y-3 rounded border border-[var(--color-border)] p-4">
          <div className="flex gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={wordlist === "top-1k"}
                onChange={() => setWordlist("top-1k")}
              />
              {t("recovery:wordlist_top_1k")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={wordlist === "custom"}
                onChange={() => setWordlist("custom")}
              />
              {t("recovery:wordlist_custom")}
            </label>
            {wordlist === "custom" && (
              <Button size="sm" variant="outline" onClick={pickCustomWordlist}>
                {t("recovery:choose_file")}
              </Button>
            )}
          </div>
          {customWordlistPath && wordlist === "custom" && (
            <p className="truncate text-xs text-[var(--color-muted)]">{customWordlistPath}</p>
          )}
          <div className="text-xs text-[var(--color-muted)]">
            {wordlistCount !== null && (
              <>
                <span>
                  {t("recovery:candidates")}: {wordlistCount.toLocaleString()}
                </span>{" "}
                ·{" "}
                <span>
                  {t("recovery:estimated_time")}: {dictionaryEta} ({PDFCRACK_ATTEMPTS_PER_SEC}/s)
                </span>
              </>
            )}
          </div>
          {preview.length > 0 && (
            <pre className="max-h-32 overflow-auto rounded bg-[var(--color-control)] p-2 font-mono text-[11px]">
              {preview.join("\n")}
            </pre>
          )}
        </div>
      )}

      {tab === "mask" && (
        <div className="space-y-3 rounded border border-[var(--color-border)] p-4">
          <div className="rounded border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-xs text-[var(--color-warning-soft-foreground)]">
            <p className="font-medium">{t("recovery:mask_unimplemented")}</p>
            <p>{t("recovery:mask_help")}</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-[var(--color-muted)]">{t("recovery:token_palette")}</p>
            <div className="flex flex-wrap gap-1">
              {MASK_TOKENS.map((m) => (
                <Button
                  key={m.key}
                  size="sm"
                  variant="outline"
                  onClick={() => setMaskTokens((t) => [...t, m.key])}
                >
                  {maskTokenLabel(t, m.key)}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs text-[var(--color-muted)]">{t("recovery:mask_builder")}</p>
            <div className="flex min-h-[32px] flex-wrap gap-1 rounded border border-[var(--color-border)] bg-[var(--color-background)] p-2">
              {maskTokens.length === 0 && (
                <span className="text-xs text-[var(--color-muted)]">{t("recovery:empty")}</span>
              )}
              {maskTokens.map((tok, i) => (
                <button
                  key={i}
                  onClick={() => setMaskTokens((t) => t.filter((_, idx) => idx !== i))}
                  className="rounded bg-[var(--color-accent-soft)] px-2 py-1 text-xs text-[var(--color-accent-soft-foreground)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-soft-foreground)]"
                  title={t("recovery:click_to_remove")}
                >
                  {tok}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {t("recovery:candidates")}:{" "}
              {maskCandidateCount === Infinity ? ">10^18" : maskCandidateCount.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {tab === "brute" && (
        <div className="space-y-3 rounded border border-[var(--color-border)] p-4">
          <div>
            <p className="mb-1 text-xs text-[var(--color-muted)]">{t("recovery:charset")}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {CHARSETS.map((c) => (
                <label key={c.key} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selectedCharsets.includes(c.key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCharsets((s) => [...s, c.key]);
                      } else {
                        setSelectedCharsets((s) => s.filter((k) => k !== c.key));
                      }
                    }}
                  />
                  {charsetLabel(t, c.key)}
                </label>
              ))}
            </div>
          </div>
          <label className="block text-xs">
            <span className="text-[var(--color-muted)]">{t("recovery:charset_custom")}</span>
            <Input
              value={customCharset}
              onChange={(e) => setCustomCharset(e.target.value)}
              placeholder={t("recovery:charset_custom_example")}
              className="mt-1"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label>
              <span className="text-[var(--color-muted)]">{t("recovery:min_length")}</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={minLen}
                onChange={(e) => setMinLen(Math.max(1, Math.min(20, Number(e.target.value))))}
                className="mt-1"
              />
            </label>
            <label>
              <span className="text-[var(--color-muted)]">{t("recovery:max_length")}</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={maxLen}
                onChange={(e) => setMaxLen(Math.max(1, Math.min(20, Number(e.target.value))))}
                className="mt-1"
              />
            </label>
          </div>
          <div className="text-xs text-[var(--color-muted)]">
            <span>
              {t("recovery:charset")}: {fullCharset.length}
            </span>{" "}
            ·{" "}
            <span>
              {t("recovery:candidates")}:{" "}
              {bruteCandidateCount === Infinity ? ">10^18" : bruteCandidateCount.toLocaleString()}
            </span>{" "}
            · <span>≈ {bruteEta}</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 rounded border border-[var(--color-border)] p-3">
        {running ? (
          <>
            <div className="text-sm">
              <span className="font-medium">{t("common:running")}</span> ·{" "}
              {t("recovery:time_spent")}: {formatDuration(elapsed)}{" "}
              {etaSeconds !== null && (
                <>
                  · {t("recovery:estimated_remaining")}: {formatDuration(etaSeconds)}
                </>
              )}
            </div>
            <Button onClick={stop} variant="destructive">
              {t("recovery:stop")}
            </Button>
          </>
        ) : (
          <>
            <div className="text-sm text-[var(--color-muted)]">
              {result?.password ? (
                <span className="font-medium text-[var(--color-success-text)]">
                  {t("recovery:found", { password: result.password })}
                </span>
              ) : result ? (
                <span>{t("recovery:not_found")}</span>
              ) : (
                t("recovery:ready")
              )}
            </div>
            {tab === "dictionary" && (
              <Button onClick={runDictionary} disabled={wordlistCount === null}>
                {t("recovery:start")} · {t("recovery:mode_dictionary")}
              </Button>
            )}
            {tab === "mask" && (
              <Button disabled title={t("recovery:mask_unimplemented")}>
                {t("recovery:mode_mask")}
              </Button>
            )}
            {tab === "brute" && (
              <Button onClick={runBrute} disabled={fullCharset.length === 0}>
                {t("recovery:start")} · {t("recovery:mode_brute")}
              </Button>
            )}
          </>
        )}
      </div>

      {error && <p className="text-xs text-[var(--color-danger-text)]">{error}</p>}
    </div>
  );
}
