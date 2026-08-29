import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  commands,
  type DetectedFormField,
  type FormField,
  type FormValueUpdate,
} from "@/bindings";
import { useAutosave } from "@/hooks/useAutosave";
import { pickSavePath } from "@/tauri/bridge";
import { useWorkspace } from "@/stores/workspaceStore";
// Plan 050 task D2 (added block): scanned pages have no AcroForm, so the
// empty state offers geometry detection instead of only an OCR hint.
import { DetectFieldsSection } from "./DetectFieldsSection";

interface Props {
  docPath: string;
  onSelectPage?: (pageIndex: number) => void;
  detectedFields?: DetectedFormField[] | null;
  onDetectedFields?: (fields: DetectedFormField[]) => void;
}

type DraftValues = Record<string, string | null>;
interface FieldState {
  path: string;
  fields: FormField[] | null;
}

export function EditFormsPanel({
  docPath,
  onSelectPage,
  detectedFields = null,
  onDetectedFields,
}: Props) {
  const { t } = useTranslation("workspace");
  const activePage = useWorkspace((state) => state.activePage);
  const [fieldState, setFieldState] = useState<FieldState>({
    path: docPath,
    fields: null,
  });
  const [initialValues, setInitialValues] = useState<DraftValues>({});
  const [values, setValues] = useState<DraftValues>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await commands.readFormFieldsCmd(docPath);
      if (cancelled) return;
      if (result.status === "error") {
        setErr(formatCommandError(result.error));
        setSaved(false);
        setFieldState({ path: docPath, fields: [] });
        return;
      }
      const seed = Object.fromEntries(result.data.map((field) => [field.id, field.value]));
      setInitialValues(seed);
      setValues(seed);
      setErr(null);
      setSaved(false);
      setFieldState({ path: docPath, fields: result.data });
    })();
    return () => {
      cancelled = true;
    };
  }, [docPath]);

  useAutosave(docPath, { tool: "forms", values }, 5000);

  const fields = fieldState.path === docPath ? fieldState.fields : null;
  const dirtyUpdates = useMemo<FormValueUpdate[]>(() => {
    if (!fields) return [];
    return fields
      .filter((field) => values[field.id] !== initialValues[field.id])
      .map((field) => ({
        field_id: field.id,
        value: values[field.id] ?? null,
      }));
  }, [fields, initialValues, values]);

  function updateValue(fieldId: string, value: string | null) {
    setValues((current) => ({ ...current, [fieldId]: value }));
    setSaved(false);
  }

  async function onSave() {
    if (dirtyUpdates.length === 0) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const output = await pickSavePath({
        defaultPath: docPath.replace(/\.pdf$/i, ".filled.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!output) return;
      const result = await commands.setFormValuesCmd({
        input: docPath,
        output,
        updates: dirtyUpdates,
        job_id: crypto.randomUUID(),
      });
      if (result.status === "error") {
        setErr(formatCommandError(result.error));
        return;
      }
      setInitialValues(values);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (fields === null) {
    return (
      <section aria-labelledby="forms-title" className="space-y-2">
        <PanelTitle />
        <p className="text-xs text-[var(--color-muted)]">{t("forms.loading")}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="forms-title" className="space-y-3">
      <PanelTitle />
      {fields.length === 0 ? (
        <DetectFieldsSection
          docPath={docPath}
          pageIndex={activePage}
          fields={detectedFields}
          onDetected={onDetectedFields ?? (() => {})}
        />
      ) : (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--color-muted)]">
              {t("forms.field_count", { count: fields.length })}
            </span>
            {dirtyUpdates.length > 0 && (
              <span className="font-medium text-[var(--color-warning)]">
                {t("forms.unsaved_count", { count: dirtyUpdates.length })}
              </span>
            )}
          </div>

          <div className="max-h-[480px] divide-y divide-[var(--color-border)] overflow-auto border-y border-[var(--color-border)]">
            {fields.map((field) => (
              <FormFieldRow
                key={field.id}
                field={field}
                value={values[field.id] ?? null}
                onChange={(value) => updateValue(field.id, value)}
                onSelectPage={onSelectPage}
              />
            ))}
          </div>

          <Button
            size="sm"
            className="w-full"
            disabled={busy || dirtyUpdates.length === 0}
            onClick={onSave}
          >
            {busy ? t("forms.saving") : t("forms.save_copy")}
          </Button>
          <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
            {t("forms.live_form_note")}
          </p>
        </>
      )}
      {saved && (
        <p role="status" className="text-xs text-[var(--color-success-text)]">
          {t("forms.saved")}
        </p>
      )}
      {err && (
        <p role="alert" className="text-xs text-[var(--color-danger-text)]">
          {err}
        </p>
      )}
    </section>
  );
}

function PanelTitle() {
  const { t } = useTranslation("workspace");
  return (
    <div>
      <h3 id="forms-title" className="text-sm font-semibold">
        {t("forms.title")}
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-muted)]">
        {t("forms.description")}
      </p>
    </div>
  );
}

