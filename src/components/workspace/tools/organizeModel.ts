// Plan 062 T5.1: pure organize/reorder model. Mutations return a new state.

export const A4_BLANK = { width: 595, height: 842 } as const;

export type Rotation = 0 | 90 | 180 | 270;

export interface ImportedPage {
  path: string;
  page: number;
}

export interface BlankPage {
  width: number;
  height: number;
}

export interface PageEntry {
  id: string;
  originalIndex: number | null;
  duplicate: boolean;
  blank: BlankPage | null;
  imported: ImportedPage | null;
  rotation: Rotation;
  deleted: boolean;
}

export interface Insertable {
  originalIndex?: number | null;
  duplicate?: boolean;
  blank?: BlankPage | null;
  imported?: ImportedPage | null;
  rotation?: Rotation;
  deleted?: boolean;
}

export interface OrganizeState {
  pages: PageEntry[];
  selectedIds: readonly string[];
  anchorId: string | null;
  nextId: number;
}

export type ApplyStage =
  | { type: "reorder"; new_order: number[] }
  | { type: "rotate"; rotations: Array<[number, number]> }
  | { type: "insert_blank"; after_page_index: number; width: number; height: number }
  | { type: "extract_import"; input: string; pages: number[] }
  | { type: "merge_import"; after_page_index: number };

export interface ApplyPlan {
  finalPageCount: number;
  stages: ApplyStage[];
}

export type MergeImportSplit =
  | { mode: "prepend" }
  | { mode: "append" }
  | { mode: "split"; prefix: number[]; suffix: number[] };

function originalPage(id: string, originalIndex: number): PageEntry {
  return {
    id,
    originalIndex,
    duplicate: false,
    blank: null,
    imported: null,
    rotation: 0,
    deleted: false,
  };
}

export function createOrganizeState(pageCount: number): OrganizeState {
  const pages = Array.from({ length: pageCount }, (_, index) =>
    originalPage(`p${index}`, index),
  );
  return { pages, selectedIds: [], anchorId: null, nextId: pageCount };
}

function allocateId(state: OrganizeState): { id: string; nextId: number } {
  return { id: `p${state.nextId}`, nextId: state.nextId + 1 };
}

function pageIndex(state: OrganizeState, id: string): number {
  return state.pages.findIndex((page) => page.id === id);
}

function isCore(page: PageEntry): boolean {
  return page.originalIndex !== null && page.blank === null && page.imported === null;
}

export function movePages(
  state: OrganizeState,
  ids: readonly string[],
  targetIndex: number,
): OrganizeState {
  const idSet = new Set(ids);
  const moving = state.pages.filter((page) => idSet.has(page.id));
  if (moving.length === 0) return state;
  const staying = state.pages.filter((page) => !idSet.has(page.id));
  const clamped = Math.max(0, Math.min(targetIndex, state.pages.length));
  const removedBefore = state.pages
    .slice(0, clamped)
    .filter((page) => idSet.has(page.id)).length;
  const insertAt = Math.max(0, Math.min(clamped - removedBefore, staying.length));
  const pages = [...staying.slice(0, insertAt), ...moving, ...staying.slice(insertAt)];
  if (pages.every((page, index) => page.id === state.pages[index]?.id)) return state;
  return { ...state, pages };
}

export function reverse(state: OrganizeState): OrganizeState {
  if (state.pages.length < 2) return state;
  return { ...state, pages: [...state.pages].reverse() };
}

export function duplicate(state: OrganizeState, id: string): OrganizeState {
  const index = pageIndex(state, id);
  const source = state.pages[index];
  if (source === undefined) return state;
  const { id: copyId, nextId } = allocateId(state);
  const copy: PageEntry = {
    ...source,
    id: copyId,
    duplicate: source.originalIndex !== null && source.imported === null && source.blank === null
      ? true
      : source.duplicate,
    deleted: false,
  };
  const pages = [...state.pages];
  pages.splice(index + 1, 0, copy);
  return { ...state, pages, nextId };
}

export function insertFrom(
  state: OrganizeState,
  afterIndex: number,
  entries: readonly Insertable[],
): OrganizeState {
  if (entries.length === 0) return state;
  let nextId = state.nextId;
  const created: PageEntry[] = entries.map((entry) => {
    const id = `p${nextId}`;
    nextId += 1;
    return {
      id,
      originalIndex: entry.originalIndex ?? null,
      duplicate: entry.duplicate ?? false,
      blank: entry.blank ?? null,
      imported: entry.imported ?? null,
      rotation: entry.rotation ?? 0,
      deleted: entry.deleted ?? false,
    };
  });
  const insertAt = Math.max(0, Math.min(afterIndex + 1, state.pages.length));
  const pages = [...state.pages.slice(0, insertAt), ...created, ...state.pages.slice(insertAt)];
  return { ...state, pages, nextId };
}

export function insertBlankAfter(state: OrganizeState, id: string): OrganizeState {
  const index = pageIndex(state, id);
  if (index < 0) return state;
  return insertFrom(state, index, [{ blank: { ...A4_BLANK } }]);
}

