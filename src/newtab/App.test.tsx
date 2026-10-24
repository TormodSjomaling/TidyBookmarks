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
      { id: "personal", title: "Personal", children: [{ id: "bank", title: "Bank", url: "https://bank.example" }] },
    ],
  },
  {
    id: "2",
    title: "Other bookmarks",
    children: [
      { id: "li", title: "LinkedIn", url: "https://linkedin.com" },
      { id: "reading", title: "Reading", children: [] },
    ],
  },
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

  describe("bookmark editor popover", () => {
    const openEditor = (id: string) => {
      fireEvent.click(document.querySelector(`[data-bookmark-id="${id}"] .bookmark-edit-btn`)!);
      return screen.getByRole("dialog", { name: "Edit bookmark" });
    };

    it("opens prefilled with the bookmark's name and URL", async () => {
      await renderApp();
      openEditor("jira");
      expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Jira");
      expect((screen.getByLabelText("URL") as HTMLInputElement).value).toBe("https://jira.example");
    });

    it("saves a new name and URL, adding https:// when it's missing", async () => {
      await renderApp();
      openEditor("jira");
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Jira board " } });
      fireEvent.change(screen.getByLabelText("URL"), { target: { value: "board.example.com/team" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(fake.find("jira")).toMatchObject({ title: "Jira board", url: "https://board.example.com/team" });
      expect(screen.getByText("Jira board")).toBeTruthy();
      expect(document.querySelector('[data-bookmark-id="jira"] a')!.getAttribute("href")).toBe(
        "https://board.example.com/team"
      );
    });

    it("rejects an invalid URL and keeps the popover open", async () => {
      await renderApp();
      openEditor("jira");
      fireEvent.change(screen.getByLabelText("URL"), { target: { value: "not a url" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByRole("alert").textContent).toMatch(/valid URL/);
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(fake.find("jira")!.url).toBe("https://jira.example");
    });

    it("Cancel closes without saving", async () => {
      await renderApp();
      openEditor("jira");
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Changed" } });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(fake.find("jira")!.title).toBe("Jira");
    });

    it("deletes the bookmark from Chrome after confirming", async () => {
      await renderApp();
      openEditor("jira");
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.getByText("Remove from Chrome bookmarks?")).toBeTruthy();
      // Nothing is deleted until the second, explicit Delete.
      expect(fake.find("jira")).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(document.querySelector('[data-bookmark-id="jira"]')).toBeNull());
      expect(fake.find("jira")).toBeUndefined();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("Keep backs out of deleting", async () => {
      await renderApp();
      openEditor("jira");
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      fireEvent.click(screen.getByRole("button", { name: "Keep" }));

      expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
      expect(fake.find("jira")).toBeDefined();
    });

    it("works for favicon-only default bookmarks too", async () => {
      await renderApp();
      openEditor("g");
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Search" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(fake.find("g")!.title).toBe("Search"));
    });
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

  describe("dragging folders", () => {
    // jsdom has no layout, so give each folder header a fixed box to aim at.
    const placeHeader = (id: string, top: number) => {
      header(id).getBoundingClientRect = () => ({ top, bottom: top + 40, height: 40 }) as DOMRect;
    };
    const dataTransfer = { effectAllowed: "", dropEffect: "" };
    const drag = (fromId: string, onto: Element, clientY: number) => {
      fireEvent.dragStart(header(fromId), { dataTransfer });
      fireEvent.dragOver(onto, { clientY, dataTransfer });
      fireEvent.drop(onto, { clientY, dataTransfer });
      fireEvent.dragEnd(header(fromId), { dataTransfer });
    };
    const barOrder = () => fake.find("1")!.children!.map((c) => c.id);
    const otherOrder = () => fake.find("2")!.children!.map((c) => c.id);

    beforeEach(async () => {
      await renderApp();
      placeHeader("work", 100);
      placeHeader("acme", 200);
      placeHeader("personal", 400);
      placeHeader("reading", 600);
    });

    it("drops after an open sibling from anywhere in its contents, leaving loose bookmarks in place", async () => {
      drag("work", folderEl("personal").querySelector('[data-bookmark-id="bank"]')!, 460);
      await waitFor(() => expect(barOrder()).toEqual(["g", "personal", "work"]));
    });

    it("drops before a sibling from the top edge of its header", async () => {
      drag("personal", header("work"), 105);
      await waitFor(() => expect(barOrder()).toEqual(["g", "personal", "work"]));
    });

    it("reorders top-level folders across Chrome roots, moving them to the target's root", async () => {
      drag("reading", header("work"), 105);
      await waitFor(() => expect(barOrder()).toEqual(["g", "reading", "work", "personal"]));
      expect(otherOrder()).toEqual(["li"]);
    });

    it("moves a top-level folder after one in the other root", async () => {
      drag("work", header("reading"), 638);
      await waitFor(() => expect(otherOrder()).toEqual(["li", "reading", "work"]));
    });

    it("moves a subfolder up a level by dropping it beside a folder there", async () => {
      drag("acme", header("personal"), 405);
      await waitFor(() => expect(barOrder()).toEqual(["g", "work", "acme", "personal"]));
      expect(fake.find("work")!.children!.map((c) => c.id)).not.toContain("acme");
    });

    it("moves a subfolder up a level by dropping it on its parent's contents", async () => {
      drag("acme", folderEl("work").querySelector('[data-bookmark-id="jira"]')!, 160);
      await waitFor(() => expect(barOrder()).toEqual(["g", "work", "acme", "personal"]));
    });

    it("does nothing over the dragged folder's own contents", () => {
      fireEvent.dragStart(header("acme"), { dataTransfer });
      fireEvent.dragOver(folderEl("acme").querySelector('[data-bookmark-id="inv"]')!, { clientY: 260, dataTransfer });
      expect(document.querySelector(".drop-before, .drop-after, .drag-over-into")).toBeNull();
    });

    it("moves into a sibling from the middle of its header", async () => {
      drag("personal", header("work"), 120);
      await waitFor(() => expect(fake.find("personal")!.parentId).toBe("work"));
    });

    it("shows a drop line where the folder will land", () => {
      fireEvent.dragStart(header("work"), { dataTransfer });
      fireEvent.dragOver(folderEl("personal").querySelector(".folder-children")!, { clientY: 460, dataTransfer });
      expect(folderEl("personal").classList.contains("drop-after")).toBe(true);
      fireEvent.dragOver(header("personal"), { clientY: 402, dataTransfer });
      expect(folderEl("personal").classList.contains("drop-before")).toBe(true);
      expect(folderEl("personal").classList.contains("drop-after")).toBe(false);
    });

    it("lets a nested folder take the drop instead of its open parent", async () => {
      fireEvent.dragStart(header("personal"), { dataTransfer });
      fireEvent.dragOver(header("acme"), { clientY: 220, dataTransfer });
      expect(folderEl("acme").classList.contains("drag-over-into")).toBe(true);
      expect(folderEl("work").className).not.toMatch(/drop-|drag-over/);
      fireEvent.drop(header("acme"), { clientY: 220, dataTransfer });
      await waitFor(() => expect(fake.find("personal")!.parentId).toBe("acme"));
    });
  });
});
