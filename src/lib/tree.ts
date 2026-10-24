import type { BookmarkNode, FolderMeta, FolderMetaMap } from "./types";

export const EMPTY_META: FolderMeta = { collapsed: false, archived: false, lastArchivedAt: null };

export function getMeta(folderMeta: FolderMetaMap, id: string): FolderMeta {
  return folderMeta[id] ?? EMPTY_META;
}

export function isFolder(node: BookmarkNode): boolean {
  return node.url === undefined;
}

// Search-aware: while a query is active, folders never count as "archived" for
// rendering purposes (they're forced open and shown plainly) even though the
// underlying meta is untouched — see CONTEXT.md / CLAUDE.md for why.
export function isArchived(meta: FolderMeta, query: string): boolean {
  return meta.archived && meta.collapsed && !query;
}

// Normalizes raw search-box input into the form nodeMatchesQuery expects.
export function normalizeQuery(input: string): string {
  return input.trim().toLowerCase();
}

function matchesText(text: string | undefined, query: string): boolean {
  return text !== undefined && text !== "" && text.toLowerCase().includes(query);
}

// A bookmark matches by title or URL; a folder matches by its own title or if
// anything inside it matches, at any depth.
export function nodeMatchesQuery(node: BookmarkNode, query: string): boolean {
  if (isFolder(node)) {
    if (matchesText(node.title, query)) return true;
    return (node.children ?? []).some((child) => nodeMatchesQuery(child, query));
  }
  return matchesText(node.title, query) || matchesText(node.url, query);
}

export function visibleChildren(children: BookmarkNode[], query: string): BookmarkNode[] {
  if (!query) return children;
  return children.filter((child) => nodeMatchesQuery(child, query));
}

// Non-archived folders keep native order; archived ones sort to the end,
// most-recently-archived first.
export function orderFolders(
  folders: BookmarkNode[],
  folderMeta: FolderMetaMap,
  query: string
): BookmarkNode[] {
  const archived: BookmarkNode[] = [];
  const rest: BookmarkNode[] = [];
  for (const folder of folders) {
    (isArchived(getMeta(folderMeta, folder.id), query) ? archived : rest).push(folder);
  }
  archived.sort(
    (a, b) =>
      (getMeta(folderMeta, b.id).lastArchivedAt ?? 0) - (getMeta(folderMeta, a.id).lastArchivedAt ?? 0)
  );
  return [...rest, ...archived];
}

// Splits sibling folders into those rendered as their own row and those folded
// into the "N archived" summary. The summary only kicks in past one archived
// sibling; a lone archived folder renders as its own compact row.
export function groupFolders(
  folders: BookmarkNode[],
  folderMeta: FolderMetaMap,
  query: string
): { individual: BookmarkNode[]; summarized: BookmarkNode[] } {
  const ordered = orderFolders(folders, folderMeta, query);
  const archived = ordered.filter((f) => isArchived(getMeta(folderMeta, f.id), query));
  if (archived.length > 1) {
    return { individual: ordered.filter((f) => !archived.includes(f)), summarized: archived };
  }
  return { individual: ordered, summarized: [] };
}

export type ParentMap = ReadonlyMap<string, string>;

export function buildParentMap(roots: BookmarkNode[]): ParentMap {
  const parents = new Map<string, string>();
  const walk = (node: BookmarkNode) => {
    for (const child of node.children ?? []) {
      parents.set(child.id, node.id);
      walk(child);
    }
  };
  roots.forEach(walk);
  return parents;
}

// True if `id` is `ancestorId` itself or nested anywhere beneath it.
export function isSelfOrDescendant(parents: ParentMap, id: string, ancestorId: string): boolean {
  for (let current: string | undefined = id; current !== undefined; current = parents.get(current)) {
    if (current === ancestorId) return true;
  }
  return false;
}

// What a collapsed folder shows of its contents: how many bookmarks it holds at
// any depth, and the first few of them, its own before its subfolders'.
export function folderPreview(folder: BookmarkNode, limit: number): { count: number; first: BookmarkNode[] } {
  let count = 0;
  const first: BookmarkNode[] = [];
  let level = [folder];
  while (level.length > 0) {
    const next: BookmarkNode[] = [];
    for (const node of level) {
      for (const child of node.children ?? []) {
        if (isFolder(child)) {
          next.push(child);
        } else {
          count++;
          if (first.length < limit) first.push(child);
        }
      }
    }
    level = next;
  }
  return { count, first };
}
