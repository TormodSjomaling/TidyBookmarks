import { useState, type DragEvent } from "react";
import { canDropOnto, reorderedIds, type DragUnit } from "../lib/dnd";
import { useDashboard } from "./dashboard";

// Writes a new sibling order to Chrome. The tree re-reads itself from the
// resulting onMoved events (see useBookmarkTree).
export async function applyReorder(siblings: DragUnit[], draggedId: string, targetId: string) {
  const ids = reorderedIds(siblings, draggedId, targetId);
  for (const [index, id] of ids.entries()) {
    await chrome.bookmarks.move(id, { index });
  }
}

// Wiring for an element that can be picked up and dragged. `dragging` drives
// the dimmed "being dragged" styling.
export function useDragSource(unit: DragUnit) {
  const { dragged } = useDashboard();
  const [dragging, setDragging] = useState(false);

  return {
    dragging,
    sourceProps: {
      onDragStart: (e: DragEvent) => {
        e.stopPropagation();
        dragged.current = unit;
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      },
      onDragEnd: () => {
        dragged.current = null;
        setDragging(false);
      },
    },
  };
}

// Wiring for a bookmark as a reorder-only drop target. Bookmarks are never
// "move into" targets; folder headers handle that themselves (Folder.tsx).
export function useReorderTarget(unit: DragUnit, siblings: DragUnit[]) {
  const { dragged } = useDashboard();
  const [over, setOver] = useState(false);

  return {
    over,
    targetProps: {
      onDragOver: (e: DragEvent) => {
        if (!canDropOnto(dragged.current, unit)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        const source = dragged.current;
        if (!source || !canDropOnto(source, unit)) return;
        e.preventDefault();
        applyReorder(siblings, source.id, unit.id);
      },
    },
  };
}
