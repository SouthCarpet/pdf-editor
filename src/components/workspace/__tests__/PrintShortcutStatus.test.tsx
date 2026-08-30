import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { useDocuments } from "@/stores/documentStore";
import { PrintShortcutStatus } from "../PrintShortcutStatus";

describe("PrintShortcutStatus", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sk");
    useDocuments.setState({ documents: new Map(), activeDocId: null });
  });

  // Oracle: T4.4 R1 gives Ctrl+P a muted no-document result, including in inputs.
  it("shows the no-document status when Ctrl+P is pressed in a text input", async () => {
    render(
      <>
        <input data-testid="input" />
        <PrintShortcutStatus />
      </>,
    );

    fireEvent.keyDown(screen.getByTestId("input"), { key: "p", ctrlKey: true });

    expect(await screen.findByRole("status")).toHaveTextContent("Najskôr otvorte dokument.");
  });
});
