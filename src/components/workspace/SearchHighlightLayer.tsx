import type { PageViewport } from "pdfjs-dist";
import { Rect } from "react-konva";
import type { TextMatch, TextRect } from "./textSearch";
import { OverlayCanvas } from "./OverlayCanvas";

interface Props {
  width: number;
  height: number;
  viewport: PageViewport;
  matches: readonly TextMatch[];
  currentMatch?: TextMatch;
}

function screenRect(viewport: PageViewport, rect: TextRect) {
  const converted = viewport.convertToViewportRectangle(rect);
  const x = Math.min(converted[0], converted[2]);
  const y = Math.min(converted[1], converted[3]);
  return {
    x,
    y,
    width: Math.abs(converted[2] - converted[0]),
    height: Math.abs(converted[3] - converted[1]),
  };
}

export function SearchHighlightLayer({ width, height, viewport, matches, currentMatch }: Props) {
  const accent =
    typeof document === "undefined"
      ? "#1d4ed8"
      : getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() ||
        "#1d4ed8";

  return (
    <OverlayCanvas width={width} height={height} interactive={false}>
      {matches.flatMap((match, matchIndex) =>
        match.rects.map((rect, rectIndex) => {
          const box = screenRect(viewport, rect);
          const current = match === currentMatch;
          return (
            <Rect
              key={`${matchIndex}-${rectIndex}`}
              {...box}
              fill={accent}
              opacity={current ? 0.42 : 0.2}
              stroke={current ? accent : undefined}
              strokeWidth={current ? 1 : 0}
              listening={false}
            />
          );
        }),
      )}
    </OverlayCanvas>
  );
}
