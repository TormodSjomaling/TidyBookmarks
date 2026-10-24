import { useState, type DragEvent } from "react";
import { canDropOnto, moveIndex, type DragUnit, type DropPlace } from "../lib/dnd";
import { isFolder } from "../lib/tree";
import type { BookmarkNode } from "../lib/types";
import { useDashboard } from "./dashboard";
import { captureLayout } from "./glide";

export function toUnit(node: BookmarkNode, containerKey: string): DragUnit {
  return { id: node.id, parentId: node.parentId ?? "", index: node.index ?? 0, containerKey, folder: isFolder(node) };
}

// Moves `source` next to `target` in Chrome, into `target`'s parent if that's a
// different one. The tree re-reads itself from the resulting onMoved event (see
// useBookmarkTree).
export function applyReorder(source: DragUnit, target: DragUnit, place?: DropPlace) {
  captureLayout();
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

// Bookmark tiles sit in a row, so the pointer's side of the tile picks where
// the dragged one lands: the left half before it, the right half after it.
function placeAt(e: DragEvent): DropPlace {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientX < rect.left + rect.width / 2 ? "before" : "after";
}

// Wiring for a bookmark as a reorder-only drop target. Bookmarks are never
// "move into" targets; folders handle that themselves (Folder.tsx). `over` is
// where the dragged bookmark would land, for the insertion line.
export function useReorderTarget(unit: DragUnit) {
  const { dragged } = useDashboard();
  const [over, setOver] = useState<DropPlace | null>(null);

  // Chrome asks on dragenter as well as dragover whether a drop is allowed
  // here; a mouseup right after entering uses the dragenter answer.
  const accept = (e: DragEvent) => {
    if (!canDropOnto(dragged.current, unit)) return;
    claim(e);
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOver(placeAt(e));
  };

  return {
    over,
    targetProps: {
      onDragEnter: accept,
      onDragOver: accept,
      onDragLeave: (e: DragEvent) => {
        // Moving onto the tile's own favicon or link isn't leaving it.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
      },
      onDrop: (e: DragEvent) => {
        setOver(null);
        const source = dragged.current;
        if (!source || !canDropOnto(source, unit)) return;
        claim(e);
        e.preventDefault();
        applyReorder(source, unit, placeAt(e));
      },
    },
  };
}
