import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DragUnit } from "../lib/dnd";
import { buildParentMap, isFolder, normalizeQuery, searchResults, visibleChildren } from "../lib/tree";
import type { BookmarkNode } from "../lib/types";
import { GearIcon, PlusIcon, SearchIcon } from "../shared/icons";
import { useSettings } from "../shared/settings";
import { AddPopover } from "./AddPopover";
import { Bookmark } from "./Bookmark";
import { DashboardContext, type Dashboard } from "./dashboard";
import { FolderList } from "./Folder";
import { playGlide } from "./glide";
import { useBookmarkTree, useFolderMeta } from "./hooks";

const DEFAULT_BOOKMARKS_KEY = "default";
// Debounced so typing doesn't re-filter the whole tree on every keystroke.
const SEARCH_DEBOUNCE_MS = 150;

// Opens a bookmark in this tab, or in a background tab like a Ctrl-click.
function openBookmark(url: string, newTab: boolean) {
  if (newTab) chrome.tabs.create({ url, active: false });
  else chrome.tabs.update({ url });
}

// Whether a key press should start a search: a printable key, typed while
// nothing that takes text has focus.
function startsSearch(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return false;
  if (e.key.length !== 1 || e.key === " ") return false;
  return !(e.target as Element).closest?.("input, textarea, select, [contenteditable]");
}

export function App() {
  const roots = useBookmarkTree();
  const [folderMeta, updateFolderMeta] = useFolderMeta();
  const settings = useSettings();
  const dragged = useRef<DragUnit | null>(null);

  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(normalizeQuery(searchText)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Typing anywhere on the page goes into the search box. "/" just focuses it.
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!startsSearch(e)) return;
      if (e.key === "/") e.preventDefault();
      // Focusing during keydown sends the key's character to the search box.
      searchInput.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // While searching, the arrow keys step through the matching bookmarks, and
  // Enter opens the selected one (the first, until the arrows move).
  const results = useMemo(() => searchResults(roots ?? [], query), [roots, query]);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => setActiveIndex(0), [query]);
  const activeResultId = results[Math.min(activeIndex, results.length - 1)]?.id ?? null;

  const parents = useMemo(() => buildParentMap(roots ?? []), [roots]);
  const [addingFolder, setAddingFolder] = useState(false);
  const addFolderId = useId();
  // Animates our own drops once the re-read tree is on screen (glide.ts).
  useLayoutEffect(playGlide, [roots]);

  // Marks the page as rendered, which turns on transitions that shouldn't play
  // while it first appears (see [data-ready] in newtab.css).
  const loaded = roots !== null && folderMeta !== null && settings !== null;
  useEffect(() => {
    if (!loaded) return;
    const frame = requestAnimationFrame(() => document.documentElement.setAttribute("data-ready", ""));
    return () => cancelAnimationFrame(frame);
  }, [loaded]);

  if (!roots || !folderMeta || !settings) return null;

  const dashboard: Dashboard = { folderMeta, updateFolderMeta, settings, query, parents, dragged, activeResultId };

  const clearSearch = () => {
    setSearchText("");
    setQuery("");
  };

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      clearSearch();
      e.currentTarget.blur();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => Math.max(0, Math.min(results.length - 1, i + step)));
    } else if (e.key === "Enter") {
      // Enter can beat the debounce; search what's typed right now.
      const typed = normalizeQuery(searchText);
      const current = typed === query ? results : searchResults(roots, typed);
      const target = typed === query ? current[Math.min(activeIndex, current.length - 1)] : current[0];
      if (!target?.url) return;
      e.preventDefault();
      openBookmark(target.url, e.ctrlKey || e.metaKey);
    }
  };

  // Each Chrome root (bookmarks bar, other bookmarks, mobile) contributes its
  // loose bookmarks to the shared header row and its folders to the main area.
  const sections = roots
    .filter((root) => root.children && root.children.length > 0)
    .map((root) => {
      const visible = visibleChildren(root.children!, query);
      return { root, folders: visible.filter(isFolder), bookmarks: visible.filter((c) => !isFolder(c)) };
    })
    .filter((section) => section.folders.length > 0 || section.bookmarks.length > 0);

  const defaultBookmarks: BookmarkNode[] = sections.flatMap((section) => section.bookmarks);

  return (
    <DashboardContext.Provider value={dashboard}>
      <header id="page-header">
        <div id="default-bookmarks" className="bookmark-grid default-grid" hidden={defaultBookmarks.length === 0}>
          {defaultBookmarks.map((node) => (
            <Bookmark key={node.id} node={node} isDefault containerKey={DEFAULT_BOOKMARKS_KEY} />
          ))}
        </div>
        <div id="header-right">
          <label id="search-box">
            <SearchIcon size={15} />
            <input
              id="search-input"
              ref={searchInput}
              type="text"
              placeholder="Search bookmarks…"
              aria-describedby="search-count"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
            {query ? (
              <span id="search-count" className="search-count" aria-live="polite">
                {results.length === 0 ? "None" : results.length === 1 ? "1 match" : `${results.length} matches`}
              </span>
            ) : (
              !searchText && <kbd className="search-hint">/</kbd>
            )}
          </label>
          <button id="options-btn" type="button" title="Options" onClick={() => chrome.runtime.openOptionsPage()}>
            <GearIcon size={18} />
          </button>
        </div>
      </header>
      <main id="app">
        {sections.length === 0 ? (
          <div className="empty-state">{query ? "No matching bookmarks." : "No bookmarks yet."}</div>
        ) : (
          sections
            .filter((section) => section.folders.length > 0)
            .map((section) => (
              <div key={section.root.id}>
                <FolderList folders={section.folders} parentId={section.root.id} depth={0} />
              </div>
            ))
        )}
        {!query && roots.length > 0 && (
          <div className="add-folder-row">
            <button
              type="button"
              className={addingFolder ? "add-folder popover-anchor" : "add-folder"}
              aria-haspopup="dialog"
              aria-expanded={addingFolder}
              popoverTarget={addingFolder ? addFolderId : undefined}
              popoverTargetAction="hide"
              onClick={(e) => {
                if (addingFolder) return;
                e.preventDefault();
                setAddingFolder(true);
              }}
            >
              <PlusIcon size={15} />
              New folder
            </button>
          </div>
        )}
        {addingFolder && (
          // New top-level folders go at the end of the bookmarks bar.
          <AddPopover
            id={addFolderId}
            parentId={roots[0].id}
            parentTitle={roots[0].title}
            folderOnly
            onClose={() => setAddingFolder(false)}
          />
        )}
      </main>
    </DashboardContext.Provider>
  );
}
