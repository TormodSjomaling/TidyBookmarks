# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tidy Bookmarks is a Manifest V3 Chrome extension that overrides the new-tab page with a bookmark dashboard. It's built with React 19 + TypeScript, bundled by Vite into `dist/`, which is what Chrome loads. See `README.md` for the full feature list and user-facing rationale.

## Commands

Requires Node 24 (`.nvmrc`).

- **Browser preview**: `npm run dev:web` serves the pages at localhost with hot reload, backed by the fake `chrome` API (`src/dev/fakeChrome.ts`) and sample bookmarks (`src/dev/sampleBookmarks.ts`). `src/dev/webPreview.ts` is injected only in this mode by the `webPreview` plugin in `vite.config.ts`; it persists to `localStorage`, syncs storage across preview tabs, and the dev server answers `/_favicon/` with generated per-site icons (`src/dev/placeholderFavicon.ts`). None of `src/dev/` ships in production builds.
- **Dev loop (real extension)**: `npm run dev` (Vite build in watch mode into `dist/`). Load `dist/` via `chrome://extensions` → Developer mode → "Load unpacked". After a rebuild, click the reload icon on the extension's card, then refresh the new tab (or Options tab).
- **Test**: `npm test` (Vitest, jsdom). `npm run test:watch` for watch mode. A single file: `npx vitest run src/lib/tree.test.ts`.
- **Typecheck**: `npm run typecheck` (`tsc`, strict, no emit).
- **Production build**: `npm run build` (typecheck + `vite build`). `npm run package` zips `dist/` into `tidy-bookmarks-<version>.zip`.
- **Release**: `npm version patch|minor|major` then `git push --follow-tags`. The `v*` tag triggers `.github/workflows/release.yml`, which tests, builds, uploads and publishes to the Chrome Web Store and creates a GitHub Release. See `PUBLISHING.md` → "Releasing updates". `package.json` is the single source of truth for the version: the Vite config stamps it into `dist/manifest.json`, so don't bump `manifest.json`'s `version` by hand.

Tests run against a fake `chrome` API (`src/dev/fakeChrome.ts`, shared with the browser preview), not a real browser. For anything touching real Chrome behavior (favicons, drag-and-drop feel, extension CSP), also reload the unpacked build and click through it.

## Layout

- `src/lib/` — pure, Chrome-free logic with unit tests next to it. **The domain rules live here**; components only call into them.
  - `types.ts` — `BookmarkNode`, `FolderMeta`/`FolderMetaMap`, `Settings`.
  - `tree.ts` — `isArchived`, search (`nodeMatchesQuery`, `visibleChildren`), sibling ordering/grouping (`orderFolders`, `groupFolders`), parent lookup (`buildParentMap`, `isSelfOrDescendant`).
  - `folderMeta.ts` — state transitions: `toggleCollapsed`, `toggleArchived`, `unarchive`. Each returns a new map.
  - `dnd.ts` — drop guards (`canDropOnto`, `canDropInto`), `dragBand`, `moveIndex`.
- `src/newtab/` — the new-tab page. `App.tsx` (header, search, root sections), `Folder.tsx` (`FolderList`, `Folder`, `ArchivedSummary`, `BookmarkGrid`), `Bookmark.tsx`, `BookmarkEditor.tsx` (edit/delete popover), `InlineEdit.tsx` (folder rename), `hooks.ts` (Chrome data hooks), `drag.ts` (drag-and-drop hooks), `dashboard.ts` (shared context).
- `src/options/` — the Options page (`Options.tsx`), a full tab (`options_ui.open_in_tab: true`) opened from the ⚙ button via `chrome.runtime.openOptionsPage()`.
- `src/shared/` — used by both pages: `theme.css` and `settings.ts`.
- `vite.config.ts` — two HTML entries; HTML keeps its source path in `dist/` (`dist/src/newtab/newtab.html`) so `manifest.json`'s paths stay valid. A small plugin emits `manifest.json` (version stamped) and `icons/*.png`.
- No background service worker — nothing here needs to run outside the two pages.

## Architecture

### No source-of-truth duplication (see `docs/adr/0001-*.md`)
Bookmarks are never copied into extension storage. `useBookmarkTree()` (`src/newtab/hooks.ts`) reads the live tree via `chrome.bookmarks.getTree()` and re-reads it whenever a `chrome.bookmarks.on*` event fires — from our own moves/renames, another tab, or Chrome's bookmark manager. Bursts of events (a multi-item reorder) coalesce into one re-read. Mutations therefore just call `chrome.bookmarks.*` and let the events refresh the tree; they don't update React state themselves.

