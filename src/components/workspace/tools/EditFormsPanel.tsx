import { useEffect, useMemo, useRef, useState, type ComponentProps, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands, type DetectedFormField, type FormField, type OwnFieldKind } from "@/bindings";
import { NO_ANNOTATIONS, useAnnotations, type ClientAnnotation } from "@/stores/annotationsStore";
import type { OwnFieldAnnotation } from "../pendingAnnotationGeometry";
import { clampToPage } from "../ownFieldGeometry";
import { useAutosave } from "@/hooks/useAutosave";
import { latestSavedSource } from "@/lib/documentSave";
import { changedFields, saveFormDraft } from "@/lib/formDraftSave";
import { pickSavePath } from "@/tauri/bridge";
import { useDocuments } from "@/stores/documentStore";
import { useWorkspace } from "@/stores/workspaceStore";
import { NO_FORM_DRAFT, useFormDrafts } from "@/stores/formDraftStore";
// Plan 050 task D2 (added block): scanned pages have no AcroForm, so the
// empty state offers geometry detection instead of only an OCR hint.
import { DetectFieldsSection } from "./DetectFieldsSection";

interface Props {
  docPath: string;
  onSelectPage?: (pageIndex: number) => void;
  detectedFields?: DetectedFormField[] | null;
  onDetectedFields?: (fields: DetectedFormField[]) => void;
  /** PDF-point page size (scale-1 viewport). Workspace should pass `basePageSize`. */
  pageSize?: { width: number; height: number };
  // Plan 050 task D2-UX-2 (R7a): forwarded to `DetectFieldsSection` so the
  // auto-detect dedup survives this panel remounting. Optional so a caller
  // that never triggers `requestAutoDetectForms` (a raw render in a test,
  // say) does not have to invent one; a local fallback ref is used instead
  // — it just will not survive ITS OWN remounts, which matches the
  // pre-R7a behaviour for that caller.
  autoDetectHandledRef?: RefObject<number>;
  fieldPlacement?: OwnFieldKind | null;
  onFieldPlacementChange?: (kind: OwnFieldKind | null) => void;
  selectedOwnFieldId?: string | null;
  onSelectOwnField?: (id: string) => void;
  pageBox?: readonly number[];
}

type DraftValues = Record<string, string | null>;
interface FieldState {
  path: string;
  fields: FormField[] | null;
}

const noop = () => {};

export function EditFormsPanel({
  docPath,
  onSelectPage,
  detectedFields = null,
  onDetectedFields,
  autoDetectHandledRef,
  pageSize,
  fieldPlacement = null,
  onFieldPlacementChange = noop,
  selectedOwnFieldId = null,
  onSelectOwnField,
  pageBox = [0, 0, 612, 792],
}: Props) {
  const fallbackAutoDetectHandledRef = useRef(0);
  const { t } = useTranslation("workspace");
  const activePage = useWorkspace((state) => state.activePage);
  const form = useFormPanelState(docPath);
  const detect = {
    docPath,
    pageIndex: activePage,
    fields: detectedFields,
    onDetected: onDetectedFields ?? noop,
    autoDetectHandledRef: autoDetectHandledRef ?? fallbackAutoDetectHandledRef,
    pageSize,
  };

  if (form.fields === null) {
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
      <OwnFieldsSection
        docPath={docPath}
        placement={fieldPlacement}
        onPlacementChange={onFieldPlacementChange}
        selectedId={selectedOwnFieldId}
        onSelect={onSelectOwnField}
        pageBox={pageBox}
      />
      {form.fields.length === 0 ? (
        <DetectFieldsSection {...detect} />
      ) : (
        <FieldsBody
          fields={form.fields}
          values={form.values}
          dirtyCount={form.dirtyCount}
          busy={form.busy}
          onUpdate={form.updateValue}
          onSave={form.onSave}
          onSelectPage={onSelectPage}
          detect={detect}
        />
      )}
      <SaveStatus saved={form.saved} err={form.err} />
    </section>
  );
}

