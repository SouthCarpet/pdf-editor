import type { KeyboardEvent } from "react";
import type { PageViewport } from "pdfjs-dist";
import { useTranslation } from "react-i18next";
import type { ClientAnnotation } from "@/stores/annotationsStore";
import { toScreenRect } from "./detectedFieldGeometry";
import { resizeOwnFieldEdge } from "./ownFieldResize";
import type { ResizeEdge } from "./pendingAnnotationGeometry";

interface Props {
  viewport: PageViewport;
  field: ClientAnnotation;
  onRectChange: (id: string, rect: [number, number, number, number]) => void;
}

/** DOM focus targets over the Konva handles. Pointer drags still belong to Konva. */
export function OwnFieldHandles({ viewport, field, onRectChange }: Props) {
  const { t } = useTranslation("workspace");
  if (field.type !== "form_field") return null;
  const screen = toScreenRect(field.rect, viewport);
  if (!screen) return null;
  const positions = [
    { edge: "left", x: screen.x, y: screen.y + screen.height / 2, label: t("forms.own.resize_left", { name: field.name }) },
    { edge: "right", x: screen.x + screen.width, y: screen.y + screen.height / 2, label: t("forms.own.resize_right", { name: field.name }) },
    { edge: "top", x: screen.x + screen.width / 2, y: screen.y, label: t("forms.own.resize_top", { name: field.name }) },
    { edge: "bottom", x: screen.x + screen.width / 2, y: screen.y + screen.height, label: t("forms.own.resize_bottom", { name: field.name }) },
  ] as const;
  function resize(edge: ResizeEdge, coordinate: number, event: KeyboardEvent) {
    const delta = arrowDelta(edge, event.key);
    if (delta === 0 || field.type !== "form_field") return;
    event.preventDefault();
    event.stopPropagation();
    onRectChange(field.__clientId, resizeOwnFieldEdge(screen!, field.kind, viewport, edge,
      coordinate + delta * viewport.scale * (event.shiftKey ? 10 : 1)));
  }
  return (
    <div className="pointer-events-none absolute inset-0">
      {positions.map(({ edge, x, y, label }) => (
        <button key={edge} type="button"
          aria-label={label}
          className="absolute border border-[var(--color-surface-raised)] bg-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          style={{ left: x - 4.5, top: y - 4.5, width: 9, height: 9 }}
          onKeyDown={(event) => resize(edge, edge === "left" || edge === "right" ? x : y, event)}
        />
      ))}
    </div>
  );
}

function arrowDelta(edge: ResizeEdge, key: string): number {
  const horizontal = edge === "left" || edge === "right";
  if (key === (horizontal ? "ArrowLeft" : "ArrowUp")) return -1;
  if (key === (horizontal ? "ArrowRight" : "ArrowDown")) return 1;
  return 0;
}
