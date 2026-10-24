// The subset of chrome.bookmarks.BookmarkTreeNode the dashboard relies on.
// Declared locally so the pure logic in src/lib can be tested without Chrome.
export interface BookmarkNode {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  children?: BookmarkNode[];
}

// Persisted per folder in chrome.storage.local under `folderMeta`, keyed by the
// bookmark node's own id. See CONTEXT.md for what Collapsed/Archived mean.
export interface FolderMeta {
  collapsed: boolean;
  archived: boolean;
  lastArchivedAt: number | null;
}

export type FolderMetaMap = Record<string, FolderMeta>;

export type Theme = "system" | "dark" | "light";
export type Density = "comfortable" | "compact";

// Persisted in chrome.storage.local under `settings`, edited from the Options page.
export interface Settings {
  faviconOnlyDefault: boolean;
  theme: Theme;
  density: Density;
}
