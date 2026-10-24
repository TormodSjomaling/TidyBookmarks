import { describe, expect, it } from "vitest";
import { canDropInto, canDropOnto, dragBand, moveIndex, type DragUnit } from "./dnd";
import { buildParentMap } from "./tree";

const unit = (id: string, parentId = "p", containerKey = "list", index = 0): DragUnit => ({
  id,
  parentId,
  index,
  containerKey,
});

describe("canDropOnto", () => {
  it("allows siblings in the same list", () => {
    expect(canDropOnto(unit("a"), unit("b"))).toBe(true);
  });

  it("rejects self, nothing dragged, other lists, and other parents", () => {
    expect(canDropOnto(unit("a"), unit("a"))).toBe(false);
    expect(canDropOnto(null, unit("a"))).toBe(false);
    expect(canDropOnto(unit("a"), unit("b", "p", "other"))).toBe(false);
    // Same visual row, different real parent (the default-bookmarks row).
    expect(canDropOnto(unit("a", "bar", "default"), unit("b", "other", "default"))).toBe(false);
  });
});

describe("canDropInto", () => {
  const parents = buildParentMap([
    { id: "root", title: "", children: [{ id: "f", title: "F", children: [{ id: "g", title: "G", children: [] }] }] },
  ]);

  it("prevents dropping a folder into itself or its descendants", () => {
    expect(canDropInto(unit("f"), "f", parents)).toBe(false);
    expect(canDropInto(unit("f"), "g", parents)).toBe(false);
  });

  it("allows moving a folder up, or a bookmark anywhere", () => {
    expect(canDropInto(unit("g"), "f", parents)).toBe(true);
    expect(canDropInto(unit("bookmark"), "g", parents)).toBe(true);
  });
});

describe("dragBand", () => {
  it("splits a header into top 30%, middle, and bottom 30%", () => {
    expect(dragBand(111, 100, 40)).toBe("before");
    expect(dragBand(112, 100, 40)).toBe("into"); // exactly 30% counts as the middle
    expect(dragBand(120, 100, 40)).toBe("into");
    expect(dragBand(128, 100, 40)).toBe("into");
    expect(dragBand(129, 100, 40)).toBe("after");
  });
});

describe("moveIndex", () => {
  // Chrome reads a same-parent index against the list before the move, so
  // putting the node at index i means "right before whatever is at i now".
  const at = (id: string, index: number) => unit(id, "p", "list", index);

  it("before or after the target, whichever way it is dragged", () => {
    expect(moveIndex(at("a", 1), at("c", 3), "before")).toBe(3);
    expect(moveIndex(at("a", 1), at("c", 3), "after")).toBe(4);
    expect(moveIndex(at("d", 4), at("b", 2), "before")).toBe(2);
    expect(moveIndex(at("d", 4), at("b", 2), "after")).toBe(3);
  });

  it("without a place, dragging forward lands after the target and backward before it", () => {
    expect(moveIndex(at("a", 0), at("c", 2))).toBe(3);
    expect(moveIndex(at("d", 3), at("b", 1))).toBe(1);
  });

  it("uses real indexes, so siblings of another kind (bookmarks between folders) keep their place", () => {
    // Folders at 2 and 5 with bookmarks in between: "after" means index 6, not 2.
    expect(moveIndex(at("f1", 2), at("f2", 5), "after")).toBe(6);
  });
});
