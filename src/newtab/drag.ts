import { useState, type DragEvent } from "react";
import { canDropOnto, moveIndex, type DragUnit, type DropPlace } from "../lib/dnd";
import { isFolder } from "../lib/tree";
import type { BookmarkNode } from "../lib/types";
import { useDashboard } from "./dashboard";

export function toUnit(node: BookmarkNode, containerKey: string): DragUnit {
  return { id: node.id, parentId: node.parentId ?? "", index: node.index ?? 0, containerKey, folder: isFolder(node) };
}

// Moves `source` next to `target` in Chrome, into `target`'s parent if that's a
// different one. The tree re-reads itself from the resulting onMoved event (see
// useBookmarkTree).
export function applyReorder(source: DragUnit, target: DragUnit, place?: DropPlace) {
  return chrome.bookmarks.move(source.id, { parentId: target.parentId, index: moveIndex(source, target, place) });
}

// Folders nest, so a drag event over an inner folder bubbles up through its
// ancestors. The innermost target that accepts the event claims it, and the
// ancestors stand down instead of also showing (or performing) a drop.
const claimed = new WeakSet<Event>();
export const claim = (e: DragEvent) => claimed.add(e.nativeEvent);
export const isClaimed = (e: DragEvent) => claimed.has(e.nativeEvent);

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
// "move into" targets; folders handle that themselves (Folder.tsx).
export function useReorderTarget(unit: DragUnit) {
  const { dragged } = useDashboard();
  const [over, setOver] = useState(false);

  return {
    over,
    targetProps: {
      onDragOver: (e: DragEvent) => {
        if (!canDropOnto(dragged.current, unit)) return;
        claim(e);
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        const source = dragged.current;
        if (!source || !canDropOnto(source, unit)) return;
        claim(e);
        e.preventDefault();
        applyReorder(source, unit);
      },
    },
  };
}