type PendingOwnField = ClientAnnotation & OwnFieldAnnotation;

function OwnFieldsSection({
  docPath,
  placement,
  onPlacementChange,
  selectedId,
  onSelect = noop,
  pageBox,
}: {
  docPath: string;
  placement: OwnFieldKind | null;
  onPlacementChange: (kind: OwnFieldKind | null) => void;
  selectedId: string | null;
  onSelect?: (id: string) => void;
  pageBox: readonly number[];
}) {
  const { t } = useTranslation("workspace");
  const items = useAnnotations((s) => s.byDoc[docPath] ?? NO_ANNOTATIONS);
  const selected = items.find(
    (item): item is PendingOwnField => item.type === "form_field" && item.__clientId === selectedId
  );
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onPlacementChange(null);
        return;
      }
      if (!selected || event.defaultPrevented || isTyping(event.target)) return;
      if (ownFieldKey(event, docPath, selected, pageBox)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [docPath, onPlacementChange, pageBox, selected]);
  useEffect(() => () => onPlacementChange(null), [onPlacementChange]);
  return (
    <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
      <h4 className="text-xs font-semibold">{t("forms.own.title")}</h4>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-pressed={placement === "text"}
          onClick={() => onPlacementChange("text")}
        >
          {t("forms.own.text")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={placement === "checkbox"}
          onClick={() => onPlacementChange("checkbox")}
        >
          {t("forms.own.checkbox")}
        </Button>
      </div>
      {placement && (
        <p role="status" className="text-xs text-[var(--color-muted)]">
          {t("forms.own.place_hint")}
        </p>
      )}
      <PendingOwnFieldList items={items} selectedId={selectedId} onSelect={onSelect} />
      {selected && <OwnFieldEditor docPath={docPath} field={selected} />}
      <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
        {t("forms.own.save_hint")}
      </p>
    </div>
  );
}

function PendingOwnFieldList({
  items,
  selectedId,
  onSelect,
}: {
  items: ClientAnnotation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation("workspace");
  const fields = items.filter((item): item is PendingOwnField => item.type === "form_field");
  if (fields.length === 0) return null;
  return (
    <ul className="max-h-32 divide-y divide-[var(--color-border)] overflow-auto">
      {fields.map((field) => (
        <li key={field.__clientId}>
          <button
            type="button"
            aria-pressed={field.__clientId === selectedId}
            onClick={() => onSelect(field.__clientId)}
            className="flex min-h-8 w-full items-center justify-between gap-2 text-left text-xs"
          >
              <span className="truncate">{field.name || t("forms.unnamed")}</span>{" "}
            <span className="shrink-0 text-[var(--color-muted)]">
              {t("forms.page", { page: field.page + 1 })}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable)
  );
}

function ownFieldKey(
  event: KeyboardEvent,
  docPath: string,
  field: PendingOwnField,
  pageBox: readonly number[]
): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key === "Delete" || event.key === "Backspace") {
    useAnnotations.getState().remove(docPath, field.__clientId);
    return true;
  }
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
  };
  const direction = delta[event.key];
  if (!direction) return false;
  const step = event.shiftKey ? 10 : 1;
  const [x1, y1, x2, y2] = field.rect.map((value) => value ?? 0);
  const [dx, dy] = direction.map((value) => value * step);
  useAnnotations.getState().update(docPath, field.__clientId, {
    rect: clampToPage([x1 + dx, y1 + dy, x2 + dx, y2 + dy], pageBox),
  });
  return true;
}