function FormFieldRow({
  field,
  value,
  onChange,
  onSelectPage,
}: {
  field: FormField;
  value: string | null;
  onChange: (value: string | null) => void;
  onSelectPage?: (pageIndex: number) => void;
}) {
  const { t } = useTranslation("workspace");
  const editable = !field.read_only && field.kind !== "signature" && field.kind !== "button";
  const label = field.name || t("forms.unnamed");

  return (
    <div className="space-y-2 py-3 first:pt-2 last:pb-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <label
          htmlFor={`form-field-${field.id}`}
          className="min-w-0 truncate text-xs font-medium"
          title={label}
        >
          {label}
          {field.required && (
            <span className="ml-0.5 text-[var(--color-danger-text)]" aria-label={t("forms.required")}>
              *
            </span>
          )}
        </label>
        {field.page_index !== null && (
          <button
            type="button"
            onClick={() => onSelectPage?.(field.page_index!)}
            className="shrink-0 text-[10px] text-[var(--color-muted)] underline-offset-2 hover:underline"
          >
            {t("forms.page", { page: field.page_index + 1 })}
          </button>
        )}
      </div>

      <FieldControl
        id={`form-field-${field.id}`}
        field={field}
        value={value}
        editable={editable}
        onChange={onChange}
      />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-[var(--color-muted)] capitalize">
          {t(`forms.kind.${field.kind}`)}
          {field.read_only ? ` · ${t("forms.read_only")}` : ""}
        </span>
        {editable && value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] font-medium text-[var(--color-danger-text)] underline-offset-2 hover:underline"
          >
            {t("forms.clear")}
          </button>
        )}
      </div>
    </div>
  );
}

function FieldControl({
  id,
  field,
  value,
  editable,
  onChange,
}: {
  id: string;
  field: FormField;
  value: string | null;
  editable: boolean;
  onChange: (value: string | null) => void;
}) {
  const { t } = useTranslation("workspace");

  if (field.kind === "checkbox") {
    const onValue = field.options[0] ?? "Yes";
    return (
      <label htmlFor={id} className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
        <input
          id={id}
          type="checkbox"
          disabled={!editable}
          checked={value !== null && value !== "Off"}
          onChange={(event) => onChange(event.target.checked ? onValue : null)}
        />
        {value !== null && value !== "Off" ? t("forms.checked") : t("forms.not_checked")}
      </label>
    );
  }

  if (field.kind === "radio" || field.kind === "choice") {
    const options =
      value !== null && !field.options.includes(value) ? [value, ...field.options] : field.options;
    return (
      <select
        id={id}
        disabled={!editable}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-8 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-xs"
      >
        <option value="">{t("forms.no_value")}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      id={id}
      type="text"
      disabled={!editable}
      value={value ?? ""}
      placeholder={value === null ? t("forms.no_value") : undefined}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-xs disabled:opacity-60"
    />
  );
}

function formatCommandError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "detail" in error.data &&
    typeof error.data.detail === "string"
  ) {
    return error.data.detail;
  }
  return JSON.stringify(error);
}