The *only* thing the extension persists itself (in `chrome.storage.local`) is:
- `folderMeta`: an object keyed by bookmark node id → `{ collapsed, archived, lastArchivedAt }`
- `settings`: `{ faviconOnlyDefault, theme, density }`

**Don't change these shapes or keys without a migration**: existing users' stored state from the vanilla-JS 1.x releases must keep loading.

Folder identity throughout is the bookmark node's own `id`. `data-folder-id`, `data-bookmark-id` and `data-parent-id` attributes on rendered elements mirror real Chrome ids (handy for debugging and tests).

### `Collapsed` vs `Archived` are separate flags (see `docs/adr/0002-*.md` and `CONTEXT.md`)
- `collapsed` is a plain per-folder open/closed state, remembered independently per folder. Collapsing a parent hides its subtree (CSS `display: none`) but never touches children's own stored `collapsed`.
- `archived` is a separate flag. `toggleArchived` also forces `collapsed` to match — archiving collapses, unarchiving expands — but after that the two are independent again (you can re-expand an archived folder to peek inside without unarchiving it). Re-collapsing an archived folder bumps `lastArchivedAt`, moving it back to the top of the archived group.
- `isArchived(meta, query)` = `archived && collapsed && !query`. This combined check drives dimmed styling, bottom-of-list sorting, and summary grouping. Read `CONTEXT.md`'s "Archived" entry before changing any of this — the two-flag split is intentional.

### Folder state across open tabs (`useFolderMeta`)
Every open new-tab page writes the whole `folderMeta` object, so each page adopts other pages' writes from `storage.onChanged`. Otherwise a stale tab's next write would silently undo another tab's changes. A page's own writes echo back through `onChanged` too; those match its in-memory state and are skipped.

### Search
The search box is debounced (~150ms) into a normalized `query` in `App`, shared via `DashboardContext`. Filtering happens in `visibleChildren(children, query)`, called wherever children are split into folders/bookmarks, so it applies recursively. `nodeMatchesQuery` matches a bookmark by title/URL substring, or a folder by its own title *or* any descendant — so a folder stays visible if something deep inside it matches.

While `query` is non-empty:
- `isArchived` returns `false`, so archived folders render plainly (no dimming, no summary grouping) — the same as manually re-expanding an archived folder.
- `Folder` renders `collapsed = meta.collapsed && !query`: matching folders force open without mutating `folderMeta`, so clearing the search restores the exact prior view.
- Collapse-on-click and all drag-and-drop wiring are omitted. Search shows a partial tree, and reordering against a partial index would be unsafe.

### Drag-and-drop
The dragged item lives in `DashboardContext.dragged` (a ref, not state — dragover handlers read it synchronously). Every source/target is a `DragUnit { id, parentId, index, containerKey, folder }`, where `index` is the node's real position among all its parent's children and `containerKey` names the rendered list it sits in.
- **Bookmark reorder** (`canDropOnto`) requires the same `containerKey` *and* the same real `parentId`. The parent check exists because the header's default-bookmarks row combines loose bookmarks from several Chrome roots (bookmarks bar + other bookmarks) into one list. `applyReorder` (`drag.ts`) is a single `chrome.bookmarks.move` to the target's `parentId` and the index from `moveIndex`, so it also handles moving to another parent. Chrome counts a same-parent index against the list *before* the node is removed (the fake mirrors this), so "before target" is `target.index` and "after" is `target.index + 1`. Using real indexes means folders and loose bookmarks sharing a parent (the bookmarks bar) keep their relative order in Chrome.
- **Bookmarks** are reorder-only sources and targets (`useDragSource`/`useReorderTarget`). The pointer's half of the target tile picks the place (left → before, right → after), shown as a vertical `.drop-before`/`.drop-after` line centred in the grid gap (`--tile-gap`).
- Targets accept `dragenter` as well as `dragover` (Chrome uses the dragenter answer if the mouse is released right after entering), and `dragleave` into the target's own children (a tile's favicon, a folder's contents) is ignored, so the line doesn't flicker or drop out at child edges.
- **Folders**: the whole `.folder` element (header and contents) is the drop target. A dragged folder can go before/after *any* other folder (`canDropBeside`: any level, any root, just never inside itself), landing in that folder's parent. That's how a subfolder moves up a level or between the bookmarks bar and Other bookmarks. The header's top 30% (`dragBand`) drops before, the middle **moves into** (`canDropInto`, which refuses dropping a folder into itself or a descendant, via the parent map), and anything below drops after: the contents of an open folder, or the bottom 30% of a collapsed or empty one's header (an open folder's header bottom means "into"). Dropping after via contents lets you drag past a long open folder without aiming for a thin strip; it also means a subfolder dropped on its parent's contents moves out to just after the parent. Over the dragged folder's own element nothing happens (it claims the event so ancestors don't offer "after"). Bookmarks can only move into a folder, from anywhere on the header. Move-into appends at the end of the target. `.drop-before`/`.drop-after` draw an insertion line.
- Because folders nest, drag events bubble through every ancestor folder. The innermost target that accepts an event `claim`s it (`drag.ts`, a `WeakSet` of native events) and ancestors stand down, so an open parent doesn't also show "after" while a child shows "into".
- Archived folders aren't draggable (they're algorithmically sorted, so a manual position would be overwritten) but do accept move-into drops. Folders folded into the `.archived-summary` row aren't drop targets at all.

