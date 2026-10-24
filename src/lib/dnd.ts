import { isSelfOrDescendant, type ParentMap } from "./tree";

// A drag source or target. `containerKey` identifies the rendered list it sits
// in; reordering a bookmark requires the same list *and* the same real parent,
// because the default-bookmarks row combines children of several Chrome roots
// into one list.
export interface DragUnit {
  id: string;
  parentId: string;
  // Position among all of the parent's children (bookmarks and folders alike).
  index: number;
  containerKey: string;
  folder: boolean;
}

export function canDropOnto(dragged: DragUnit | null, target: DragUnit): boolean {
  return (
    dragged !== null &&
    dragged.id !== target.id &&
    dragged.containerKey === target.containerKey &&
    dragged.parentId === target.parentId
  );
}

// A folder can be dropped right before or after any other folder, at any level
// and in any Chrome root: it moves into that folder's parent. Only it can't end
// up inside itself.
export function canDropBeside(dragged: DragUnit | null, target: DragUnit, parents: ParentMap): boolean {
  return (
    dragged !== null &&
    dragged.folder &&
    dragged.id !== target.id &&
    !isSelfOrDescendant(parents, target.parentId, dragged.id)
  );
}

// A folder can't be dropped into itself or one of its own descendants. Moving a
// bookmark anywhere (including its current parent) is always fine.
export function canDropInto(dragged: DragUnit | null, folderId: string, parents: ParentMap): boolean {
  return dragged !== null && !isSelfOrDescendant(parents, folderId, dragged.id);
}

export type DragBand = "before" | "after" | "into";

// Top/bottom 30% of a folder header means reorder; the middle means move into.
export function dragBand(clientY: number, top: number, height: number): DragBand {
  const ratio = (clientY - top) / height;
  if (ratio < 0.3) return "before";
  if (ratio > 0.7) return "after";
  return "into";
}

export type DropPlace = "before" | "after";

// The index to pass to chrome.bookmarks.move to put `dragged` right before or
// after its sibling `target`. Without a place (bookmark tiles), dragging forward
// lands after the target and dragging backward lands before it (only used
// within one parent). Chrome counts a same-parent index against the list before
// the moved node is taken out, so whether or not the parent changes, this is
// just the target's own position, or the one after it.
export function moveIndex(dragged: DragUnit, target: DragUnit, place?: DropPlace): number {
  const where = place ?? (dragged.index < target.index ? "after" : "before");
  return where === "before" ? target.index : target.index + 1;
}
