// Plan 050 task D2-UX: the short colour palette for the pending-annotation
// text-colour control (R2). Reuses the same per-tool recent-colours the
// Annotations panel's FreeText colour picker already writes to
// (`annotation.freetext`), so a colour the user already picked there shows
// up here too; a fixed base set fills the rest on a fresh profile.
import { getRecentColors } from "@/lib/recentColors";

const FREETEXT_TOOL_KEY = "annotation.freetext";
const BASE_PALETTE = ["#000000", "#dc2626", "#2563eb", "#16a34a"];
const PALETTE_SIZE = 4;

export function getPendingTextPalette(): string[] {
  const merged = [...getRecentColors(FREETEXT_TOOL_KEY), ...BASE_PALETTE];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const hex of merged) {
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(hex);
    if (result.length === PALETTE_SIZE) break;
  }
  return result;
}