function OwnFieldEditor({ docPath, field }: { docPath: string; field: PendingOwnField }) {
  const { t } = useTranslation("workspace");
  const update = (patch: Partial<OwnFieldAnnotation>) =>
    useAnnotations.getState().update(docPath, field.__clientId, patch);
  const id = `own-field-${field.__clientId}`;
  return (
    <div className="space-y-2" data-own-field-editor>
      <label htmlFor={id} className="block text-xs">
        {t("forms.own.name")}
      </label>
      <input
        id={id}
        value={field.name}
        onChange={(event) => update({ name: event.target.value })}
        className="h-8 w-full border border-[var(--color-border)] bg-[var(--color-control)] px-2 text-xs"
      />
      <p className="text-xs text-[var(--color-muted)]">{t(`forms.kind.${field.kind}`)}</p>
      {field.kind === "text" && (
        <>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={field.multiline}
              onChange={(event) => update({ multiline: event.target.checked })}
            />
            {t("forms.own.multiline")}
          </label>
          <label htmlFor={`${id}-size`} className="block text-xs">
            {t("forms.own.font_size")}
          </label>
          <input
            id={`${id}-size`}
            type="number"
            min={0}
            step={1}
            value={field.font_size ?? 0}
            onChange={(event) => {
              const value = event.target.value === "" ? 0 : event.target.valueAsNumber;
              if (Number.isFinite(value) && value >= 0) update({ font_size: value });
            }}
            className="h-8 w-full border border-[var(--color-border)] bg-[var(--color-control)] px-2 text-xs"
          />
        </>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => useAnnotations.getState().remove(docPath, field.__clientId)}
      >
        {t("forms.own.delete")}
      </Button>
      <p className="text-[11px] text-[var(--color-muted)]">{t("forms.own.move_hint")}</p>
    </div>
  );
}

/** Reads the fields of the latest saved copy and owns the draft, save and
 * status state of the panel. */
function useFormPanelState(docPath: string) {
  const [fieldState, setFieldState] = useState<FieldState>({
    path: docPath,
    fields: null,
  });
  // Plan 119 p1: the values in the file stay local; what the user typed
  // and what the last save wrote live in `formDraftStore`, so they survive
  // this panel unmounting on a sub-tool switch.
  // Plan 119 p1b: "the file" is the latest saved copy, the same file the
  // page view shows. It is read again after every save.
  const [fileValues, setFileValues] = useState<DraftValues>({});
  const savedRevision = useDocuments((state) => state.documents.get(docPath)?.savedRevision ?? 0);
  const draft = useFormDrafts((state) => state.byDoc[docPath] ?? NO_FORM_DRAFT);
  const setDraftValue = useFormDrafts((state) => state.setValue);
  const values = useMemo(() => ({ ...fileValues, ...draft.values }), [fileValues, draft]);
  const savedValues = useMemo(() => ({ ...fileValues, ...draft.saved }), [fileValues, draft]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await commands.readFormFieldsCmd(latestSavedSource(docPath));
      if (cancelled) return;
      if (result.status === "error") {
        setErr(formatCommandError(result.error));
        setSaved(false);
        setFieldState({ path: docPath, fields: [] });
        return;
      }
      const seed = Object.fromEntries(result.data.map((field) => [field.id, field.value]));
      setFileValues(seed);
      setErr(null);
      setSaved(false);
      setFieldState({ path: docPath, fields: result.data });
    })();
    return () => {
      cancelled = true;
    };
  }, [docPath, savedRevision]);

  useAutosave(docPath, { tool: "forms", values }, 5000);

  const fields = fieldState.path === docPath ? fieldState.fields : null;
  // Unsaved: changed since the last save. `saveFormDraft` sends the values
  // that differ from the file the save starts from (the latest saved copy).
  const dirtyCount = useMemo(
    () => changedFields(fields, values, savedValues).length,
    [fields, savedValues, values]
  );

  function updateValue(field: FormField, value: string | null) {
    setDraftValue(docPath, field.id, value, {
      kind: field.kind,
      page_index: field.page_index,
      rect: field.rect,
    });
    setSaved(false);
  }

  async function onSave() {
    if (dirtyCount === 0) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const output = await saveOutputPath(docPath);
      if (!output) return;
      // Plan 119 p1b: the save writes the values typed when it starts. A
      // value typed while it writes is not in the file and stays unsaved.
      const result = await saveFormDraft(docPath, latestSavedSource(docPath), output);
      if (!result.ok) {
        setErr(formatCommandError(result.error));
        return;
      }
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return { fields, values, dirtyCount, busy, err, saved, updateValue, onSave };
}

