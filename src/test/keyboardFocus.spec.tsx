import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Select, SelectTrigger } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SettingSwitch } from "@/components/settings/SettingSwitch";

beforeAll(() => {
  // jsdom has no layout engine; the slider still needs the browser API.
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterAll(() => vi.unstubAllGlobals());

// Oracle: E1 item 18. Each shipped control family must be reachable by Tab.
// These are real controls, not DOM stand-ins for their vendor primitives.
const actionLabel = "Action";
const cases: [string, ReactElement, string][] = [
  ["button", <Button>Action</Button>, "button"],
  ["text input", <Input aria-label={actionLabel} />, "textbox"],
  ["number input", <Input type="number" aria-label={actionLabel} />, "spinbutton"],
  ["text area", <textarea aria-label={actionLabel} />, "textbox"],
  ["native select", <select className="k-select" aria-label={actionLabel}><option>One</option></select>, "combobox"],
  ["custom select", <Select><SelectTrigger aria-label={actionLabel} /></Select>, "combobox"],
  ["checkbox", <Checkbox aria-label={actionLabel} />, "checkbox"],
  ["switch", <SettingSwitch checked={false} onChange={() => {}}>Action</SettingSwitch>, "switch"],
  ["radio", <label className="k-segmented-item"><input className="k-segmented-input" type="radio" name="choice" />Action</label>, "radio"],
  ["slider", <Slider defaultValue={[50]} />, "slider"],
  ["toggle", <ToggleGroup type="single"><ToggleGroupItem value="one">Action</ToggleGroupItem></ToggleGroup>, "radio"],
  ["link", <a href="#action">Action</a>, "link"],
];

it.each(cases)("Tab reaches the %s control", async (_name, control, role) => {
  render(control);
  await userEvent.tab();
  expect(screen.getByRole(role)).toHaveFocus();
});
