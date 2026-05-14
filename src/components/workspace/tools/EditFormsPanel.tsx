// Phase 12 Task 66 — Edit Tier 1 (AcroForm) panel.
//
// Loads form fields via `read_form_fields_cmd` and renders one HTML input
// per field (text, checkbox, choice, signature). The user mutates values
// in-place; Save invokes `set_form_values_cmd` to write the changes back
// to a new file. Values are also autosaved every 5s.
import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands, type FormField } from "@/bindings";
import { useAutosave } from "@/hooks/useAutosave";

interface Props {
  docPath: string;
}

export function EditFormsPanel({ docPath }: Props) {
  const { t } = useTranslation("common");
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load fields when the document path changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await commands.readFormFieldsCmd(docPath);
      if (cancelled) return;
      if (r.status === "error") {
        setErr(JSON.stringify(r.error));
        setFields([]);
        return;
      }
      setFields(r.data);
      // Seed the values map from any existing /V entries.
      const seed: Record<string, string> = {};
      for (const f of r.data) if (f.name) seed[f.name] = f.value ?? "";
      setValues(seed);
    })();
    return () => {
      cancelled = true;
    };
  }, [docPath]);

  // Autosave the in-progress edits.
  useAutosave(docPath, { tool: "forms", values }, 5000);

  const fieldCount = fields?.length ?? 0;
  const summary = useMemo(() => {
    if (fields === null) return "Loading…";
    if (fields.length === 0) return "No AcroForm fields detected.";
    return `${fieldCount} field${fieldCount === 1 ? "" : "s"} detected.`;
  }, [fields, fieldCount]);

  async function onSave() {
    setBusy(true);
    setErr(null);
    try {
      const out = await save({
        defaultPath: docPath.replace(/\.pdf$/i, ".filled.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!out) return;
      const r = await commands.setFormValuesCmd({
        input: docPath,
        output: out,
        values,
        job_id: crypto.randomUUID(),
      });
      if (r.status === "error") setErr(JSON.stringify(r.error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("tools.edit")} — Forms</h3>
      <p className="text-xs text-[var(--color-muted)]">{summary}</p>
      <div className="max-h-[480px] space-y-2 overflow-auto">
        {fields?.map((f, i) => (
          <FormFieldRow
            key={`${f.name || "__anon__"}_${i}`}
            field={f}
            value={values[f.name] ?? ""}
            onChange={(v) =>
              setValues((s) => ({ ...s, [f.name]: v }))
            }
          />
        ))}
      </div>
      <Button size="sm" disabled={busy || fieldCount === 0} onClick={onSave}>
        {busy ? "Saving…" : "Save filled PDF"}
      </Button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

function FormFieldRow({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  // Show "(unnamed)" so anonymous widgets render. They can't roundtrip
  // through set_form_values_cmd (which keys on name) but the user can at
  // least see them.
  const label = field.name || "(unnamed)";

  if (field.kind === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={value === "Yes" || value === "On" || value === "true"}
          onChange={(e) => onChange(e.target.checked ? "Yes" : "Off")}
        />
        <span className="truncate">{label}</span>
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="truncate text-[var(--color-muted)]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border px-2 py-1"
      />
    </label>
  );
}
