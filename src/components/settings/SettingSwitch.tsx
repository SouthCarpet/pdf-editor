import type { ReactNode } from "react";

interface SettingSwitchProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

/** The Kaliber switch: a native checkbox with `role="switch"`, the track
 * markup and the label text. */
export function SettingSwitch({ checked, disabled, onChange, children }: SettingSwitchProps) {
  return (
    <label className="k-switch">
      <input
        className="k-switch-input"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="k-switch-track" aria-hidden="true">
        <span className="k-switch-bg" />
        <span className="k-switch-mark k-switch-mark--on" />
        <span className="k-switch-mark k-switch-mark--off" />
        <span className="k-switch-thumb" />
      </span>
      <span className="k-switch-text">{children}</span>
    </label>
  );
}