export function selectOne(state: OrganizeState, id: string): OrganizeState {
  if (pageIndex(state, id) < 0) return state;
  return { ...state, selectedIds: [id], anchorId: id };
}

export function selectRange(state: OrganizeState, anchorId: string, id: string): OrganizeState {
  const anchorIndex = pageIndex(state, anchorId);
  const targetIndex = pageIndex(state, id);
  if (targetIndex < 0) return state;
  if (anchorIndex < 0) return selectOne(state, id);
  const from = Math.min(anchorIndex, targetIndex);
  const to = Math.max(anchorIndex, targetIndex);
  const selectedIds = state.pages.slice(from, to + 1).map((page) => page.id);
  return { ...state, selectedIds, anchorId };
}

export function toggleSelect(state: OrganizeState, id: string): OrganizeState {
  if (pageIndex(state, id) < 0) return state;
  const selected = new Set(state.selectedIds);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  const selectedIds = state.pages
    .map((page) => page.id)
    .filter((pageId) => selected.has(pageId));
  return { ...state, selectedIds, anchorId: id };
}

export function dragGroupIds(state: OrganizeState, draggedId: string): string[] {
  if (state.selectedIds.includes(draggedId) && state.selectedIds.length > 1) {
    return state.pages
      .filter((page) => state.selectedIds.includes(page.id))
      .map((page) => page.id);
  }
  return [draggedId];
}

export function deleteSelected(state: OrganizeState): OrganizeState {
  if (state.selectedIds.length === 0) return state;
  const selected = new Set(state.selectedIds);
  return {
    ...state,
    pages: state.pages.map((page) =>
      selected.has(page.id) ? { ...page, deleted: true } : page,
    ),
  };
}

export function toggleDeleted(state: OrganizeState, id: string): OrganizeState {
  const index = pageIndex(state, id);
  const page = state.pages[index];
  if (page === undefined) return state;
  const pages = [...state.pages];
  pages[index] = { ...page, deleted: !page.deleted };
  return { ...state, pages };
}

export function rotatePage(state: OrganizeState, id: string, delta: 90 | 180 | 270): OrganizeState {
  const index = pageIndex(state, id);
  const page = state.pages[index];
  if (page === undefined) return state;
  const pages = [...state.pages];
  pages[index] = {
    ...page,
    rotation: (((page.rotation + delta) % 360) as Rotation),
  };
  return { ...state, pages };
}

export function mergeImportSplit(
  afterPageIndex: number,
  currentPageCount: number,
): MergeImportSplit {
  if (afterPageIndex < 0) return { mode: "prepend" };
  if (afterPageIndex >= currentPageCount - 1) return { mode: "append" };
  const prefix: number[] = [];
  for (let page = 1; page <= afterPageIndex + 1; page += 1) prefix.push(page);
  const suffix: number[] = [];
  for (let page = afterPageIndex + 2; page <= currentPageCount; page += 1) suffix.push(page);
  return { mode: "split", prefix, suffix };
}

export function buildApplyPlan(state: OrganizeState): ApplyPlan {
  const kept = state.pages.filter((page) => !page.deleted);
  const core = kept.filter(isCore);
  const stages: ApplyStage[] = [];

  // Always emit reorder, including an empty keep list. `reorderPagesCmd`
  // treats `new_order` as the complete page list, so `[]` deletes every
  // original before blank/import stages run against the result.
  stages.push({
    type: "reorder",
    new_order: core.map((page) => (page.originalIndex ?? 0) + 1),
  });

  let outputIndex = -1;
  let index = 0;
  while (index < kept.length) {
    const page = kept[index];
    if (page === undefined) break;
    if (isCore(page)) {
      outputIndex += 1;
      index += 1;
      continue;
    }
    if (page.blank) {
      stages.push({
        type: "insert_blank",
        after_page_index: outputIndex,
        width: page.blank.width,
        height: page.blank.height,
      });
      outputIndex += 1;
      index += 1;
      continue;
    }
    if (page.imported) {
      const path = page.imported.path;
      const pages: number[] = [];
      while (index < kept.length) {
        const next = kept[index];
        if (next?.imported?.path !== path) break;
        pages.push(next.imported.page + 1);
        index += 1;
      }
      stages.push({ type: "extract_import", input: path, pages });
      stages.push({ type: "merge_import", after_page_index: outputIndex });
      outputIndex += pages.length;
      continue;
    }
    index += 1;
  }

  const rotations: Array<[number, number]> = [];
  kept.forEach((page, pageIndex0) => {
    if (page.rotation !== 0) rotations.push([pageIndex0 + 1, page.rotation]);
  });
  if (rotations.length > 0) stages.push({ type: "rotate", rotations });

  return { finalPageCount: kept.length, stages };
}

export function isOrganizeDirty(state: OrganizeState, pageCount: number): boolean {
  if (state.pages.length !== pageCount) return true;
  return state.pages.some((page, index) => {
    if (page.deleted || page.rotation !== 0 || page.blank || page.imported || page.duplicate) {
      return true;
    }
    return page.originalIndex !== index;
  });
}
