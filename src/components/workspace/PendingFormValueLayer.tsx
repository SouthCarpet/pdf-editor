// Plan 119 p1c: draws the AcroForm values the user typed and no save wrote
// yet, at their widgets. Read-only: the panel is where they are edited, so
// the group takes no pointer events and never blocks a click on a detected
// field or a pending value under it.
//
// A plain `<Group>`, not its own `Stage`: see `DetectedFieldsOverlay.tsx`.
import type { PageViewport } from "pdfjs-dist";
import { Group, Rect, Text } from "react-konva";
import { toScreenRect } from "./detectedFieldGeometry";
import type { PendingFormValue } from "./pendingFormValues";

interface Props {
  page: number;
  viewport: PageViewport;
  values: readonly PendingFormValue[];
}

/** Same size rule as a detected-field fill: 60 % of the box, at most 12 pt. */
const MAX_FONT_PT = 12;
const FONT_TO_BOX = 0.6;
const INSET_PT = 2;

export function PendingFormValueLayer({ page, viewport, values }: Props) {
  return (
    <Group listening={false}>
      {values
        .filter((value) => value.page === page)
        .map((value) => (
          <PendingFormValueItem key={value.fieldId} value={value} viewport={viewport} />
        ))}
    </Group>
  );
}

function PendingFormValueItem({
  value,
  viewport,
}: {
  value: PendingFormValue;
  viewport: PageViewport;
}) {
  const screen = toScreenRect(value.rect, viewport);
  if (screen === null) return null;
  const heightPt = screen.height / viewport.scale;
  const fontPx = Math.min(MAX_FONT_PT, heightPt * FONT_TO_BOX) * viewport.scale;
  const inset = INSET_PT * viewport.scale;

  return (
    <Group>
      <Rect
        name="pending-form-value"
        x={screen.x}
        y={screen.y}
        width={screen.width}
        height={screen.height}
        fill="#ffffff"
        stroke="rgba(17, 24, 39, 0.35)"
        strokeWidth={1}
        dash={[3, 3]}
        listening={false}
      />
      <Group
        clipX={screen.x}
        clipY={screen.y}
        clipWidth={screen.width}
        clipHeight={screen.height}
        listening={false}
      >
        <Text
          x={screen.x + inset}
          y={screen.y}
          width={Math.max(screen.width - 2 * inset, 1)}
          height={screen.height}
          verticalAlign="middle"
          text={value.text}
          fontSize={fontPx}
          fontFamily="Helvetica, Arial, sans-serif"
          fill="#000000"
          wrap="none"
          listening={false}
        />
      </Group>
    </Group>
  );
}
