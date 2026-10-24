# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tidy Bookmarks is a Manifest V3 Chrome extension that overrides the new-tab page with a bookmark dashboard. It has no build step, no bundler, and no test suite — it's plain HTML/CSS/JS loaded directly by Chrome. See `README.md` for the full feature list and user-facing rationale.

## Commands

There is no test runner. `package.json` exists only for the build/release tooling — the extension itself still runs straight from the source folder. Development loop:

- **Build a release bundle**: `npm run build` (copies runtime files into `dist/` and stamps `package.json`'s `version` into `dist/manifest.json`), then `npm run package` (zips `dist/` into `tidy-bookmarks-<version>.zip`). `package.json` is the single source of truth for the version; don't bump `manifest.json`'s `version` by hand.
- **Release**: `npm version patch|minor|major` then `git push --follow-tags`. The `v*` tag triggers `.github/workflows/release.yml`, which builds, uploads and publishes to the Chrome Web Store and creates a GitHub Release. See `PUBLISHING.md` → "Releasing updates".
- **Syntax-check JS after edits**: `node --check src/newtab/newtab.js` / `node --check src/options/options.js`
- **Validate manifest.json**: `python3 -c "import json; json.load(open('manifest.json'))"`
- **Load/reload in Chrome**: `chrome://extensions` → enable Developer mode → "Load unpacked" → select this folder. After edits, click the reload icon on the extension's card, then open/refresh a new tab (or the Options tab) to see changes.
- There is no automated test suite. Verifying a change means reloading the unpacked extension and clicking through it manually.

## Architecture

### No source-of-truth duplication (see `docs/adr/0001-*.md`)
Bookmarks are never copied into extension storage. `src/newtab/newtab.js` always reads the live tree via `chrome.bookmarks.getTree()` and renders it directly. The *only* thing the extension persists itself (in `chrome.storage.local`) is:
- `folderMeta`: an object keyed by bookmark node id → `{ collapsed, archived, lastArchivedAt }`
- `settings`: `{ faviconOnlyDefault, theme, density }`, edited from `src/options/options.html`/`options.js` and picked up live via `chrome.storage.onChanged`

Because of this, folder identity throughout the code is the bookmark node's own `id` (`node.id`), not anything the extension assigns — `data-folder-id`, `data-bookmark-id`, and `data-parent-id` attributes on rendered elements all mirror real Chrome bookmark ids so DOM elements can be mapped back to `chrome.bookmarks.*` calls.

### `Collapsed` vs `Archived` are separate flags (see `docs/adr/0002-*.md` and `CONTEXT.md`)
- `collapsed` is a plain per-folder open/closed state, remembered independently per folder regardless of what its ancestors are doing (`isArchived`/rendering never cascades collapse state onto children — collapsing a parent just stops its subtree from rendering, it doesn't touch children's own stored `collapsed` value).
- `archived` is a separate flag. Toggling it (`toggleArchived`) also forces `collapsed` to match in the same call — archiving collapses immediately, unarchiving expands immediately — but after that initial transition the two are independent again (you can manually re-expand an archived folder to peek inside without unarchiving it).
- `isArchived(meta)` = `archived && collapsed`. This combined check is what actually drives dimmed styling, bottom-of-list sorting, and the archived-summary grouping — read `CONTEXT.md`'s "Archived" entry before changing any of this, the two-flag split is intentional, not incidental.

### Rendering: full rebuild vs. targeted DOM mutation
`render()` is a full teardown-and-rebuild from `chrome.bookmarks.getTree()` (clears `#app` and `#default-bookmarks`, re-walks the whole tree). It's called after anything that can reorder or restyle siblings (archiving, un-archiving, drag-and-drop reordering, moving an item into a different folder). Two interactions deliberately bypass it to avoid visible flicker (re-fetching every favicon on every click):
- **Collapsing/expanding a plain (non-archived) folder** (`toggleCollapsed`): toggles the `.collapsed` class directly on the already-rendered element via `document.querySelector('.folder[data-folder-id="..."]')`, no re-render.
- **Bookmark or folder rename** (`renderBookmark`'s `showDisplay`/`showEdit` closures; `renderFolder`'s `startFolderRename`): swaps a single title's display element for an edit `<input>` in place (and back), never touches the rest of the DOM.

If you add a new interaction, decide up front which category it falls into — archived-folder toggles and cross-folder moves fall back to a full `render()` because they change sibling order or parentage.

### Search/filter (`searchQuery`)
`searchQuery` is a module-level string (same pattern as `draggedUnit`), set from `#search-input` with a ~150ms debounce before calling `render()` — avoids re-fetching every favicon per keystroke. Filtering is applied once, centrally, in `visibleChildren(children)`, called everywhere a children array is split into folders/bookmarks (`render()` for root-level children, `renderChildren()` for everything nested) — this is what makes filtering apply recursively without threading a query parameter through every render function. `nodeMatchesQuery(node, query)` matches a bookmark by title/URL substring, or a folder by its own title *or* any descendant matching (recursively) — so a folder stays visible if something inside it matches, even many levels down.

While `searchQuery` is non-empty:
- `isArchived(meta)` always returns `false` (it ANDs in `!searchQuery`), so archived folders render plainly — no dimming, no compact header styling, no summary-row grouping — exactly like manually re-expanding an archived folder already does outside of search (see `CONTEXT.md`'s "Archived" entry; this reuses that existing behavior rather than adding a special case).
- `renderFolder` computes `collapsed = meta.collapsed && !searchQuery`, so matching folders force open visually without ever mutating `folderMeta` — clearing the search restores the exact prior view.
- The folder header's collapse-click listener and all drag-and-drop wiring are skipped entirely (`if (!searchQuery) { ... }`) — search shows a filtered, partial tree, and reordering/moving against a partial index would be unsafe, so dragging is simply unavailable until the query is cleared.

### Drag-and-drop: reorder vs. move-into
Bookmarks are simple reorder-only drag sources (`makeDragReorderable`, wired in `renderBookmark`) — they're never a valid drop target for other items. Folder headers are richer: `wireFolderDropTarget` (in `renderFolder`) makes a header both a drag source (when `draggableSource` — i.e. not archived — and not searching) and a drop target that branches on where in the header the pointer is (`dragBand`, via `getBoundingClientRect()`):
- Top/bottom ~25% of the header → **reorder**, using the existing `canDropOnto`/`reorderUnits` sibling-only logic (unchanged from before this feature — requires the same DOM `parentElement` *and* the same `data-parent-id`).
- Middle ~50% → **move into this folder** (`canDropInto`: valid unless the target is the dragged item itself or a DOM descendant of it — DOM folder nesting mirrors the real bookmark tree, so `draggedUnit.contains(folderEl)` is a correct, cheap cycle check; it only ever matters when the dragged item is a folder, since a bookmark element never contains anything). Calls `chrome.bookmarks.move(id, { parentId })` (index omitted → appended at the end) and always does a full `render()` on completion, since parentage changed.

Archived (but individually-rendered, not grouped) folders accept "move into" drops even though `draggableSource` is false for them — they can be a destination without being draggable themselves. Folders collapsed into the `.archived-summary` chip row are not drop targets at all; there's no per-folder header element to attach the listeners to once grouped.

### Shared theme/density (`src/shared/`)
`src/shared/theme.css` and `theme.js` are loaded by *both* `newtab.html` and `options.html`, before each page's own stylesheet/script — the first cross-page-shared files in the project (previously each page's CSS/JS was fully independent, even duplicating the same hardcoded color values). `theme.css` defines the CSS custom properties both pages style with (`--bg`, `--text`, `--accent`, plus the spacing vars `--card-padding`/`--row-gap`/`--folder-header-padding`/`--folder-indent`), with three layers: a `:root` dark default, a `@media (prefers-color-scheme: light)` override (for `settings.theme === "system"`, which sets no attribute and lets this be the only thing deciding light vs. dark — including live, if the OS setting changes while a page is open), and `:root[data-theme="dark"|"light"]` overrides that win regardless of OS preference. `:root[data-density="compact"]` overrides just the spacing vars. `theme.js`'s one function, `applySettings(settings)`, sets/clears those two attributes on `document.documentElement` and is called from both `newtab.js` and `options.js` on load and inside their `storage.onChanged` listeners, so a theme/density change made in Options reflects on an already-open new-tab page immediately.

### Folder grouping/sorting (`orderFolders`, `renderFolderGroup`, `renderArchivedSummary`)
Within any set of sibling folders: non-archived folders render first in native order; archived folders sort to the end, most-recently-archived (`lastArchivedAt`) first. If 2+ siblings are archived, they collapse into a single `.archived-summary` row with a chip per folder instead of one row each — this only kicks in past a single archived sibling. This logic runs independently at every folder level (folders can be archived at any depth), not just at the top level.

### Drag-and-drop scoping
`canDropOnto` (the sibling-reorder guard, shared by bookmark and folder reordering) requires both the same DOM container *and* the same real `data-parent-id` before `reorderUnits` computes a new index via `chrome.bookmarks.move(id, { index })`. The `data-parent-id` check specifically exists because `#default-bookmarks` in the header combines loose bookmarks from multiple real Chrome roots (bookmarks bar + other bookmarks) into one visual row — without that check, dragging one could silently miscompute indices against a different parent's children. Archived folders are excluded from being reordered themselves (`draggableSource` is false for them in `wireFolderDropTarget`) — they're algorithmically sorted, so a manual position would just be overwritten on the next render — but they *can* still be a "move into" drop target; see the drag-and-drop section above.

### Extension surfaces
- `src/newtab/` (`newtab.html`/`newtab.js`/`newtab.css`) — the new-tab override page, all the logic above lives here.
- `src/options/` (`options.html`/`options.js`/`options.css`) — a separate full-tab settings page (`options_ui.open_in_tab: true`), reached via the ⚙ button in the header (`chrome.runtime.openOptionsPage()`) since there's no toolbar action/popup. Exposes `faviconOnlyDefault`, `theme` (System/Dark/Light), and `density` (comfortable/compact).
- `src/shared/` (`theme.css`/`theme.js`) — loaded by both pages above; see the shared theme/density section above.
- No background service worker — nothing here needs to run outside the two page contexts above.
- Favicons are fetched via the special `chrome-extension://<id>/_favicon/?pageUrl=...` endpoint (requires the `favicon` permission), not any external service.

## Docs in this repo

- `README.md` — user-facing feature list and install/usage instructions.
- `CONTEXT.md` — glossary of this codebase's domain terms (Folder, Collapsed, Effective visibility, Archived, Default bookmark). Read this before renaming or restructuring any of the state model above.
- `docs/adr/` — architecture decision records; currently covers why bookmarks aren't duplicated into extension storage, and why collapse state is per-folder rather than cascading.
- `PRIVACY.md` / `PUBLISHING.md` — Chrome Web Store submission prep (not relevant to day-to-day code changes).
