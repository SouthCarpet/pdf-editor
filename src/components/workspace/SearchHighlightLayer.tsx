import type { PageViewport } from "pdfjs-dist";
import { Rect } from "react-konva";
import { readToken } from "@/lib/tokens";
import type { TextMatch } from "./textSearch";
import { OverlayCanvas } from "./OverlayCanvas";
import { toScreenRect } from "./detectedFieldGeometry";

interface Props {
  width: number;
  height: number;
  viewport: PageViewport;
  matches: readonly TextMatch[];
  currentMatch?: TextMatch;
}

export function SearchHighlightLayer({ width, height, viewport, matches, currentMatch }: Props) {
  // Minor 3 (plan 062 final fix wave F9): read the live token instead of
  // reimplementing `readToken`'s own `getComputedStyle` call. The rect math
  // this layer needs (PDF points to on-screen pixels through the viewport)
  // is also exactly `toScreenRect`'s job once `TextRect`'s tuple is passed
  // as `detectedFieldGeometry`'s wider `(number | null)[]` - a real
  // duplicate, so this calls it instead of keeping its own copy.
  const accent = readToken("--color-accent", "#1d4ed8");

  return (
    <OverlayCanvas width={width} height={height} interactive={false}>
      {matches.flatMap((match, matchIndex) =>
        match.rects.flatMap((rect, rectIndex) => {
          const box = toScreenRect(rect, viewport);
          if (box === null) return [];
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
