import { describe, expect, it } from "vitest";
import { toggleArchived, toggleCollapsed, unarchive } from "./folderMeta";
import type { FolderMetaMap } from "./types";

describe("toggleCollapsed", () => {
  it("creates meta for an unseen folder", () => {
    expect(toggleCollapsed({}, "1", 5)).toEqual({ "1": { collapsed: true, archived: false, lastArchivedAt: null } });
  });

  it("does not mutate the input", () => {
    const before: FolderMetaMap = { "1": { collapsed: false, archived: false, lastArchivedAt: null } };
    toggleCollapsed(before, "1", 5);
    expect(before["1"].collapsed).toBe(false);
  });

  it("bumps lastArchivedAt when re-collapsing an archived folder", () => {
    const peeking: FolderMetaMap = { "1": { collapsed: false, archived: true, lastArchivedAt: 1 } };
    expect(toggleCollapsed(peeking, "1", 99)["1"]).toEqual({ collapsed: true, archived: true, lastArchivedAt: 99 });
  });

  it("leaves lastArchivedAt alone when expanding", () => {
    const archived: FolderMetaMap = { "1": { collapsed: true, archived: true, lastArchivedAt: 1 } };
    expect(toggleCollapsed(archived, "1", 99)["1"].lastArchivedAt).toBe(1);
  });
});

describe("toggleArchived", () => {
  it("archiving also collapses and stamps the time", () => {
    expect(toggleArchived({}, "1", 42)["1"]).toEqual({ collapsed: true, archived: true, lastArchivedAt: 42 });
  });

  it("unarchiving also expands", () => {
    const archived: FolderMetaMap = { "1": { collapsed: true, archived: true, lastArchivedAt: 42 } };
    expect(toggleArchived(archived, "1", 50)["1"]).toEqual({ collapsed: false, archived: false, lastArchivedAt: 42 });
  });
});

describe("unarchive", () => {
  it("clears archived and expands", () => {
    const archived: FolderMetaMap = { "1": { collapsed: true, archived: true, lastArchivedAt: 42 } };
    expect(unarchive(archived, "1")["1"]).toEqual({ collapsed: false, archived: false, lastArchivedAt: 42 });
  });
});
