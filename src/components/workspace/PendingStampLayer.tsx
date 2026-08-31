import { useEffect, useState } from "react";
import type { PageViewport } from "pdfjs-dist";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Vector2d } from "konva/lib/types";
import { Group, Image as KonvaImage, Rect } from "react-konva";
import type { ClientAnnotation } from "@/stores/annotationsStore";
import { toScreenRect, type ScreenRect } from "./detectedFieldGeometry";
import { toPdfRect } from "./pendingAnnotationGeometry";
import {
  defaultStampRect,
  resizeStampRect,
  type StampAnnotation,
  type StampCorner,
} from "./signaturePlacement";
import { useLocalPngUrl } from "./useLocalPngUrl";

type PendingStamp = ClientAnnotation & StampAnnotation;

interface PlacementAsset {
  imagePath: string;
  aspectRatio: number;
}

interface Props {
  page: number;
  pageWidth: number;
  pageHeight: number;
  viewport: PageViewport;
  annotations: ClientAnnotation[];
  selectedId: string | null;
  placement: PlacementAsset | null;
  onSelect: (clientId: string) => void;
  onRectChange: (clientId: string, rect: [number, number, number, number]) => void;
  onPlace: (rect: [number, number, number, number]) => void;
}

const HANDLE_SIZE = 9;

function useHtmlImage(url: string | null): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (url === null) return;
    const next = new Image();
    next.onload = () => setLoaded({ url, image: next });
    next.src = url;
    return () => {
      next.onload = null;
    };
  }, [url]);
  return loaded?.url === url ? loaded.image : null;
}

function pointerScreen(event: KonvaEventObject<MouseEvent | TouchEvent>): [number, number] | null {
  const point = event.target.getStage()?.getPointerPosition();
  return point === null || point === undefined ? null : [point.x, point.y];
}

export function PendingStampLayer({
  page,
  pageWidth,
  pageHeight,
  viewport,
  annotations,
  selectedId,
  placement,
  onSelect,
  onRectChange,
  onPlace,
}: Props) {
  const [previewRect, setPreviewRect] = useState<ScreenRect | null>(null);
  const placementUrl = useLocalPngUrl(placement?.imagePath ?? null);
  const placementImage = useHtmlImage(placement === null ? null : placementUrl);
  const items = annotations.filter(
    (annotation): annotation is PendingStamp => annotation.type === "stamp" && annotation.page === page,
  );

  function updatePreview(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (placement === null) return;
    const screenPoint = pointerScreen(event);
    if (screenPoint === null) return;
    const pdfPoint = viewport.convertToPdfPoint(screenPoint[0], screenPoint[1]);
    const rect = defaultStampRect(pageWidth, pageHeight, placement.aspectRatio, [
      pdfPoint[0],
      pdfPoint[1],
    ]);
    setPreviewRect(toScreenRect(rect, viewport));
  }

  function place(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (placement === null) return;
    const screenPoint = pointerScreen(event);
    if (screenPoint === null) return;
    const pdfPoint = viewport.convertToPdfPoint(screenPoint[0], screenPoint[1]);
    onPlace(
      defaultStampRect(pageWidth, pageHeight, placement.aspectRatio, [pdfPoint[0], pdfPoint[1]]),
    );
  }

  return (
    <Group>
      {placement !== null && (
        <Rect
          width={viewport.width}
          height={viewport.height}
          fill="rgba(0,0,0,0.001)"
          onMouseMove={updatePreview}
          onTouchMove={updatePreview}
          onClick={place}
          onTap={place}
        />
      )}
      {items.map((item) => (
        <PendingStampItem
          key={item.__clientId}
          item={item}
          viewport={viewport}
          selected={item.__clientId === selectedId}
          onSelect={() => onSelect(item.__clientId)}
          onRectChange={(rect) => onRectChange(item.__clientId, rect)}
        />
      ))}
      {placement !== null && placementImage !== null && previewRect !== null && (
        <KonvaImage
          image={placementImage}
          x={previewRect.x}
          y={previewRect.y}
          width={previewRect.width}
          height={previewRect.height}
          opacity={0.72}
          listening={false}
        />
      )}
    </Group>
  );
}

function PendingStampItem({
  item,
  viewport,
  selected,
  onSelect,
  onRectChange,
}: {
  item: PendingStamp;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
  onRectChange: (rect: [number, number, number, number]) => void;
}) {
  const url = useLocalPngUrl(item.image_path);
  const image = useHtmlImage(url);
  const screen = toScreenRect(item.rect, viewport);
  if (screen === null) return null;
  const visible = screen;
  const currentRect = toPdfRect(visible, viewport);
  const widthPt = Math.abs(currentRect[2] - currentRect[0]);
  const heightPt = Math.abs(currentRect[3] - currentRect[1]);
  const aspectRatio = heightPt > 0 ? widthPt / heightPt : 1;
  const scale = item.scale ?? 1;
  const corners: { corner: StampCorner; x: number; y: number }[] = [
    { corner: "top-left", x: visible.x, y: visible.y },
    { corner: "top-right", x: visible.x + visible.width, y: visible.y },
    { corner: "bottom-left", x: visible.x, y: visible.y + visible.height },
    { corner: "bottom-right", x: visible.x + visible.width, y: visible.y + visible.height },
  ];

  function onDragEnd(event: KonvaEventObject<DragEvent>) {
    onRectChange(
      toPdfRect(
        {
          x: event.target.x(),
          y: event.target.y(),
          width: visible.width,
          height: visible.height,
        },
        viewport,
      ),
    );
  }

  function resize(corner: StampCorner) {
    return (event: KonvaEventObject<DragEvent>) => {
      const screenPoint: [number, number] = [
        event.target.x() + HANDLE_SIZE / 2,
        event.target.y() + HANDLE_SIZE / 2,
      ];
      const pdfPoint = viewport.convertToPdfPoint(screenPoint[0], screenPoint[1]);
      onRectChange(resizeStampRect(currentRect, corner, [pdfPoint[0], pdfPoint[1]], aspectRatio));
    };
  }

  return (
    <Group>
      <Group
        x={visible.x}
        y={visible.y}
        draggable={selected}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={onDragEnd}
      >
        {image !== null && (
          <KonvaImage
            image={image}
            x={visible.width / 2}
            y={visible.height / 2}
            width={visible.width * scale}
            height={visible.height * scale}
            offsetX={(visible.width * scale) / 2}
            offsetY={(visible.height * scale) / 2}
            opacity={item.opacity ?? 1}
            rotation={-(item.rotation ?? 0)}
          />
        )}
        <Rect
          width={visible.width}
          height={visible.height}
          stroke={selected ? "#111827" : "rgba(17, 24, 39, 0.35)"}
          strokeWidth={selected ? 1.5 : 1}
          dash={selected ? undefined : [3, 3]}
        />
      </Group>
      {selected &&
        corners.map(({ corner, x, y }) => (
          <Rect
            key={corner}
            x={x - HANDLE_SIZE / 2}
            y={y - HANDLE_SIZE / 2}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            fill="#111827"
            draggable
            dragBoundFunc={(position: Vector2d) => position}
            onDragMove={resize(corner)}
          />
        ))}
    </Group>
  );
}
