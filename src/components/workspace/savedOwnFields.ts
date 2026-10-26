import type { FormField } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";

/** Only our marked text fields and checkboxes have a layout edit path. */
export function selectSavedOwnField(docPath: string, field: FormField): string | null {
  if (!field.own || field.page_index === null) return null;
  if (field.kind !== "text" && field.kind !== "checkbox") return null;
  const [object, generation] = field.id.split(":").map(Number);
  if (!Number.isInteger(object) || !Number.isInteger(generation)) return null;
  const existing = useAnnotations.getState().byDoc[docPath]?.find(
    (item) => item.__replaces?.object === object && item.__replaces.generation === generation,
  );
  if (existing) return existing.__deleted ? null : existing.__clientId;
  return useAnnotations.getState().add(docPath, {
    type: "form_field",
    page: field.page_index,
    rect: field.rect,
    name: field.name,
    kind: field.kind,
    multiline: false,
    font_size: 0,
    __replaces: { object, generation },
    source_field: { object, generation },
  });
}
