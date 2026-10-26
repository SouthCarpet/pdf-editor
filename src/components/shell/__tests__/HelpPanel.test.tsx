import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HelpPanel } from "../HelpPanel";
import i18n from "@/i18n";

function renderPanel(open = true) {
  const onOpenChange = vi.fn();
  const onShowTour = vi.fn();
  render(<HelpPanel open={open} onOpenChange={onOpenChange} onShowTour={onShowTour} />);
  return { onOpenChange, onShowTour };
}

const TOPICS = [
  "Open a PDF",
  "Use a tool",
  "Save and close",
  "Change the theme",
  "Check for updates",
  "Keyboard shortcuts",
];

describe("HelpPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing while closed", () => {
    renderPanel(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists the six topics, the shortcut topic last", () => {
    renderPanel();
    const dialog = screen.getByRole("dialog", { name: "Help" });
    const titles = within(dialog)
      .getAllByRole("group")
      .map((group) => group.querySelector("summary")?.textContent);
    expect(titles).toEqual(TOPICS);
  });

  it("filters the topics by the search text and opens the matches", async () => {
    renderPanel();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search help" }), "THEME");

    const dialog = screen.getByRole("dialog", { name: "Help" });
    const shown = within(dialog)
      .getAllByRole("group")
      .map((group) => group.querySelector("summary")?.textContent);
    expect(shown).toEqual(["Change the theme"]);
    expect(dialog.querySelector("details")).toHaveProperty("open", true);
  });

  it("says so when no topic matches", async () => {
    renderPanel();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search help" }), "zzzz");
    expect(screen.getByRole("status")).toHaveTextContent("No topic matches. Try another word.");
    expect(screen.queryAllByRole("group")).toHaveLength(0);
  });

  it("lists the workspace shortcuts in the shortcut topic", () => {
    renderPanel();
    const dialog = screen.getByRole("dialog", { name: "Help" });
    expect(within(dialog).getByText(/F1 opens this panel/)).toBeInTheDocument();
    expect(within(dialog).getAllByRole("term").length).toBeGreaterThan(10);
  });

  it("starts the tour and closes through Close", async () => {
    const { onShowTour, onOpenChange } = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Show tour again" }));
    expect(onShowTour).toHaveBeenCalledTimes(1);

    const dialog = screen.getByRole("dialog", { name: "Help" });
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
