// Plan 050 task D2: the inline input the user types a detected field's
// value into.
//
// A plain HTML input absolutely positioned over the Konva canvas, not a
// Konva text node: canvas cannot host real text input or IME composition.
// Submitting adds one FreeText annotation to the shared annotations store,
// the same accumulator the Annotations panel uses; nothing is saved until
// the Forms panel's save action runs.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { Annotation, DetectedFormField } from "@/bindings";
import { buildFreeText, type ScreenRect } from "./detectedFieldGeometry";

interface Props {
  field: DetectedFormField;
  screenRect: ScreenRect;
  onSubmit: (annotation: Annotation) => void;
  onCancel: () => void;
}

export function DetectedFieldFill({ field, screenRect, onSubmit, onCancel }: Props) {
  const { t } = useTranslation("workspace");
  const [value, setValue] = useState("");
  const placeholder = {
    box: t("forms.detect_placeholder_box"),
    underline: t("forms.detect_placeholder_underline"),
  }[field.kind];

  function submit() {
    if (value.trim().length === 0) return;
    onSubmit(buildFreeText(field, value));
  }

  return (
    <div
      className="absolute z-10 flex items-center gap-1"
      style={{
        left: screenRect.x,
        top: screenRect.y,
        width: Math.max(screenRect.width, 120),
        height: Math.max(screenRect.height, 24),
      }}
    >
      <input
        autoFocus
        type="text"
        aria-label={t("forms.detect_submit")}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
          if (event.key === "Escape") onCancel();
        }}
        className="k-input min-w-0 w-full"
      />
      <Button className="h-full shrink-0" onClick={submit}>
        {t("forms.detect_submit")}
      </Button>
    </div>
  );
}
