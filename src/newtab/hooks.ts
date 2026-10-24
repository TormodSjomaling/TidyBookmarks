import { useCallback, useEffect, useRef, useState } from "react";
import type { BookmarkNode, FolderMetaMap } from "../lib/types";

// Reads the live bookmark tree (bookmarks are never copied into extension
// storage, see docs/adr/0001) and re-reads it whenever bookmarks change
// anywhere: our own moves/renames, another tab, or Chrome's bookmark manager.
// Bursts of events (e.g. a multi-item reorder) coalesce into one re-read.
export function useBookmarkTree(): BookmarkNode[] | null {
  const [roots, setRoots] = useState<BookmarkNode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      chrome.bookmarks.getTree().then((tree) => {
        if (!cancelled) setRoots(tree[0]?.children ?? []);
      });
    };
    const scheduleLoad = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 30);
    };

    load();
    const events = [
      chrome.bookmarks.onCreated,
      chrome.bookmarks.onRemoved,
      chrome.bookmarks.onChanged,
      chrome.bookmarks.onMoved,
      chrome.bookmarks.onChildrenReordered,
      chrome.bookmarks.onImportEnded,
    ] as chrome.events.Event<() => void>[];
    events.forEach((event) => event.addListener(scheduleLoad));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      events.forEach((event) => event.removeListener(scheduleLoad));
    };
  }, []);

  return roots;
}

export type UpdateFolderMeta = (change: (current: FolderMetaMap) => FolderMetaMap) => void;

// folderMeta in state plus a setter that persists to chrome.storage.local.
// Other open new-tab pages write folderMeta too, so their changes are adopted
// here; otherwise this page's next write would overwrite them with a stale
// copy. Our own writes echo back through onChanged and are skipped.
export function useFolderMeta(): [FolderMetaMap | null, UpdateFolderMeta] {
  const [folderMeta, setFolderMeta] = useState<FolderMetaMap | null>(null);
  const latest = useRef<FolderMetaMap>({});

  useEffect(() => {
    let cancelled = false;
    chrome.storage.local.get("folderMeta").then((result) => {
      if (cancelled) return;
      latest.current = (result.folderMeta as FolderMetaMap | undefined) ?? {};
      setFolderMeta(latest.current);
    });

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || !changes.folderMeta) return;
      const incoming = (changes.folderMeta.newValue as FolderMetaMap | undefined) ?? {};
      if (JSON.stringify(incoming) === JSON.stringify(latest.current)) return;
      latest.current = incoming;
      setFolderMeta(incoming);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const update = useCallback<UpdateFolderMeta>((change) => {
    latest.current = change(latest.current);
    setFolderMeta(latest.current);
    chrome.storage.local.set({ folderMeta: latest.current });
  }, []);

  return [folderMeta, update];
}
