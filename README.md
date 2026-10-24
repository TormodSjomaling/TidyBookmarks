# Tidy Bookmarks

A new-tab bookmark dashboard for people who accumulate a lot of bookmarks and need to keep them organized — built especially for consultants and agency developers who rotate between client projects every few months.

## Why this exists

If you work on a new client project every ~6 months, your bookmarks pile up fast: staging URLs, admin panels, docs, tickets — one folder per client, often several folders deep. The problem isn't a lack of bookmarks, it's that **last year's client is still cluttering today's new-tab page**, and most bookmark managers render nested subfolders as a flat, messy list instead of a real tree.

Tidy Bookmarks fixes both:

- Your bookmarks render as an actual nested tree, so collapsing a folder collapses everything inside it, however deep.
- Any folder can be **archived** with one click — it collapses, dims, and drops to the bottom of the list, out of your way but never deleted.

It reads and writes your real Chrome bookmarks (`chrome://bookmarks`) — nothing is duplicated or migrated into a separate store, and Chrome's own sync keeps working normally.

## Features

- **Real nested folder tree** — subfolders render as actual children of their parent, not a flat list.
- **Per-folder collapse memory** — every folder remembers whether it's open or closed, independently of its parent.
- **Archive** — click the archive icon on any folder to collapse it, dim it, and push it to the bottom of its list. Click again to bring it back.
- **Auto-grouping** — once two or more folders in the same list are archived, they collapse into a single "N archived" summary row instead of taking up a row each. Expand it to see a chip per archived folder; click a chip to bring that one back.
- **Default bookmarks row** — bookmarks that aren't inside any folder (e.g. `google.com`, `linkedin.com`) show in a compact row at the top, favicon-only by default (configurable in Options).
- **Search** — type in the search box to filter bookmarks and folders by title or URL as you type, including inside collapsed and archived folders.
- **Drag-and-drop** — drag a bookmark or folder onto another in the same list to reorder, or drop it onto the middle of a different folder to move it inside that folder.
- **Edit bookmarks** — hover a bookmark and click the pencil icon to change its name or URL, or delete it, in a small popover.
- **Inline folder rename** — hover a folder and click the pencil icon to rename it in place.
- **Dark, light, or system theme** and an optional **compact density** mode, both in Options.

## Installing

Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/fdcjafdcbdlcdicofiolhfgclifbijoo), then open a new tab.

### Development

Requires Node 24 (see `.nvmrc`).

**Quickest: browser preview.** `npm run dev:web` opens the new-tab page at localhost with sample bookmarks, and updates instantly as you edit code. Changes you make (archiving, renaming, dragging) are kept until you click **Reset** in the corner badge. It uses fake data and generated stand-in favicons, so check Chrome-specific behavior in the real extension before releasing.

**Real extension:**

1. `npm install`, then `npm run dev`. This builds into `dist/` and rebuilds whenever you save.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the **`dist/`** folder (not the project folder).
4. Open a new tab. After a rebuild, click the reload icon on the extension's card.

`npm test` runs the test suite; `npm run build` makes a production build.

## Using it

- **Collapse/expand a folder**: click its row.
- **Archive a folder**: hover its row, click the archive (box) icon. Click it again to unarchive.
- **Search**: type in the search box in the header. Matching folders force open (without changing their saved collapsed/archived state) and everything else is hidden; clear the box or press Escape to go back to normal. Dragging is disabled while a search is active.
- **Reorder**: drag a bookmark or folder and drop it near the top or bottom edge of another one in the same list.
- **Move into a folder**: drag a bookmark or folder and drop it on the middle of a different folder's row to move it inside.
- **Edit a bookmark**: hover it and click the pencil icon. Change the name or URL and press Enter or **Save**; Escape, **Cancel** or clicking outside closes without saving. A URL without `https://` gets it added. **Delete** asks you to confirm, then removes the bookmark from Chrome itself (not just this page).
- **Rename a folder**: hover it, click the pencil icon, edit, press Enter (or click away) to save, Escape to cancel.
- **Options**: click the ⚙ icon top-right to toggle whether default (unfoldered) bookmarks show as favicon-only icons or full title cards, choose a theme (System/Dark/Light), and turn on compact density.

## Known limitations

- Single-device only for now — archive/collapse state and settings are stored locally (`chrome.storage.local`), not synced across machines.
- No adding bookmarks or folders, or deleting folders, from this page yet — use Chrome's native bookmark manager for that. Editing and deleting bookmarks, renaming folders, reordering, and moving items between folders are all supported here.
- Moving something into a folder always appends it at the end of that folder's contents — you can't choose a specific position within the target folder in one drag.
- Folders collapsed into the "N archived" summary row aren't drop targets — unarchive or expand one first if you want to drag something into it.

## Project docs

- [`CONTEXT.md`](./CONTEXT.md) — glossary of terms used in this codebase (Folder, Collapsed, Archived, Default bookmark).
- [`docs/adr/`](./docs/adr/) — architecture decision records explaining the non-obvious choices (why native Chrome bookmarks instead of a separate store, why collapse state doesn't cascade to children).
- [`PRIVACY.md`](./PRIVACY.md) — privacy policy (short version: nothing leaves your browser).
- [`PUBLISHING.md`](./PUBLISHING.md) — checklist for submitting this to the Chrome Web Store.
