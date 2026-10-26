import { useState } from "react";
import { readToken } from "@/lib/tokens";

const PAPER_CLASS = "paper-light";

/** A hidden element in the light paper scope. Its computed tokens do not follow the app theme. */
function paperProbe(): Element {
  const found = document.querySelector(`body > [data-paper-probe]`);
  if (found) return found;
  const probe = document.createElement("span");
  probe.className = PAPER_CLASS;
  probe.hidden = true;
  probe.dataset.paperProbe = "";
  document.body.append(probe);
  return probe;
}

function canvasColors() {
  const probe = paperProbe();
  return {
    accent: readToken("--color-accent", "#555", probe),
    soft: readToken("--color-accent-soft", "#eee", probe),
    text: readToken("--color-accent-soft-foreground", "#111", probe),
    well: readToken("--color-well", "#eee", probe),
  };
}

export function canvasOutline(selected: boolean, accent: string) {
  return { stroke: accent, strokeWidth: selected ? 1.5 : 1, dash: selected ? undefined : [3, 3] };
}

/** Canvas cannot resolve var(). The page is paper in both themes, so the palette is the light one and never changes with the theme. */
export function useCanvasColors() {
  const [colors] = useState(canvasColors);
  return colors;
}
