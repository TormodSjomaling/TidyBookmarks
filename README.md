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
- **Drag-and-drop reordering** — reorder bookmarks and folders by dragging them within the same list.
- **Inline rename** — hover any bookmark and click the pencil icon to rename it in place.
- **Dark, minimal UI** — designed to be easy on the eyes and get out of your way.

## Installing (development mode)

This extension isn't yet published to the Chrome Web Store. To use it today:

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Open a new tab.

## Using it

- **Collapse/expand a folder**: click its row.
- **Archive a folder**: hover its row, click the archive (box) icon. Click it again to unarchive.
- **Reorder**: drag a bookmark or folder onto another one in the same list to drop it there.
- **Rename a bookmark**: hover it, click the pencil icon, edit, press Enter (or click away) to save, Escape to cancel.
- **Options**: click the ⚙ icon top-right to toggle whether default (unfoldered) bookmarks show as favicon-only icons or full title cards.

## Known limitations

- Single-device only for now — archive/collapse state is stored locally (`chrome.storage.local`), not synced across machines.
- No adding, deleting, or moving bookmarks between folders from this page yet — use Chrome's native bookmark manager for that; renaming and reordering within a folder are supported here.

## Project docs

- [`CONTEXT.md`](./CONTEXT.md) — glossary of terms used in this codebase (Folder, Collapsed, Archived, Default bookmark).
- [`docs/adr/`](./docs/adr/) — architecture decision records explaining the non-obvious choices (why native Chrome bookmarks instead of a separate store, why collapse state doesn't cascade to children).
- [`PRIVACY.md`](./PRIVACY.md) — privacy policy (short version: nothing leaves your browser).
- [`PUBLISHING.md`](./PUBLISHING.md) — checklist for submitting this to the Chrome Web Store.
