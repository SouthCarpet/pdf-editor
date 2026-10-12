import type { Annotation } from "@/bindings";
import type { ClientAnnotation, NewAnnotation } from "./annotationsStore";
import { historyStore, type HistoryEntry } from "./historyStore";

type FreeTextAnnotation = Extract<Annotation, { type: "free_text" }>;
type StampAnnotation = Extract<Annotation, { type: "stamp" }>;
export type EditableAnnotationPatch = Partial<FreeTextAnnotation> | Partial<StampAnnotation>;

export const TEXT_EDIT_COALESCE_MS = 800;

export interface AnnotationHistoryActions {
  add: (docPath: string, annotation: NewAnnotation) => string;
  update: (
    docPath: string,
    clientId: string,
    patch: EditableAnnotationPatch,
  ) => void;
  remove: (docPath: string, clientId: string) => void;
  replace: (docPath: string, list: ClientAnnotation[]) => void;
  clear: (docPath: string) => void;
}

interface AnnotationAdapter {
  get: (docPath: string) => ClientAnnotation[];
  set: (docPath: string, list: ClientAnnotation[]) => void;
  createClientId: () => string;
  now?: () => number;
}

interface FilledFieldLink {
  mark: () => void;
  unmark: () => void;
}

interface TextEditBurst {
  clientId: string;
  entry: HistoryEntry;
  editedAt: number;
  historyVersion: number;
}

const filledFieldLinks = new Map<string, FilledFieldLink>();

function linkKey(docPath: string, clientId: string): string {
  return `${docPath}\u0000${clientId}`;
}

export function linkAnnotationToFilledField(
  docPath: string,
  clientId: string,
  link: FilledFieldLink,
): void {
  filledFieldLinks.set(linkKey(docPath, clientId), link);
}

export function clearAnnotationFieldLinks(docPath: string): void {
  const prefix = `${docPath}\u0000`;
  for (const key of filledFieldLinks.keys()) {
    if (key.startsWith(prefix)) filledFieldLinks.delete(key);
  }
}

function syncFilledFields(
  docPath: string,
  before: readonly ClientAnnotation[],
  after: readonly ClientAnnotation[],
): void {
  const beforeIds = new Set(before.map((annotation) => annotation.__clientId));
  const afterIds = new Set(after.map((annotation) => annotation.__clientId));
  for (const clientId of beforeIds) {
    if (!afterIds.has(clientId)) filledFieldLinks.get(linkKey(docPath, clientId))?.unmark();
  }
  for (const clientId of afterIds) {
    if (!beforeIds.has(clientId)) filledFieldLinks.get(linkKey(docPath, clientId))?.mark();
  }
}

function rectSize(rect: FreeTextAnnotation["rect"] | StampAnnotation["rect"]): [number, number] {
  return [
    Math.abs((rect[2] ?? 0) - (rect[0] ?? 0)),
    Math.abs((rect[3] ?? 0) - (rect[1] ?? 0)),
  ];
}

function updateLabel(
  before: FreeTextAnnotation | StampAnnotation,
  patch: EditableAnnotationPatch,
): string {
  if ("contents" in patch && patch.contents !== undefined && !("style" in patch) && patch.rect === undefined) {
    return "text";
  }
  if ("style" in patch && patch.style !== undefined) return "style";
  if (patch.rect !== undefined) {
    const [beforeWidth, beforeHeight] = rectSize(before.rect);
    const [afterWidth, afterHeight] = rectSize(patch.rect);
    return beforeWidth === afterWidth && beforeHeight === afterHeight ? "move" : "resize";
  }
  return "edit";
}

export function createAnnotationHistoryActions(
  adapter: AnnotationAdapter,
): AnnotationHistoryActions {
  const textBursts = new Map<string, TextEditBurst>();
  const now = adapter.now ?? (() => Date.now());

  function apply(docPath: string, list: ClientAnnotation[]): void {
    const before = adapter.get(docPath);
    adapter.set(docPath, list);
    syncFilledFields(docPath, before, list);
  }

  function pushTransition(
    docPath: string,
    label: string,
    before: ClientAnnotation[],
    after: ClientAnnotation[],
  ): HistoryEntry {
    const entry: HistoryEntry = {
      label,
      undo: () => apply(docPath, before),
      redo: () => apply(docPath, after),
    };
    historyStore.getState().push(docPath, entry);
    return entry;
  }

  return {
    add: (docPath, annotation) => {
      const before = adapter.get(docPath);
      const clientId = adapter.createClientId();
      const after = [
        ...before,
        { ...annotation, __clientId: clientId } as ClientAnnotation,
      ];
      apply(docPath, after);
      pushTransition(docPath, "add", before, after);
      textBursts.delete(docPath);
      return clientId;
    },
    update: (docPath, clientId, patch) => {
      const before = adapter.get(docPath);
      const annotation = before.find(
        (candidate): candidate is ClientAnnotation & (FreeTextAnnotation | StampAnnotation) =>
          candidate.__clientId === clientId &&
          (candidate.type === "free_text" || candidate.type === "stamp"),
      );
      if (annotation === undefined) return;
      const after = before.map((candidate) =>
        candidate.__clientId === clientId
          ? ({ ...candidate, ...patch } as ClientAnnotation)
          : candidate,
      );
      const label = updateLabel(annotation, patch);
      apply(docPath, after);

      const editedAt = now();
      const currentHistory = historyStore.getState().byDoc[docPath];
      const burst = textBursts.get(docPath);
      if (
        label === "text" &&
        burst !== undefined &&
        burst.clientId === clientId &&
        editedAt - burst.editedAt <= TEXT_EDIT_COALESCE_MS &&
        currentHistory?.version === burst.historyVersion &&
        currentHistory.undo.at(-1) === burst.entry &&
        currentHistory.redo.length === 0
      ) {
        burst.entry.redo = () => apply(docPath, after);
        burst.editedAt = editedAt;
        return;
      }

      const entry = pushTransition(docPath, label, before, after);
      if (label === "text") {
        textBursts.set(docPath, {
          clientId,
          entry,
          editedAt,
          historyVersion: historyStore.getState().byDoc[docPath]?.version ?? 0,
        });
      } else {
        textBursts.delete(docPath);
      }
    },
    remove: (docPath, clientId) => {
      const before = adapter.get(docPath);
      if (!before.some((annotation) => annotation.__clientId === clientId)) return;
      const after = before.filter((annotation) => annotation.__clientId !== clientId);
      apply(docPath, after);
      pushTransition(docPath, "delete", before, after);
      textBursts.delete(docPath);
    },
    replace: (docPath, list) => {
      const before = adapter.get(docPath);
      apply(docPath, list);
      pushTransition(docPath, "edit", before, list);
      textBursts.delete(docPath);
    },
    clear: (docPath) => {
      const before = adapter.get(docPath);
      if (before.length === 0) return;
      apply(docPath, []);
      pushTransition(docPath, "delete", before, []);
      textBursts.delete(docPath);
    },
  };
}
