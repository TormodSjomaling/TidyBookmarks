import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookmarkNode, FolderMetaMap } from "../lib/types";
import { installFakeChrome, type FakeChrome } from "../dev/fakeChrome";
import { App } from "./App";

const roots: BookmarkNode[] = [
  {
    id: "1",
    title: "Bookmarks bar",
    children: [
      { id: "g", title: "Google", url: "https://google.com" },
      {
        id: "work",
        title: "Work",
        children: [
          { id: "jira", title: "Jira", url: "https://jira.example" },
          { id: "acme", title: "Acme", children: [{ id: "inv", title: "Invoices", url: "https://billing.example" }] },
          { id: "old1", title: "Old client 1", children: [] },
          { id: "old2", title: "Old client 2", children: [] },
        ],
      },
    ],
  },
  { id: "2", title: "Other bookmarks", children: [{ id: "li", title: "LinkedIn", url: "https://linkedin.com" }] },
];

let fake: FakeChrome;

async function renderApp(storage: Record<string, unknown> = {}) {
  fake = installFakeChrome(roots, storage);
  const result = render(<App />);
  await screen.findByText("Work");
  return result;
}

const folderEl = (id: string) => document.querySelector(`.folder[data-folder-id="${id}"]`)!;
const header = (id: string) => folderEl(id).querySelector(".folder-header")!;
const storedMeta = () => fake.storage.folderMeta as FolderMetaMap;

beforeEach(() => vi.useRealTimers());
afterEach(cleanup);

describe("new tab page", () => {
  it("renders default bookmarks from every root in the header row", async () => {
    await renderApp();
    const row = document.getElementById("default-bookmarks")!;
    expect([...row.querySelectorAll(".bookmark-item")].map((el) => el.getAttribute("data-bookmark-id"))).toEqual([
      "g",
      "li",
    ]);
    // faviconOnlyDefault defaults to true: no titles in the header row.
    expect(row.querySelector(".bookmark-title")).toBeNull();
    expect(screen.getByText("Jira")).toBeTruthy();
  });

  it("collapses a folder on header click and persists it", async () => {
    await renderApp();
    fireEvent.click(header("acme"));
    expect(folderEl("acme").classList.contains("collapsed")).toBe(true);
    expect(storedMeta().acme.collapsed).toBe(true);
  });

  it("archives a folder: dimmed, badge, sorted last", async () => {
    await renderApp();
    fireEvent.click(folderEl("acme").querySelector('button[title="Archive"]')!);
    expect(folderEl("acme").classList.contains("archived")).toBe(true);
    expect(folderEl("acme").querySelector(".folder-badge")?.textContent).toBe("Archived");
    const order = [...folderEl("work").querySelectorAll(":scope > .folder-children > .folder")].map((el) =>
      el.getAttribute("data-folder-id")
    );
    expect(order).toEqual(["old1", "old2", "acme"]);
  });

  it("groups 2+ archived siblings into a summary whose chips unarchive", async () => {
    await renderApp({
      folderMeta: {
        old1: { archived: true, collapsed: true, lastArchivedAt: 1 },
        old2: { archived: true, collapsed: true, lastArchivedAt: 2 },
      },
    });
    expect(screen.getByText("2 archived")).toBeTruthy();
    expect(folderEl("old1")).toBeNull();
    const chips = [...document.querySelectorAll(".archived-chip")].map((el) => el.textContent);
    expect(chips).toEqual(["Old client 2", "Old client 1"]);

    fireEvent.click(screen.getByText("Old client 1"));
    expect(storedMeta().old1).toMatchObject({ archived: false, collapsed: false });
    expect(folderEl("old1")).not.toBeNull();
    expect(screen.queryByText("2 archived")).toBeNull();
  });

  it("search filters recursively and forces folders open without touching stored state", async () => {
    await renderApp({ folderMeta: { acme: { archived: true, collapsed: true, lastArchivedAt: 1 } } });
    fireEvent.change(screen.getByPlaceholderText("Search bookmarks…"), { target: { value: "billing" } });
    await waitFor(() => expect(screen.queryByText("Jira")).toBeNull());
    expect(screen.getByText("Invoices")).toBeTruthy();
    expect(folderEl("acme").classList.contains("collapsed")).toBe(false);
    expect(folderEl("acme").classList.contains("archived")).toBe(false);
    expect(header("acme").getAttribute("draggable")).toBeNull();
    expect(storedMeta()).toEqual({ acme: { archived: true, collapsed: true, lastArchivedAt: 1 } });

    fireEvent.keyDown(screen.getByPlaceholderText("Search bookmarks…"), { key: "Escape" });
    expect(await screen.findByText("Jira")).toBeTruthy();
    expect(folderEl("acme").classList.contains("collapsed")).toBe(true);
  });

  it("shows an empty state when nothing matches", async () => {
    await renderApp();
    fireEvent.change(screen.getByPlaceholderText("Search bookmarks…"), { target: { value: "zzzz" } });
    expect(await screen.findByText("No matching bookmarks.")).toBeTruthy();
  });

  it("renames a bookmark with Enter", async () => {
    await renderApp();
    const jira = document.querySelector('[data-bookmark-id="jira"]')!;
    fireEvent.click(jira.querySelector(".bookmark-edit-btn")!);
    const input = jira.querySelector("input")!;
    fireEvent.change(input, { target: { value: "  Jira board " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Jira board")).toBeTruthy();
    await waitFor(() => expect(fake.find("jira")!.title).toBe("Jira board"));
  });

  it("Escape cancels a rename even though blur follows", async () => {
    await renderApp();
    fireEvent.click(folderEl("acme").querySelector('button[title="Rename"]')!);
    const input = folderEl("acme").querySelector("input")!;
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(fake.find("acme")!.title).toBe("Acme");
  });

  it("adopts folder state written by another open tab", async () => {
    await renderApp();
    await act(async () => {
      fake.externalStorageWrite({ folderMeta: { acme: { archived: false, collapsed: true, lastArchivedAt: null } } });
    });
    expect(folderEl("acme").classList.contains("collapsed")).toBe(true);
    // Our next write builds on the adopted state instead of overwriting it.
    fireEvent.click(header("old1"));
    expect(storedMeta().acme.collapsed).toBe(true);
    expect(storedMeta().old1.collapsed).toBe(true);
  });

  it("re-reads the tree when bookmarks change elsewhere", async () => {
    await renderApp();
    await act(async () => {
      await chrome.bookmarks.update("li", { title: "LinkedIn Jobs" });
    });
    // Header-row bookmarks show only favicons, so check the link's tooltip.
    await waitFor(() =>
      expect(document.querySelector('[data-bookmark-id="li"] a')!.getAttribute("title")).toBe("LinkedIn Jobs")
    );
  });
});
