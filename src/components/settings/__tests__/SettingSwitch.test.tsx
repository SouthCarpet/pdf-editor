import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SettingSwitch } from "../SettingSwitch";

// Oracle: 119-K5 finding 2. A switch in a column of settings must size to
// its track and label, keeping the label beside the control.
it("keeps the unchecked switch and its label together in a content-sized row", () => {
  const label = "Open last document";
  render(<SettingSwitch checked={false} onChange={() => {}}>{label}</SettingSwitch>);
  const control = screen.getByRole("switch", { name: "Open last document" });
  expect(control).not.toBeChecked();
  expect(control.closest("label")).toHaveClass("k-switch", "self-start");
  expect(screen.getByText("Open last document")).toHaveClass("k-switch-text");
});
