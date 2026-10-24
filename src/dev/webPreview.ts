// Runs before the app in `npm run dev:web` (injected by vite.config.ts, never
// part of a production build). Installs the fake chrome API seeded with sample
// bookmarks, and keeps changes in localStorage so they survive a refresh and
// reach other preview tabs (e.g. a theme change in Options shows on the new tab).
import type { BookmarkNode } from "../lib/types";
import { installFakeChrome } from "./fakeChrome";
import { sampleFolderMeta, sampleRoots } from "./sampleBookmarks";

const BOOKMARKS_KEY = "tidy-preview:bookmarks";
const STORAGE_KEY = "tidy-preview:storage";

function load<T>(key: string): T | undefined {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : undefined;
}

const fake = installFakeChrome(
  load<BookmarkNode[]>(BOOKMARKS_KEY) ?? sampleRoots,
  load<Record<string, unknown>>(STORAGE_KEY) ?? { folderMeta: sampleFolderMeta }
);

const saveBookmarks = () => localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(fake.bookmarks));
const saveStorage = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(fake.storage));
saveBookmarks();
saveStorage();

for (const event of [chrome.bookmarks.onChanged, chrome.bookmarks.onMoved, chrome.bookmarks.onRemoved]) {
  (event as chrome.events.Event<() => void>).addListener(saveBookmarks);
}
chrome.storage.onChanged.addListener(saveStorage);

// Another preview tab changed something.
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY && e.newValue) {
    const incoming = JSON.parse(e.newValue) as Record<string, unknown>;
    const changed = Object.fromEntries(
      Object.entries(incoming).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(fake.storage[key]))
    );
    if (Object.keys(changed).length > 0) fake.externalStorageWrite(changed);
  } else if (e.key === BOOKMARKS_KEY && location.pathname.includes("newtab")) {
    location.reload();
  }
});

// Favicons come from a placeholder icon the dev server serves at /_favicon/.
Object.assign(chrome.runtime, {
  getURL: (path: string) => new URL(path, location.origin).href,
  openOptionsPage: async () => {
    window.open("/src/options/options.html", "_blank");
  },
});

// Opening a bookmark from search navigates this tab, or opens another one.
Object.assign(chrome.tabs, {
  update: async ({ url }: { url: string }) => {
    location.href = url;
  },
  create: async ({ url }: { url: string }) => {
    window.open(url, "_blank");
  },
});

// A small badge so the preview is never mistaken for the real extension.
function addBadge() {
  const badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;bottom:12px;right:12px;z-index:9999;display:flex;gap:8px;align-items:center;" +
    "padding:6px 10px;border-radius:8px;font:12px system-ui,sans-serif;" +
    "background:var(--bg-raised);color:var(--text-dim);border:1px solid var(--border)";
  badge.textContent = "Preview · sample data";

  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset";
  reset.style.cssText =
    "font:inherit;cursor:pointer;background:none;color:var(--accent);border:1px solid var(--border);" +
    "border-radius:6px;padding:2px 8px";
  reset.addEventListener("click", () => {
    localStorage.removeItem(BOOKMARKS_KEY);
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  badge.appendChild(reset);
  document.body.appendChild(badge);
}
if (document.body) addBadge();
else document.addEventListener("DOMContentLoaded", addBadge);
