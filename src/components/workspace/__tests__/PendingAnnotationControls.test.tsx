// Plan 050 task D2-UX (R2, R5): the control strip for a selected pending
// FreeText annotation. Slovak UI copy, font-size stepper, colour palette,
// text edit and delete all drive plain callbacks - the store wiring itself
// is covered by `annotationsStore.test.ts` and `Workspace.tsx`'s own use
// of this component.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TextStyle } from "@/bindings";
import i18n from "@/i18n";
import { PendingAnnotationControls } from "../PendingAnnotationControls";

const SCREEN_RECT = { x: 10, y: 20, width: 100, height: 24 };
const STYLE: TextStyle = {
  font_family: "Helvetica",
  font_postscript_name: "Helvetica",
  size_pt: 14,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  color: [0, 0, 0],
  background: null,
  align: "left",
  vertical_align: "top",
  letter_spacing: 0,
  line_height_multiplier: 1.2,
};

describe("PendingAnnotationControls", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sk");
  });

  it("shows the Slovak labels and the current text", async () => {
    render(
      <PendingAnnotationControls
        screenRect={SCREEN_RECT}
        text="Peter"
        sizePt={14}
        colorHex="#000000"
        onChangeText={vi.fn()}
        onChangeSize={vi.fn()}
        onChangeColor={vi.fn()}
        onDelete={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue("Peter")).toBeInTheDocument();
    expect(screen.getByText("Veľkosť písma")).toBeInTheDocument();
    expect(screen.getByText("Farba textu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Odstrániť" })).toBeInTheDocument();
  });

  it("increasing and decreasing the size stepper reports the new size", async () => {
    const onChangeSize = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingAnnotationControls
        screenRect={SCREEN_RECT}
        text="Peter"
        sizePt={14}
        colorHex="#000000"
        onChangeText={vi.fn()}
        onChangeSize={onChangeSize}
        onChangeColor={vi.fn()}
        onDelete={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Zväčšiť písmo" }));
    expect(onChangeSize).toHaveBeenCalledWith(15);

    await user.click(screen.getByRole("button", { name: "Zmenšiť písmo" }));
    expect(onChangeSize).toHaveBeenCalledWith(13);
  });

  it("clamps the size stepper to the 6-200pt range", async () => {
    const onChangeSize = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingAnnotationControls
        screenRect={SCREEN_RECT}
        text="Peter"
        sizePt={6}
        colorHex="#000000"
        onChangeText={vi.fn()}
        onChangeSize={onChangeSize}
        onChangeColor={vi.fn()}
        onDelete={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Zmenšiť písmo" }));
    expect(onChangeSize).toHaveBeenCalledWith(6);
  });

  it("editing the text field reports the new value", async () => {
    const onChangeText = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingAnnotationControls
        screenRect={SCREEN_RECT}
        text=""
        sizePt={14}
        colorHex="#000000"
        onChangeText={onChangeText}
        onChangeSize={vi.fn()}
        onChangeColor={vi.fn()}
        onDelete={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await user.type(screen.getByDisplayValue(""), "X");
    expect(onChangeText).toHaveBeenCalledWith("X");
  });

  it("picking a palette colour reports its hex value", async () => {
    const onChangeColor = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingAnnotationControls
        screenRect={SCREEN_RECT}
        text="Peter"
        sizePt={14}
        colorHex="#000000"
        onChangeText={vi.fn()}
        onChangeSize={vi.fn()}
        onChangeColor={onChangeColor}
        onDelete={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "#dc2626" }));
    expect(onChangeColor).toHaveBeenCalledWith("#dc2626");
  });

  it("delete calls onDelete", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingAnnotationControls
        screenRect={SCREEN_RECT}
        text="Peter"
        sizePt={14}
        colorHex="#000000"
        onChangeText={vi.fn()}
        onChangeSize={vi.fn()}
        onChangeColor={vi.fn()}
        onDelete={onDelete}
        onConfirm={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Odstrániť" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("Potvrdiť calls onConfirm", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingAnnotationControls
        screenRect={SCREEN_RECT}
        text="Peter"
        sizePt={14}
        colorHex="#000000"
        onChangeText={vi.fn()}
        onChangeSize={vi.fn()}
        onChangeColor={vi.fn()}
        onDelete={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole("button", { name: "Potvrdiť" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("Escape calls onConfirm (R1)", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingAnnotationControls
        screenRect={SCREEN_RECT}
        text="Peter"
        sizePt={14}
        colorHex="#000000"
        onChangeText={vi.fn()}
        onChangeSize={vi.fn()}
        onChangeColor={vi.fn()}
        onDelete={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    await user.keyboard("{Escape}");
    expect(onConfirm).toHaveBeenCalled();
  });

  it("Enter in the text field calls onConfirm (R1)", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingAnnotationControls
        screenRect={SCREEN_RECT}
        text="Peter"
        sizePt={14}
        colorHex="#000000"
        onChangeText={vi.fn()}
        onChangeSize={vi.fn()}
        onChangeColor={vi.fn()}
        onDelete={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByDisplayValue("Peter"));
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalled();
  });

  it("reports Standard-14 family and face changes through one complete style patch", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingAnnotationControls
        screenRect={SCREEN_RECT}
        text="Peter"
        sizePt={14}
        colorHex="#000000"
        onChangeText={vi.fn()}
        onChangeSize={vi.fn()}
        onChangeColor={vi.fn()}
        onDelete={vi.fn()}
        onConfirm={vi.fn()}
        styleEditing={{ style: STYLE, onChange }}
      />
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Písmo" }), "Times");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        font_family: "Times",
        font_postscript_name: "Times-Roman",
      })
    );

    await user.click(screen.getByRole("button", { name: "Tučné" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ bold: true, font_postscript_name: "Helvetica-Bold" })
    );

    await user.click(screen.getByRole("button", { name: "Kurzíva" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ italic: true, font_postscript_name: "Helvetica-Oblique" })
    );
  });

  it("reports decoration and horizontal and vertical alignment style patches", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingAnnotationControls
        screenRect={SCREEN_RECT}
        text="Peter"
        sizePt={14}
        colorHex="#000000"
        onChangeText={vi.fn()}
        onChangeSize={vi.fn()}
        onChangeColor={vi.fn()}
        onDelete={vi.fn()}
        onConfirm={vi.fn()}
        styleEditing={{ style: STYLE, onChange }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Podčiarknutie" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ underline: true }));

    await user.click(screen.getByRole("button", { name: "Prečiarknutie" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ strikethrough: true }));

    await user.click(screen.getByRole("button", { name: "Na stred" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ align: "center" }));

    await user.click(screen.getByRole("button", { name: "Dole" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ vertical_align: "bottom" })
    );
  });
});
