// Kaliber controls for the tool option panels (plan 119 K3a). Each field keeps
// the native element (select, range, checkbox) and adds the Kaliber classes
// from adoption.md "The control set". Colours, radii and durations come from
// kaliber.css only.
import { useId, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface SelectFieldProps {
  label: string;
  /** Accessible name when it must differ from the visible label. */
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}

export function SelectField({
  label,
  ariaLabel,
  value,
  onChange,
  children,
  disabled,
}: SelectFieldProps) {
  const id = useId();
  return (
    <div className="k-field-block">
      <label className="k-label" htmlFor={id}>
        {label}
      </label>
      <span className="k-select-wrap w-full">
        <select
          id={id}
          className="k-select"
          aria-label={ariaLabel}
          value={value}
          disabled={disabled}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        >
          {children}
        </select>
        <svg
          className="k-select-chevron"
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  /** Accessible name when it must differ from the visible label. */
  ariaLabel?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Text after the number, for example "dpi" or "%". */
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function SliderField({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  disabled,
}: SliderFieldProps) {
  const id = useId();
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="k-slider-row">
      <label className="k-slider-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="k-slider"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ "--k-fill": `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output className="k-slider-value k-num" htmlFor={id}>
        {value}
        {unit ? ` ${unit}` : ""}
      </output>
    </div>
  );
}

interface CheckFieldProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function CheckField({ label, checked, onChange, disabled }: CheckFieldProps) {
  return (
    <label className="k-check">
      <input
        type="checkbox"
        className="k-check-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <svg className="k-check-mark" viewBox="0 0 12 12" aria-hidden="true">
        <path className="k-check-tick" d="M2 6.5 5 9.5 10 3" pathLength="1" />
        <path className="k-check-dash" d="M2.5 6h7" pathLength="1" />
      </svg>
      <span className="k-check-text">{label}</span>
    </label>
  );
}

interface RadioFieldProps {
  name: string;
  label: ReactNode;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export function RadioField({ name, label, checked, onChange, disabled }: RadioFieldProps) {
  return (
    <label className="k-radio-row">
      <input
        type="radio"
        className="k-radio-input"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="k-radio-dot" aria-hidden="true" />
      <span className="k-radio-text">{label}</span>
    </label>
  );
}

interface AlertNoteProps {
  kind: "info" | "success" | "warning" | "error";
  children: ReactNode;
}

const ALERT_ICON: Record<AlertNoteProps["kind"], ReactNode> = {
  info: (
    <>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.25v4M8 4.6v1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  success: (
    <>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m5 8.2 2 2 4-4.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  warning: (
    <path
      d="M8 2 14.5 13.5h-13ZM8 6.5V10m0 1.5v.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  ),
  error: (
    <>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m5.5 5.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
};

/** An inline note with one icon and one word per kind; no side stripe. */
export function AlertNote({ kind, children }: AlertNoteProps) {
  const { t } = useTranslation("tools");
  const labels: Record<AlertNoteProps["kind"], string> = {
    info: t("alert.info"),
    success: t("alert.success"),
    warning: t("alert.warning"),
    error: t("alert.error"),
  };
  return (
    <div className={`k-alert k-alert--${kind}`} role={kind === "error" ? "alert" : "status"}>
      <svg className="k-alert-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        {ALERT_ICON[kind]}
      </svg>
      <div className="k-alert-body">
        <span className="k-alert-label">{labels[kind]}</span>
        <span>{children}</span>
      </div>
    </div>
  );
}

interface TextFieldProps {
  label: ReactNode;
  children: ReactNode;
}

/** A label above a text or number input. The input itself stays the shared Input. */
export function TextField({ label, children }: TextFieldProps) {
  return (
    <label className="k-field-block">
      <span className="k-label">{label}</span>
      {children}
    </label>
  );
}
