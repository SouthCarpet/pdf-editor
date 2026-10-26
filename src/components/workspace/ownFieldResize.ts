import type { PageViewport } from "pdfjs-dist";
import type { OwnFieldKind } from "@/bindings";
import type { ScreenRect } from "./detectedFieldGeometry";
import { resizeScreenEdge, toPdfRect, type ResizeEdge } from "./pendingAnnotationGeometry";
import { clampToPage } from "./ownFieldGeometry";

/** The existing pointer resize rule, also used by the keyboard handles. */
export function resizeOwnFieldEdge(
  base: ScreenRect, kind: OwnFieldKind, viewport: PageViewport,
  edge: ResizeEdge, coordinate: number,
): [number, number, number, number] {
  const resized = resizeScreenEdge(base, edge, coordinate, 12 * viewport.scale);
  const rect = toPdfRect(resized, viewport);
  if (kind === "checkbox") {
    const requested = edge === "left" || edge === "right" ? rect[2] - rect[0] : rect[3] - rect[1];
    const side = Math.min(requested, Math.abs(viewport.viewBox[2] - viewport.viewBox[0]), Math.abs(viewport.viewBox[3] - viewport.viewBox[1]));
    return clampToPage([rect[0], rect[1], rect[0] + side, rect[1] + side], viewport.viewBox);
  }
  return clampToPage(rect, viewport.viewBox);
}
