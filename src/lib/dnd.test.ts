import { describe, expect, it } from "vitest";
import { canDropInto, canDropOnto, dragBand, reorderedIds, type DragUnit } from "./dnd";
import { buildParentMap } from "./tree";

const unit = (id: string, parentId = "p", containerKey = "list"): DragUnit => ({ id, parentId, containerKey });

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
  it("splits a header into quarters", () => {
    expect(dragBand(105, 100, 40)).toBe("before");
    expect(dragBand(110, 100, 40)).toBe("into"); // exactly 25% counts as the middle, as before
    expect(dragBand(120, 100, 40)).toBe("into");
    expect(dragBand(135, 100, 40)).toBe("after");
  });
});

describe("reorderedIds", () => {
  const list = ["a", "b", "c", "d"].map((id) => unit(id));

  it("dragging forward lands after the target", () => {
    expect(reorderedIds(list, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("dragging backward lands before the target", () => {
    expect(reorderedIds(list, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("only returns units sharing the dragged unit's parent", () => {
    const mixed = [unit("a", "bar"), unit("x", "other"), unit("b", "bar"), unit("c", "bar")];
    expect(reorderedIds(mixed, "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("returns nothing for unknown ids", () => {
    expect(reorderedIds(list, "a", "zzz")).toEqual([]);
  });
});
