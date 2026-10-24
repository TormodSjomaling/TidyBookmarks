import { useEffect, useMemo, useRef, useState } from "react";
import type { DragUnit } from "../lib/dnd";
import { buildParentMap, isFolder, normalizeQuery, visibleChildren } from "../lib/tree";
import type { BookmarkNode } from "../lib/types";
import { useSettings } from "../shared/settings";
import { Bookmark } from "./Bookmark";
import { DashboardContext, type Dashboard } from "./dashboard";
import { FolderList } from "./Folder";
import { useBookmarkTree, useFolderMeta } from "./hooks";

const DEFAULT_BOOKMARKS_KEY = "default";
// Debounced so typing doesn't re-filter the whole tree on every keystroke.
const SEARCH_DEBOUNCE_MS = 150;

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

  const parents = useMemo(() => buildParentMap(roots ?? []), [roots]);

  if (!roots || !folderMeta || !settings) return null;

  const dashboard: Dashboard = { folderMeta, updateFolderMeta, settings, query, parents, dragged };

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
          <input
            id="search-input"
            type="text"
            placeholder="Search bookmarks…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setSearchText("");
                setQuery("");
                e.currentTarget.blur();
              }
            }}
          />
          <button id="options-btn" type="button" title="Options" onClick={() => chrome.runtime.openOptionsPage()}>
            ⚙
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
                <FolderList folders={section.folders} parentId={section.root.id} topLevel />
              </div>
            ))
        )}
      </main>
    </DashboardContext.Provider>
  );
}
