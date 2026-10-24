import type { FolderMetaMap } from "./types";
import { getMeta } from "./tree";

// Pure state transitions for folderMeta. Each returns a new map; callers persist it.

export function toggleCollapsed(folderMeta: FolderMetaMap, id: string, now: number): FolderMetaMap {
  const meta = { ...getMeta(folderMeta, id) };
  meta.collapsed = !meta.collapsed;
  // Re-collapsing an archived folder counts as archiving it again, so it moves
  // back to the top of the archived group.
  if (meta.archived && meta.collapsed) meta.lastArchivedAt = now;
  return { ...folderMeta, [id]: meta };
}

// Archiving collapses immediately and unarchiving expands immediately; after
// that the two flags are independent again (see CONTEXT.md "Archived").
export function toggleArchived(folderMeta: FolderMetaMap, id: string, now: number): FolderMetaMap {
  const meta = { ...getMeta(folderMeta, id) };
  meta.archived = !meta.archived;
  meta.collapsed = meta.archived;
  if (meta.archived) meta.lastArchivedAt = now;
  return { ...folderMeta, [id]: meta };
}

// Used by the archived-summary chips: fully unarchive and expand.
export function unarchive(folderMeta: FolderMetaMap, id: string): FolderMetaMap {
  return { ...folderMeta, [id]: { ...getMeta(folderMeta, id), archived: false, collapsed: false } };
}
