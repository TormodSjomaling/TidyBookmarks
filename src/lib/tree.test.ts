import { describe, expect, it } from "vitest";
import {
  buildParentMap,
  folderPreview,
  groupFolders,
  isArchived,
  isSelfOrDescendant,
  nodeMatchesQuery,
  normalizeQuery,
  orderFolders,
  visibleChildren,
} from "./tree";
import type { BookmarkNode, FolderMetaMap } from "./types";

const bookmark = (id: string, title: string, url = `https://${id}.example`): BookmarkNode => ({
  id,
  title,
  url,
});
const folder = (id: string, title: string, children: BookmarkNode[] = []): BookmarkNode => ({
  id,
  title,
  children,
});
const ids = (nodes: BookmarkNode[]) => nodes.map((n) => n.id);

describe("isArchived", () => {
  it("requires both archived and collapsed", () => {
    expect(isArchived({ archived: true, collapsed: true, lastArchivedAt: 1 }, "")).toBe(true);
    // Re-expanded to peek inside: still flagged, but not visually archived.
    expect(isArchived({ archived: true, collapsed: false, lastArchivedAt: 1 }, "")).toBe(false);
    expect(isArchived({ archived: false, collapsed: true, lastArchivedAt: null }, "")).toBe(false);
  });

  it("is always false while searching", () => {
    expect(isArchived({ archived: true, collapsed: true, lastArchivedAt: 1 }, "foo")).toBe(false);
  });
});

describe("search", () => {
  const tree = folder("root", "Work", [
    folder("a", "Clients", [folder("deep", "Old", [bookmark("x", "Invoice tool", "https://billing.example")])]),
    bookmark("y", "Calendar"),
  ]);

  it("normalizes input", () => {
    expect(normalizeQuery("  InVoice ")).toBe("invoice");
  });

  it("matches bookmarks by title or url, case-insensitively", () => {
    expect(nodeMatchesQuery(bookmark("b", "GitHub"), "github")).toBe(true);
    expect(nodeMatchesQuery(bookmark("b", "Code", "https://github.com"), "github")).toBe(true);
    expect(nodeMatchesQuery(bookmark("b", "Code", "https://gitlab.com"), "github")).toBe(false);
  });

  it("keeps a folder visible when something deep inside matches", () => {
    expect(nodeMatchesQuery(tree, "billing")).toBe(true);
    expect(ids(visibleChildren(tree.children!, "billing"))).toEqual(["a"]);
  });

  it("matches folders by their own title", () => {
    expect(ids(visibleChildren(tree.children!, "clients"))).toEqual(["a"]);
  });

  it("returns everything when the query is empty", () => {
    expect(visibleChildren(tree.children!, "")).toBe(tree.children);
  });
});

describe("orderFolders / groupFolders", () => {
  const folders = [folder("1", "A"), folder("2", "B"), folder("3", "C"), folder("4", "D")];

  it("keeps native order when nothing is archived", () => {
    expect(ids(orderFolders(folders, {}, ""))).toEqual(["1", "2", "3", "4"]);
  });

  it("moves archived folders last, most recently archived first", () => {
    const meta: FolderMetaMap = {
      "1": { archived: true, collapsed: true, lastArchivedAt: 100 },
      "3": { archived: true, collapsed: true, lastArchivedAt: 200 },
    };
    expect(ids(orderFolders(folders, meta, ""))).toEqual(["2", "4", "3", "1"]);
  });

  it("renders a single archived folder as its own row", () => {
    const meta: FolderMetaMap = { "2": { archived: true, collapsed: true, lastArchivedAt: 1 } };
    const { individual, summarized } = groupFolders(folders, meta, "");
    expect(ids(individual)).toEqual(["1", "3", "4", "2"]);
    expect(summarized).toEqual([]);
  });

  it("folds two or more archived folders into the summary", () => {
    const meta: FolderMetaMap = {
      "1": { archived: true, collapsed: true, lastArchivedAt: 100 },
      "3": { archived: true, collapsed: true, lastArchivedAt: 200 },
    };
    const { individual, summarized } = groupFolders(folders, meta, "");
    expect(ids(individual)).toEqual(["2", "4"]);
    expect(ids(summarized)).toEqual(["3", "1"]);
  });

  it("does not group or reorder while searching", () => {
    const meta: FolderMetaMap = {
      "1": { archived: true, collapsed: true, lastArchivedAt: 100 },
      "3": { archived: true, collapsed: true, lastArchivedAt: 200 },
    };
    const { individual, summarized } = groupFolders(folders, meta, "a");
    expect(ids(individual)).toEqual(["1", "2", "3", "4"]);
    expect(summarized).toEqual([]);
  });
});

describe("parent map", () => {
  const roots = [folder("bar", "Bar", [folder("a", "A", [folder("b", "B", [bookmark("c", "C")])])])];
  const parents = buildParentMap(roots);

  it("finds ancestors", () => {
    expect(isSelfOrDescendant(parents, "c", "a")).toBe(true);
    expect(isSelfOrDescendant(parents, "b", "b")).toBe(true);
    expect(isSelfOrDescendant(parents, "a", "b")).toBe(false);
  });
});

describe("folderPreview", () => {
  const tree = folder("f", "F", [
    folder("sub", "Sub", [bookmark("deep", "Deep"), bookmark("deep2", "Deep 2")]),
    bookmark("a", "A"),
    bookmark("b", "B"),
  ]);

  it("counts bookmarks at any depth", () => {
    expect(folderPreview(tree, 10).count).toBe(4);
    expect(folderPreview(folder("e", "Empty"), 3)).toEqual({ count: 0, first: [] });
  });

  it("previews the folder's own bookmarks before its subfolders'", () => {
    expect(ids(folderPreview(tree, 3).first)).toEqual(["a", "b", "deep"]);
  });
});
