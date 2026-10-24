import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@/i18n";
import i18n from "@/i18n";
import { AlertNote, CheckField, RadioField, SelectField, SliderField, TextField } from "../fields";

describe("tool option fields (Kaliber controls)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("SelectField labels a Kaliber select and reports the chosen value", () => {
    const onChange = vi.fn();
    render(
      <SelectField label="Preset" value="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </SelectField>,
    );
    const select = screen.getByLabelText("Preset");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveClass("k-select");
    fireEvent.change(select, { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("SelectField keeps an explicit accessible name apart from the visible label", () => {
    render(
      <SelectField label="View mode" ariaLabel="Visual difference view mode" value="a" onChange={() => {}}>
        <option value="a">A</option>
      </SelectField>,
    );
    expect(screen.getByRole("combobox", { name: "Visual difference view mode" })).toBeInTheDocument();
  });

  it("SliderField shows the value with its unit and paints the fill", () => {
    const onChange = vi.fn();
    render(<SliderField label="Color DPI" value={150} min={100} max={200} unit="dpi" onChange={onChange} />);
    const slider = screen.getByLabelText("Color DPI") as HTMLInputElement;
    expect(slider).toHaveClass("k-slider");
    expect(slider.style.getPropertyValue("--k-fill")).toBe("50%");
    expect(screen.getByRole("status")).toHaveTextContent("150 dpi");
    fireEvent.change(slider, { target: { value: "180" } });
    expect(onChange).toHaveBeenCalledWith(180);
  });

  it("CheckField toggles through the native checkbox and carries the mark", () => {
    const onChange = vi.fn();
    const { container } = render(<CheckField label="Flatten" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Flatten" }));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(container.querySelector("svg.k-check-mark")).not.toBeNull();
  });

  it("RadioField reports a pick", () => {
    const onChange = vi.fn();
    render(<RadioField name="mode" label="Text" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Text" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("AlertNote names its kind in words, not by colour alone", () => {
    const message = "Engine missing";
    render(<AlertNote kind="warning">{message}</AlertNote>);
    const note = screen.getByRole("status");
    expect(note).toHaveClass("k-alert--warning");
    expect(note).toHaveTextContent("Warning");
    expect(note).toHaveTextContent("Engine missing");
  });

  it("AlertNote uses the alert role for an error and the Slovak word in sk", async () => {
    await i18n.changeLanguage("sk");
    const message = "Zlé";
    render(<AlertNote kind="error">{message}</AlertNote>);
    expect(screen.getByRole("alert")).toHaveTextContent("Chyba");
  });

  it("TextField puts the label around its input", () => {
    render(
      <TextField label="Pages">
        <input type="text" />
      </TextField>,
    );
    expect(screen.getByLabelText("Pages")).toBeInTheDocument();
  });
});
