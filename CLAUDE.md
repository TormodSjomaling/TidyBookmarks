# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tidy Bookmarks is a Manifest V3 Chrome extension that overrides the new-tab page with a bookmark dashboard. It has no build step, no bundler, and no test suite — it's plain HTML/CSS/JS loaded directly by Chrome. See `README.md` for the full feature list and user-facing rationale.

## Commands

There is no package.json, build step, or test runner. Development loop:

- **Syntax-check JS after edits**: `node --check src/newtab/newtab.js` / `node --check src/options/options.js`
- **Validate manifest.json**: `python3 -c "import json; json.load(open('manifest.json'))"`
- **Load/reload in Chrome**: `chrome://extensions` → enable Developer mode → "Load unpacked" → select this folder. After edits, click the reload icon on the extension's card, then open/refresh a new tab (or the Options tab) to see changes.
- There is no automated test suite. Verifying a change means reloading the unpacked extension and clicking through it manually.

## Architecture

### No source-of-truth duplication (see `docs/adr/0001-*.md`)
Bookmarks are never copied into extension storage. `src/newtab/newtab.js` always reads the live tree via `chrome.bookmarks.getTree()` and renders it directly. The *only* thing the extension persists itself (in `chrome.storage.local`) is:
- `folderMeta`: an object keyed by bookmark node id → `{ collapsed, archived, lastArchivedAt }`
- `settings`: `{ faviconOnlyDefault }`, edited from `src/options/options.html`/`options.js` and picked up live via `chrome.storage.onChanged`

Because of this, folder identity throughout the code is the bookmark node's own `id` (`node.id`), not anything the extension assigns — `data-folder-id`, `data-bookmark-id`, and `data-parent-id` attributes on rendered elements all mirror real Chrome bookmark ids so DOM elements can be mapped back to `chrome.bookmarks.*` calls.

### `Collapsed` vs `Archived` are separate flags (see `docs/adr/0002-*.md` and `CONTEXT.md`)
- `collapsed` is a plain per-folder open/closed state, remembered independently per folder regardless of what its ancestors are doing (`isArchived`/rendering never cascades collapse state onto children — collapsing a parent just stops its subtree from rendering, it doesn't touch children's own stored `collapsed` value).
- `archived` is a separate flag. Toggling it (`toggleArchived`) also forces `collapsed` to match in the same call — archiving collapses immediately, unarchiving expands immediately — but after that initial transition the two are independent again (you can manually re-expand an archived folder to peek inside without unarchiving it).
- `isArchived(meta)` = `archived && collapsed`. This combined check is what actually drives dimmed styling, bottom-of-list sorting, and the archived-summary grouping — read `CONTEXT.md`'s "Archived" entry before changing any of this, the two-flag split is intentional, not incidental.

### Rendering: full rebuild vs. targeted DOM mutation
`render()` is a full teardown-and-rebuild from `chrome.bookmarks.getTree()` (clears `#app` and `#default-bookmarks`, re-walks the whole tree). It's called after anything that can reorder or restyle siblings (archiving, un-archiving, drag-and-drop). Two interactions deliberately bypass it to avoid visible flicker (re-fetching every favicon on every click):
- **Collapsing/expanding a plain (non-archived) folder** (`toggleCollapsed`): toggles the `.collapsed` class directly on the already-rendered element via `document.querySelector('.folder[data-folder-id="..."]')`, no re-render.
- **Bookmark rename** (`renderBookmark`'s `showDisplay`/`showEdit` closures): swaps a single bookmark card's own children in place between "display" and "edit" mode, never touches the rest of the DOM.

If you add a new interaction, decide up front which category it falls into — archived-folder toggles fall back to a full `render()` because their position in the sibling order can change.

### Folder grouping/sorting (`orderFolders`, `renderFolderGroup`, `renderArchivedSummary`)
Within any set of sibling folders: non-archived folders render first in native order; archived folders sort to the end, most-recently-archived (`lastArchivedAt`) first. If 2+ siblings are archived, they collapse into a single `.archived-summary` row with a chip per folder instead of one row each — this only kicks in past a single archived sibling. This logic runs independently at every folder level (folders can be archived at any depth), not just at the top level.

### Drag-and-drop scoping
Bookmark and folder drag-and-drop share one implementation: `makeDragReorderable(handleEl, unitEl, { isUnit, getId })`, called once per rendered bookmark/folder. `handleEl` is what receives the drag events and `unitEl` is what actually gets moved in the DOM — for bookmarks they're the same element, but for folders `handleEl` is the header while `unitEl` is the whole `.folder` (so dragover/drop targeting stays precise even when the folder is expanded with content inside it). Reordering persists via `chrome.bookmarks.move(id, { index })` in `reorderUnits`, computing the new index only among elements sharing both the same DOM container *and* the same real `data-parent-id` (checked in `canDropOnto`). The `data-parent-id` check specifically exists because `#default-bookmarks` in the header combines loose bookmarks from multiple real Chrome roots (bookmarks bar + other bookmarks) into one visual row — without that check, dragging one could silently miscompute indices against a different parent's children. Archived folders are excluded from drag-and-drop entirely (they're algorithmically sorted, so a manual position would just be overwritten on the next render).

### Extension surfaces
- `src/newtab/` (`newtab.html`/`newtab.js`/`newtab.css`) — the new-tab override page, all the logic above lives here.
- `src/options/` (`options.html`/`options.js`/`options.css`) — a separate full-tab settings page (`options_ui.open_in_tab: true`), reached via the ⚙ button in the header (`chrome.runtime.openOptionsPage()`) since there's no toolbar action/popup. Currently exposes one setting: `faviconOnlyDefault`.
- No background service worker — nothing here needs to run outside the two page contexts above.
- Favicons are fetched via the special `chrome-extension://<id>/_favicon/?pageUrl=...` endpoint (requires the `favicon` permission), not any external service.

## Docs in this repo

- `README.md` — user-facing feature list and install/usage instructions.
- `CONTEXT.md` — glossary of this codebase's domain terms (Folder, Collapsed, Effective visibility, Archived, Default bookmark). Read this before renaming or restructuring any of the state model above.
- `docs/adr/` — architecture decision records; currently covers why bookmarks aren't duplicated into extension storage, and why collapse state is per-folder rather than cascading.
- `PRIVACY.md` / `PUBLISHING.md` — Chrome Web Store submission prep (not relevant to day-to-day code changes).
