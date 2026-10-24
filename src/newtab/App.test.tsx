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
          { id: "wiki", title: "Wiki", url: "https://wiki.example" },
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

  describe("search keyboard", () => {
    const search = () => screen.getByPlaceholderText("Search bookmarks…");
    const tile = (id: string) => document.querySelector(`[data-bookmark-id="${id}"]`)!;
    // "in" matches LinkedIn (header row) and Invoices (inside Work › Acme).
    async function searchFor(text: string) {
      fireEvent.change(search(), { target: { value: text } });
      await screen.findByText("2 matches");
    }

    it("selects the first match, moves with the arrows and opens with Enter", async () => {
      await renderApp();
      await searchFor("in");
      expect(tile("li").classList.contains("bookmark-item--active")).toBe(true);

      fireEvent.keyDown(search(), { key: "ArrowDown" });
      expect(tile("inv").classList.contains("bookmark-item--active")).toBe(true);
      fireEvent.keyDown(search(), { key: "ArrowDown" });
      expect(tile("inv").classList.contains("bookmark-item--active")).toBe(true);

      fireEvent.keyDown(search(), { key: "Enter" });
      expect(fake.opened).toEqual([{ url: "https://billing.example", newTab: false }]);
    });

    it("opens in a background tab with Ctrl+Enter", async () => {
      await renderApp();
      await searchFor("in");
      fireEvent.keyDown(search(), { key: "Enter", ctrlKey: true });
      expect(fake.opened).toEqual([{ url: "https://linkedin.com", newTab: true }]);
    });

    it("opens the first match of what's typed, even before the results update", async () => {
      await renderApp();
      fireEvent.change(search(), { target: { value: "bank" } });
      fireEvent.keyDown(search(), { key: "Enter" });
      expect(fake.opened).toEqual([{ url: "https://bank.example", newTab: false }]);
    });

    it("highlights matches in titles", async () => {
      await renderApp();
      await searchFor("in");
      expect(tile("inv").querySelector("mark")?.textContent).toBe("In");
    });

    it("focuses the search box when typing anywhere on the page, but not in other inputs", async () => {
      await renderApp();
      fireEvent.keyDown(document.body, { key: "j" });
      expect(document.activeElement).toBe(search());

      search().blur();
      fireEvent.click(folderEl("acme").querySelector('button[title="Rename"]')!);
      const rename = folderEl("acme").querySelector("input")!;
      rename.focus();
      fireEvent.keyDown(rename, { key: "j" });
      expect(document.activeElement).toBe(rename);
    });
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

  describe("dragging bookmarks", () => {
    const tile = (id: string) => document.querySelector(`[data-bookmark-id="${id}"]`)!;
    const dataTransfer = { effectAllowed: "", dropEffect: "" };
    const workOrder = () => fake.find("work")!.children!.map((c) => c.id);

    beforeEach(async () => {
      await renderApp();
      // jsdom has no layout: give the target tile a box, 200px wide.
      tile("wiki").getBoundingClientRect = () => ({ left: 100, right: 300, width: 200 }) as DOMRect;
      tile("jira").getBoundingClientRect = () => ({ left: 100, right: 300, width: 200 }) as DOMRect;
    });

    it("shows a line on the side of the tile the pointer is on", () => {
      fireEvent.dragStart(tile("jira"), { dataTransfer });
      fireEvent.dragOver(tile("wiki"), { clientX: 120, dataTransfer });
      expect(tile("wiki").classList.contains("drop-before")).toBe(true);
      fireEvent.dragOver(tile("wiki"), { clientX: 280, dataTransfer });
      expect(tile("wiki").classList.contains("drop-after")).toBe(true);
      expect(tile("wiki").classList.contains("drop-before")).toBe(false);
    });

    it("drops after the tile from its right half", async () => {
      fireEvent.dragStart(tile("jira"), { dataTransfer });
      fireEvent.drop(tile("wiki"), { clientX: 280, dataTransfer });
      await waitFor(() => expect(workOrder().slice(0, 2)).toEqual(["wiki", "jira"]));
    });

    it("drops before the tile from its left half", async () => {
      fireEvent.dragStart(tile("wiki"), { dataTransfer });
      fireEvent.drop(tile("jira"), { clientX: 120, dataTransfer });
      await waitFor(() => expect(workOrder().slice(0, 2)).toEqual(["wiki", "jira"]));
    });
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

  describe("adding bookmarks and folders", () => {
    const openAdd = (id: string) => {
      fireEvent.click(folderEl(id).querySelector('button[title="Add bookmark or folder"]')!);
      return screen.getByRole("dialog");
    };
    const childIds = (id: string) => fake.find(id)!.children!.map((c) => c.id);

    it("adds a bookmark at the end of a folder, named by its site if left unnamed", async () => {
      await renderApp();
      const dialog = openAdd("personal");
      expect(dialog.getAttribute("aria-label")).toBe("Add to Personal");
      fireEvent.change(screen.getByLabelText("URL"), { target: { value: "www.example.com/x" } });
      fireEvent.click(screen.getByRole("button", { name: "Add bookmark" }));

      await waitFor(() => expect(childIds("personal")).toHaveLength(2));
      const added = fake.find(childIds("personal")[1])!;
      expect(added).toMatchObject({ title: "example.com", url: "https://www.example.com/x" });
      expect(await screen.findByText("example.com")).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("refuses a URL that doesn't parse", async () => {
      await renderApp();
      openAdd("personal");
      fireEvent.change(screen.getByLabelText("URL"), { target: { value: "not a url" } });
      fireEvent.click(screen.getByRole("button", { name: "Add bookmark" }));
      expect(screen.getByRole("alert").textContent).toMatch(/valid URL/);
      expect(childIds("personal")).toHaveLength(1);
    });

    it("adds a subfolder, which needs a name", async () => {
      await renderApp();
      openAdd("personal");
      fireEvent.click(screen.getByRole("button", { name: "Folder" }));
      fireEvent.click(screen.getByRole("button", { name: "Add folder" }));
      expect(screen.getByRole("alert").textContent).toMatch(/name/);

      fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "Taxes" } });
      fireEvent.click(screen.getByRole("button", { name: "Add folder" }));
      await waitFor(() => expect(fake.find(childIds("personal")[1])).toMatchObject({ title: "Taxes", children: [] }));
    });

    it("opens a collapsed folder after adding to it", async () => {
      await renderApp({ folderMeta: { personal: { collapsed: true, archived: false, lastArchivedAt: null } } });
      openAdd("personal");
      fireEvent.change(screen.getByLabelText("URL"), { target: { value: "example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Add bookmark" }));
      await waitFor(() => expect(folderEl("personal").classList.contains("collapsed")).toBe(false));
      expect(storedMeta().personal.collapsed).toBe(false);
    });

    it("adds a top-level folder to the end of the bookmarks bar", async () => {
      await renderApp();
      fireEvent.click(screen.getByRole("button", { name: "New folder" }));
      fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "Inbox" } });
      fireEvent.click(screen.getByRole("button", { name: "Add folder" }));
      await waitFor(() => expect(fake.find(childIds("1").at(-1)!)!.title).toBe("Inbox"));
    });

    it("saves a link dragged in from another window into the folder under the pointer", async () => {
      await renderApp();
      const data: Record<string, string> = {
        "text/uri-list": "https://news.example/story",
        "text/html": '<meta charset="utf-8"><a href="https://news.example/story">A good story</a>',
      };
      const dataTransfer = { types: Object.keys(data), getData: (type: string) => data[type] ?? "", dropEffect: "" };

      fireEvent.dragOver(folderEl("acme").querySelector('[data-bookmark-id="inv"]')!, { dataTransfer });
      expect(folderEl("acme").classList.contains("drag-over-into")).toBe(true);
      expect(dataTransfer.dropEffect).toBe("copy");
      fireEvent.drop(folderEl("acme").querySelector('[data-bookmark-id="inv"]')!, { dataTransfer });

      await waitFor(() => expect(childIds("acme")).toHaveLength(2));
      expect(fake.find(childIds("acme")[1])).toMatchObject({ title: "A good story", url: "https://news.example/story" });
    });

    it("ignores dragged text that isn't a link", async () => {
      await renderApp();
      const dataTransfer = { types: ["text/plain"], getData: () => "hello", dropEffect: "" };
      fireEvent.dragOver(header("personal"), { dataTransfer });
      expect(folderEl("personal").classList.contains("drag-over-into")).toBe(false);
    });
  });
});
