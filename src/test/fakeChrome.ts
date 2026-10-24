// A minimal in-memory stand-in for the chrome.* APIs the extension uses, so
// whole pages can be rendered and exercised under jsdom.
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
}

export function installFakeChrome(roots: BookmarkNode[], initialStorage: Record<string, unknown> = {}): FakeChrome {
  const tree: BookmarkNode = { id: "0", title: "", children: structuredClone(roots) };
  const store: Record<string, unknown> = structuredClone(initialStorage);
  const storageChanged = fakeEvent();
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
      getTree: async () => [structuredClone(tree)],
      update: async (id: string, changes: { title?: string }) => {
        const node = find(id)!;
        if (changes.title !== undefined) node.title = changes.title;
        bookmarkEvents.onChanged.fire(id, changes);
        return structuredClone(node);
      },
      move: async (id: string, destination: { parentId?: string; index?: number }) => {
        const node = find(id)!;
        const oldParent = find(node.parentId!)!;
        const newParent = destination.parentId ? find(destination.parentId)! : oldParent;
        oldParent.children = oldParent.children!.filter((c) => c.id !== id);
        const index = destination.index ?? newParent.children!.length;
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
  };
}
