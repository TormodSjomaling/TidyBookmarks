# Tidy Bookmarks

A Chrome new-tab-page extension that renders the user's native Chrome bookmarks as a navigable, correctly-nested tree, archive old bookmarks out of view without deleting them.

## Language

**Folder**:
A native Chrome bookmark folder node. Can contain bookmarks and/or nested subfolders to any depth; the extension renders this as a true recursive tree rather than a flat list.
_Avoid_: Directory, group

**Collapsed**:
A per-folder boolean state, stored in extension storage (not in Chrome's bookmark data), set and remembered independently for each folder regardless of its ancestors' state.
_Avoid_: Hidden, closed, archived

**Effective visibility**:
Whether a folder's contents actually render on the new tab page. A folder is effectively hidden if it is itself Collapsed, or if any ancestor folder is Collapsed — even if the folder's own state is expanded. Re-expanding an ancestor restores each descendant to its own remembered Collapsed state, not to expanded.
_Avoid_: Visible/hidden used interchangeably with Collapsed

**Archived**:
A per-folder boolean flag, at any depth in the bookmarks tree, independent of the Folder's ordinary Collapsed state. Archiving a folder immediately sets it Collapsed too; unarchiving immediately expands it again — after that initial transition, Collapsed can still be toggled manually (e.g. to peek inside an Archived folder) without leaving the Archived flag. A folder only counts as visually Archived (dimmed, pushed to the bottom, compact styling) while both Archived and Collapsed are true. Archived folders are pushed to the bottom of their sibling list, ordered most-recently-archived first. When two or more siblings are Archived, they collapse further into a single "N archived" summary row instead of one row each; expanding the summary reveals a chip per Archived folder, and clicking a chip fully unarchives (and expands) that one. A single Archived folder among siblings just renders as its own compact, dimmed row — the summary only kicks in past one.
_Avoid_: Project, flag, active/inactive (there is no separate "Project" tag or "active" concept — Archived is the only state a folder can be given)

**Default bookmark**:
A bookmark that is a direct child of a root container (the bookmarks bar, other bookmarks, or mobile bookmarks) rather than nested inside any user-created Folder — e.g. general-purpose links like google.com or linkedin.com. Rendered above all folders at that level. Subject to the `faviconOnlyDefault` setting, which renders these as favicon-only icons instead of full title cards.
_Avoid_: Root bookmark, loose bookmark
