import { useEffect, useState } from "react";
import { readToken } from "@/lib/tokens";

function canvasColors() {
  return {
    accent: readToken("--color-accent", "#555"),
    soft: readToken("--color-accent-soft", "#eee"),
    text: readToken("--color-accent-soft-foreground", "#111"),
    well: readToken("--color-well", "#eee"),
  };
}

export function canvasOutline(selected: boolean, accent: string) {
  return { stroke: accent, strokeWidth: selected ? 1.5 : 1, dash: selected ? undefined : [3, 3] };
}

/** Canvas cannot resolve var(). Refresh the palette when the live theme changes. */
export function useCanvasColors() {
  const [colors, setColors] = useState(canvasColors);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(canvasColors()));
    observer.observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-theme", "class"],
    });
    return () => observer.disconnect();
  }, []);
  return colors;
}