### Rendering and flicker
Components are keyed by bookmark id, so a tree re-read or state change only patches what changed — favicon `<img>`s keep their `src` and aren't refetched. Collapsed folders still render their children (hidden by CSS), which keeps descendants' component state and favicons around. Edits show the new title/URL immediately (`pending`/`pendingTitle`) until the re-read tree catches up.

### Editing bookmarks (`BookmarkEditor.tsx`)
The ✎ button on a bookmark opens a native popover (`popover="auto"`) for name, URL and delete, so Escape and clicking outside close it for free. It is portalled into `<body>`, so the tile's `draggable` doesn't hijack text selection in its inputs, and CSS anchor positioning places it under the tile carrying `.bookmark-item--editing` (`anchor-name`), flipping at viewport edges. While open, ✎ becomes the popover's native invoker (`popoverTarget`), so clicking it again closes it instead of light-dismissing and reopening. The opening click calls `preventDefault()`, because React re-renders mid-click and the newly added `popoverTarget` would otherwise immediately hide the popover. `normalizeUrl` adds `https://` to bare domains (as the address bar does) and rejects unparseable input before calling `chrome.bookmarks.update`. Delete is a two-step confirm, then `chrome.bookmarks.remove` (removes it from Chrome, not just the page).

Folders still rename inline with `InlineEdit`.

jsdom has no Popover API; `src/test/setup.ts` fills in `showPopover`/`hidePopover` for tests.

`InlineEdit` guards against Chrome firing `blur` on a focused input as it's removed: without the guard, Escape would still commit the edit.

### Folder grouping/sorting (`orderFolders`, `groupFolders`)
Within any set of sibling folders: non-archived folders render first in native order; archived folders sort to the end, most recently archived first. Two or more archived siblings fold into one `.archived-summary` row with a chip per folder (clicking a chip runs `unarchive`); a single archived sibling renders as its own compact row. This runs independently at every folder level.

### Shared theme/density (`src/shared/`)
`theme.css` defines the CSS custom properties both pages use (`--bg`, `--text`, `--accent`, spacing vars `--card-padding`/`--row-gap`/`--folder-header-padding`/`--folder-indent`) in three layers: a `:root` dark default, a `prefers-color-scheme: light` override (used for `theme: "system"`, which sets no attribute, so it follows the OS live), and `:root[data-theme="dark"|"light"]` overrides that win regardless of OS. `:root[data-density="compact"]` overrides the spacing vars. `useSettings()` (`settings.ts`) loads settings, follows `storage.onChanged`, and calls `applySettings` to set those attributes on `<html>`, so a change in Options shows on an already-open new tab immediately. Each page imports `theme.css` before its own stylesheet.

Page CSS (`newtab.css`, `options.css`) is plain global CSS keyed on the class names and ids the components render. Keep those names in sync when changing markup.

### Favicons
Fetched via Chrome's `chrome-extension://<id>/_favicon/?pageUrl=...` endpoint (`faviconUrl` in `dashboard.ts`, requires the `favicon` permission), never an external service.

## Docs in this repo

- `README.md` — user-facing feature list, install and development instructions.
- `CONTEXT.md` — glossary of domain terms (Folder, Collapsed, Effective visibility, Archived, Default bookmark). Read it before renaming or restructuring the state model.
- `docs/adr/` — architecture decision records: why bookmarks aren't duplicated into storage, and why collapse state is per-folder rather than cascading.
- `PRIVACY.md` / `PUBLISHING.md` — Chrome Web Store listing details and the release process.