function FieldsBody({
  fields,
  values,
  dirtyCount,
  busy,
  onUpdate,
  onSave,
  onSelectPage,
  detect,
}: {
  fields: FormField[];
  values: DraftValues;
  dirtyCount: number;
  busy: boolean;
  onUpdate: (field: FormField, value: string | null) => void;
  onSave: () => void;
  onSelectPage?: (pageIndex: number) => void;
  detect: ComponentProps<typeof DetectFieldsSection>;
}) {
  const { t } = useTranslation("workspace");
  return (
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-muted)]">
          {t("forms.field_count", { count: fields.length })}
        </span>
        {dirtyCount > 0 && (
          <span className="font-medium text-[var(--color-warning-text)]">
            {t("forms.unsaved_count", { count: dirtyCount })}
          </span>
        )}
      </div>

      <div className="max-h-[480px] divide-y divide-[var(--color-border)] overflow-auto border-y border-[var(--color-border)]">
        {fields.map((field) => (
          <FormFieldRow
            key={field.id}
            field={field}
            value={values[field.id] ?? null}
            onChange={(value) => onUpdate(field, value)}
            onSelectPage={onSelectPage}
          />
        ))}
      </div>

      <Button size="sm" className="w-full" disabled={busy || dirtyCount === 0} onClick={onSave}>
        {busy ? t("forms.saving") : t("forms.save_copy")}
      </Button>
      <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
        {t("forms.live_form_note")}
      </p>
      {/* Plan 119 p1c: a page of this document may hold printed boxes
          that are no form field (a scan appended to a form). */}
      <DetectFieldsSection {...detect} hasNativeFields />
    </>
  );
}

function SaveStatus({ saved, err }: { saved: boolean; err: string | null }) {
  const { t } = useTranslation("workspace");
  return (
    <>
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
    </>
  );
}

/** Plan 119 p1b: like the FreeText save, a later save writes over the saved
 * copy without asking; the first one asks for a path. */
async function saveOutputPath(docPath: string): Promise<string | null> {
  const savedPath = useDocuments.getState().documents.get(docPath)?.savedPath;
  if (savedPath) return savedPath;
  return pickSavePath({
    defaultPath: docPath.replace(/\.pdf$/i, ".filled.pdf"),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
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
            <span
              className="ml-0.5 text-[var(--color-danger-text)]"
              aria-label={t("forms.required")}
            >
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

interface ControlProps {
  id: string;
  field: FormField;
  value: string | null;
  editable: boolean;
  onChange: (value: string | null) => void;
}

function isChecked(value: string | null): boolean {
  return value !== null && value !== "Off";
}

function FieldControl(props: ControlProps) {
  switch (props.field.kind) {
    case "checkbox":
      return <CheckboxControl {...props} />;
    case "radio":
    case "choice":
      return <ChoiceControl {...props} />;
    default:
      return <TextControl {...props} />;
  }
}

function CheckboxControl({ id, field, value, editable, onChange }: ControlProps) {
  const { t } = useTranslation("workspace");
  const onValue = field.options[0] ?? "Yes";
  const checked = isChecked(value);
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
      <input
        id={id}
        type="checkbox"
        disabled={!editable}
        checked={checked}
        onChange={(event) => onChange(event.target.checked ? onValue : null)}
      />
      {checked ? t("forms.checked") : t("forms.not_checked")}
    </label>
  );
}

function ChoiceControl({ id, field, value, editable, onChange }: ControlProps) {
  const { t } = useTranslation("workspace");
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

function TextControl({ id, value, editable, onChange }: ControlProps) {
  const { t } = useTranslation("workspace");
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
