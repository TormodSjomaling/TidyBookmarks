import { isSelfOrDescendant, type ParentMap } from "./tree";

// A drag source or target. `containerKey` identifies the rendered list it sits
// in; reordering requires the same list *and* the same real parent, because the
// default-bookmarks row combines children of several Chrome roots into one list.
export interface DragUnit {
  id: string;
  parentId: string;
  containerKey: string;
}

export function canDropOnto(dragged: DragUnit | null, target: DragUnit): boolean {
  return (
    dragged !== null &&
    dragged.id !== target.id &&
    dragged.containerKey === target.containerKey &&
    dragged.parentId === target.parentId
  );
}

// A folder can't be dropped into itself or one of its own descendants. Moving a
// bookmark anywhere (including its current parent) is always fine.
export function canDropInto(dragged: DragUnit | null, folderId: string, parents: ParentMap): boolean {
  return dragged !== null && !isSelfOrDescendant(parents, folderId, dragged.id);
}

export type DragBand = "before" | "after" | "into";

// Top/bottom quarter of a folder header means reorder; the middle half means move into.
export function dragBand(clientY: number, top: number, height: number): DragBand {
  const ratio = (clientY - top) / height;
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "into";
}

// Given the units of one rendered list in display order, returns the ids that
// share the dragged unit's parent in their new order. Each id's position in the
// result is the index to pass to chrome.bookmarks.move.
export function reorderedIds(units: DragUnit[], draggedId: string, targetId: string): string[] {
  const dragged = units.find((u) => u.id === draggedId);
  const draggedIndex = units.findIndex((u) => u.id === draggedId);
  const targetIndex = units.findIndex((u) => u.id === targetId);
  if (!dragged || targetIndex === -1) return [];

  // Dragging forward lands after the target, dragging backward lands before it.
  const without = units.filter((u) => u.id !== draggedId);
  const targetPos = without.findIndex((u) => u.id === targetId);
  without.splice(draggedIndex < targetIndex ? targetPos + 1 : targetPos, 0, dragged);

  return without.filter((u) => u.parentId === dragged.parentId).map((u) => u.id);
}
