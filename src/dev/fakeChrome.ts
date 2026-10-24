// A minimal in-memory stand-in for the chrome.* APIs the extension uses, so
// whole pages can run outside an extension: under jsdom in tests, and in a
// normal browser tab for the `npm run dev:web` preview (see webPreview.ts).
import type { BookmarkNode } from "../lib/types";

type Listener = (...args: unknown[]) => void;

function fakeEvent() {
  const listeners = new Set<Listener>();
  return {
    addListener: (fn: Listener) => listeners.add(fn),
    removeListener: (fn: Listener) => listeners.delete(fn),
    fire: (...args: unknown[]) => listeners.forEach((fn) => fn(...args)),
  };
}

export interface FakeChrome {
  storage: Record<string, unknown>;
  bookmarks: BookmarkNode[];
  // Simulates another extension page writing to storage.
  externalStorageWrite(items: Record<string, unknown>): void;
  find(id: string): BookmarkNode | undefined;
  // URLs opened through chrome.tabs, in order.
  opened: { url: string; newTab: boolean }[];
}

export function installFakeChrome(roots: BookmarkNode[], initialStorage: Record<string, unknown> = {}): FakeChrome {
  const tree: BookmarkNode = { id: "0", title: "", children: structuredClone(roots) };
  const store: Record<string, unknown> = structuredClone(initialStorage);
  const storageChanged = fakeEvent();
  const opened: { url: string; newTab: boolean }[] = [];
  const bookmarkEvents = {
    onCreated: fakeEvent(),
    onRemoved: fakeEvent(),
    onChanged: fakeEvent(),
    onMoved: fakeEvent(),
    onChildrenReordered: fakeEvent(),
    onImportEnded: fakeEvent(),
  };

  // Keep every node's parentId in sync with where it sits.
  const fixParents = (node: BookmarkNode) =>
    node.children?.forEach((child) => {
      child.parentId = node.id;
      fixParents(child);
    });
  fixParents(tree);

  // Like Chrome, getTree reports each node's position within its parent.
  const withIndexes = (node: BookmarkNode): BookmarkNode => {
    node.children?.forEach((child, index) => {
      child.index = index;
      withIndexes(child);
    });
    return node;
  };

  const find = (id: string, node: BookmarkNode = tree): BookmarkNode | undefined => {
    if (node.id === id) return node;
    for (const child of node.children ?? []) {
      const hit = find(id, child);
      if (hit) return hit;
    }
    return undefined;
  };

  const write = (items: Record<string, unknown>) => {
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
    for (const [key, value] of Object.entries(items)) {
      changes[key] = { oldValue: store[key], newValue: structuredClone(value) };
      store[key] = structuredClone(value);
    }
    // Chrome delivers onChanged asynchronously, including to the writing page.
    queueMicrotask(() => storageChanged.fire(changes, "local"));
  };

  const api = {
    runtime: {
      getURL: (path: string) => `chrome-extension://test${path}`,
      openOptionsPage: () => {},
    },
    tabs: {
      update: async ({ url }: { url: string }) => void opened.push({ url, newTab: false }),
      create: async ({ url }: { url: string }) => void opened.push({ url, newTab: true }),
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const result: Record<string, unknown> = {};
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            if (key in store) result[key] = structuredClone(store[key]);
          }
          return result;
        },
        set: async (items: Record<string, unknown>) => write(items),
      },
      onChanged: storageChanged,
    },
    bookmarks: {
      ...bookmarkEvents,
      getTree: async () => [withIndexes(structuredClone(tree))],
      update: async (id: string, changes: { title?: string; url?: string }) => {
        const node = find(id)!;
        if (changes.url !== undefined) {
          // Like Chrome, reject URLs that don't parse.
          if (!URL.canParse(changes.url)) throw new Error("Invalid URL.");
          node.url = changes.url;
        }
        if (changes.title !== undefined) node.title = changes.title;
        bookmarkEvents.onChanged.fire(id, changes);
        return structuredClone(node);
      },
      remove: async (id: string) => {
        const node = find(id)!;
        if (node.children?.length) throw new Error("Can't remove non-empty folder (use recursive to force).");
        const parent = find(node.parentId!)!;
        parent.children = parent.children!.filter((c) => c.id !== id);
        bookmarkEvents.onRemoved.fire(id, { parentId: parent.id });
      },
      move: async (id: string, destination: { parentId?: string; index?: number }) => {
        const node = find(id)!;
        const oldParent = find(node.parentId!)!;
        const newParent = destination.parentId ? find(destination.parentId)! : oldParent;
        const oldIndex = oldParent.children!.indexOf(node);
        oldParent.children = oldParent.children!.filter((c) => c.id !== id);
        let index = destination.index ?? newParent.children!.length;
        // Like Chrome, an index within the same parent counts positions in the
        // list before the node is taken out of it.
        if (newParent === oldParent && destination.index !== undefined && index > oldIndex) index--;
        newParent.children!.splice(index, 0, node);
        node.parentId = newParent.id;
        bookmarkEvents.onMoved.fire(id, {});
        return structuredClone(node);
      },
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = api;

  return {
    storage: store,
    get bookmarks() {
      return tree.children!;
    },
    externalStorageWrite: write,
    find: (id) => find(id),
    opened,
  };
}
