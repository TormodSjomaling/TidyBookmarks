const DEFAULT_SETTINGS = { faviconOnlyDefault: true, theme: "system", density: "comfortable" };

let folderMeta = {};
let settings = Object.assign({}, DEFAULT_SETTINGS);
let draggedUnit = null;
let searchQuery = "";
let searchDebounceTimer = null;

const ARCHIVE_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="1"></rect><path d="M3 8l1.5-4h15L21 8"></path><line x1="9.5" y1="13" x2="14.5" y2="13"></line></svg>';

const app = document.getElementById("app");
const defaultBookmarksEl = document.getElementById("default-bookmarks");
const searchInput = document.getElementById("search-input");

document.getElementById("options-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    searchQuery = searchInput.value.trim().toLowerCase();
    render();
  }, 150);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    clearTimeout(searchDebounceTimer);
    searchInput.value = "";
    searchQuery = "";
    render();
    searchInput.blur();
  }
});

function getMeta(id) {
  return folderMeta[id] || { collapsed: false, archived: false, lastArchivedAt: null };
}

function saveState() {
  chrome.storage.local.set({ folderMeta });
}

function isFolder(node) {
  return node.url === undefined;
}

// Search-aware: while a query is active, folders never count as "archived" for
// rendering purposes (they're forced open and shown plainly) even though the
// underlying meta is untouched — see CONTEXT.md / CLAUDE.md for why.
function isArchived(meta) {
  return Boolean(meta.archived && meta.collapsed && !searchQuery);
}

function getOrCreateMeta(id) {
  if (!folderMeta[id]) {
    folderMeta[id] = { collapsed: false, archived: false, lastArchivedAt: null };
  }
  return folderMeta[id];
}

function matchesText(text, query) {
  return Boolean(text) && text.toLowerCase().includes(query);
}

function nodeMatchesQuery(node, query) {
  if (isFolder(node)) {
    if (matchesText(node.title, query)) return true;
    return (node.children || []).some((child) => nodeMatchesQuery(child, query));
  }
  return matchesText(node.title, query) || matchesText(node.url, query);
}

function visibleChildren(children) {
  if (!searchQuery) return children;
  return children.filter((child) => nodeMatchesQuery(child, searchQuery));
}

function toggleCollapsed(id) {
  const meta = getOrCreateMeta(id);
  meta.collapsed = !meta.collapsed;
  if (meta.archived && meta.collapsed) {
    meta.lastArchivedAt = Date.now();
  }
  saveState();

  if (meta.archived) {
    render();
  } else {
    const el = document.querySelector(`.folder[data-folder-id="${id}"]`);
    if (el) el.classList.toggle("collapsed", meta.collapsed);
  }
}

function toggleArchived(id) {
  const meta = getOrCreateMeta(id);
  meta.archived = !meta.archived;
  if (meta.archived) {
    meta.collapsed = true;
    meta.lastArchivedAt = Date.now();
  } else {
    meta.collapsed = false;
  }
  saveState();
  render();
}

function orderFolders(folders) {
  const archived = [];
  const rest = [];
  for (const folder of folders) {
    const meta = getMeta(folder.id);
    if (isArchived(meta)) {
      archived.push(folder);
    } else {
      rest.push(folder);
    }
  }
  archived.sort(
    (a, b) => (getMeta(b.id).lastArchivedAt || 0) - (getMeta(a.id).lastArchivedAt || 0)
  );
  return [...rest, ...archived];
}

function renderFolderGroup(orderedFolders, container) {
  const archived = [];
  const rest = [];
  for (const folder of orderedFolders) {
    if (isArchived(getMeta(folder.id))) {
      archived.push(folder);
    } else {
      rest.push(folder);
    }
  }

  for (const folder of rest) {
    container.appendChild(renderFolder(folder));
  }

  if (archived.length > 1) {
    container.appendChild(renderArchivedSummary(archived));
  } else {
    for (const folder of archived) {
      container.appendChild(renderFolder(folder));
    }
  }
}

function renderArchivedSummary(folders) {
  const wrapper = document.createElement("div");
  wrapper.className = "archived-summary";

  const header = document.createElement("div");
  header.className = "archived-summary-header";
  header.addEventListener("click", () => wrapper.classList.toggle("expanded"));

  const chevron = document.createElement("span");
  chevron.className = "chevron";
  chevron.textContent = "▼";
  header.appendChild(chevron);

  const label = document.createElement("span");
  label.className = "archived-summary-label";
  label.textContent = `${folders.length} archived`;
  header.appendChild(label);

  wrapper.appendChild(header);

  const chipList = document.createElement("div");
  chipList.className = "archived-chip-list";
  for (const folder of folders) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "archived-chip";
    chip.textContent = folder.title || "(untitled)";
    chip.title = "Unarchive";
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      const meta = getOrCreateMeta(folder.id);
      meta.archived = false;
      meta.collapsed = false;
      saveState();
      render();
    });
    chipList.appendChild(chip);
  }
  wrapper.appendChild(chipList);

  return wrapper;
}

function renderChildren(children, container) {
  const visible = visibleChildren(children);
  const folders = orderFolders(visible.filter(isFolder));
  const bookmarks = visible.filter((c) => !isFolder(c));

  if (bookmarks.length > 0) {
    const grid = document.createElement("div");
    grid.className = "bookmark-grid";
    for (const bookmark of bookmarks) {
      grid.appendChild(renderBookmark(bookmark, false));
    }
    container.appendChild(grid);
  }

  renderFolderGroup(folders, container);
}

function renderFolder(node) {
  const meta = getMeta(node.id);
  const collapsed = meta.collapsed && !searchQuery;
  const archived = isArchived(meta);

  const el = document.createElement("div");
  el.className = "folder";
  el.dataset.folderId = node.id;
  el.dataset.parentId = node.parentId;
  if (collapsed) el.classList.add("collapsed");
  if (archived) el.classList.add("archived");

  const header = document.createElement("div");
  header.className = "folder-header";

  if (!searchQuery) {
    header.addEventListener("click", (e) => {
      if (e.target.closest(".folder-actions")) return;
      toggleCollapsed(node.id);
    });

    wireFolderDropTarget(header, el, {
      isUnit: (candidate) => candidate.classList.contains("folder"),
      getId: (candidate) => candidate.dataset.folderId,
      draggableSource: !archived,
    });
  }

  const chevron = document.createElement("span");
  chevron.className = "chevron";
  chevron.textContent = "▼";
  header.appendChild(chevron);

  const name = document.createElement("span");
  name.className = "folder-name";
  name.textContent = node.title || "(untitled)";
  header.appendChild(name);

  function startFolderRename() {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "folder-edit-input";
    input.value = node.title || "";
    input.addEventListener("click", (e) => e.stopPropagation());

    function commit() {
      const trimmed = input.value.trim();
      if (trimmed && trimmed !== node.title) {
        node.title = trimmed;
        name.textContent = trimmed;
        chrome.bookmarks.update(node.id, { title: trimmed });
      }
      input.replaceWith(name);
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        input.replaceWith(name);
      }
    });
    input.addEventListener("blur", commit);

    name.replaceWith(input);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  if (archived) {
    const badge = document.createElement("span");
    badge.className = "folder-badge";
    badge.textContent = "Archived";
    header.appendChild(badge);
  }

  const actions = document.createElement("span");
  actions.className = "folder-actions";

  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.title = "Rename";
  renameBtn.textContent = "✎";
  renameBtn.addEventListener("click", () => startFolderRename());
  actions.appendChild(renameBtn);

  const archiveBtn = document.createElement("button");
  archiveBtn.type = "button";
  archiveBtn.title = meta.archived ? "Unarchive" : "Archive";
  archiveBtn.innerHTML = ARCHIVE_ICON_SVG;
  if (meta.archived) archiveBtn.classList.add("is-archived");
  archiveBtn.addEventListener("click", () => toggleArchived(node.id));
  actions.appendChild(archiveBtn);

  header.appendChild(actions);
  el.appendChild(header);

  const childrenEl = document.createElement("div");
  childrenEl.className = "folder-children";
  if (node.children && node.children.length > 0) {
    renderChildren(node.children, childrenEl);
  }
  el.appendChild(childrenEl);

  return el;
}

function faviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.toString();
}

function canDropOnto(target) {
  return (
    draggedUnit &&
    target !== draggedUnit &&
    target.parentElement === draggedUnit.parentElement &&
    target.dataset.parentId === draggedUnit.dataset.parentId
  );
}

function canDropInto(folderEl) {
  // Cycle prevention only matters when the dragged item is itself a folder: a
  // folder can't be dropped into itself or into one of its own descendants,
  // since that would disconnect part of the tree. draggedUnit.contains(folderEl)
  // catches both (equality is contains-of-self). Moving a folder to a shallower
  // ancestor, or a bookmark anywhere at all (including its own current parent),
  // is always fine and deliberately left unrestricted.
  return Boolean(draggedUnit && !draggedUnit.contains(folderEl));
}

function getUnitId(unitEl) {
  return unitEl.classList.contains("folder") ? unitEl.dataset.folderId : unitEl.dataset.bookmarkId;
}

function reorderUnits(dropTarget, isUnit, getId) {
  const container = dropTarget.parentElement;
  const items = Array.from(container.children).filter(isUnit);
  const draggedIndex = items.indexOf(draggedUnit);
  const targetIndex = items.indexOf(dropTarget);

  if (draggedIndex < targetIndex) {
    container.insertBefore(draggedUnit, dropTarget.nextSibling);
  } else {
    container.insertBefore(draggedUnit, dropTarget);
  }

  const parentId = draggedUnit.dataset.parentId;
  const orderedIds = Array.from(container.children)
    .filter((candidate) => isUnit(candidate) && candidate.dataset.parentId === parentId)
    .map(getId);

  orderedIds.forEach((id, index) => {
    chrome.bookmarks.move(id, { index });
  });
}

// handleEl is what the user grabs and what receives the drag events; unitEl is the
// element that actually gets reordered in the DOM. They're the same element for
// bookmarks, but for folders handleEl is the header while unitEl is the whole
// .folder (so dragover/drop targeting stays precise even when the folder is expanded).
// Bookmarks are always simple reorder-only drag sources — they're never a valid
// "move into" drop target, so they don't need the band logic below.
function makeDragReorderable(handleEl, unitEl, { isUnit, getId }) {
  handleEl.addEventListener("dragstart", (e) => {
    draggedUnit = unitEl;
    e.dataTransfer.effectAllowed = "move";
    unitEl.classList.add("dragging");
  });

  handleEl.addEventListener("dragover", (e) => {
    if (!canDropOnto(unitEl)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    unitEl.classList.add("drag-over");
  });

  handleEl.addEventListener("dragleave", () => {
    unitEl.classList.remove("drag-over");
  });

  handleEl.addEventListener("drop", (e) => {
    if (!canDropOnto(unitEl)) return;
    e.preventDefault();
    unitEl.classList.remove("drag-over");
    reorderUnits(unitEl, isUnit, getId);
  });

  handleEl.addEventListener("dragend", () => {
    unitEl.classList.remove("dragging");
    draggedUnit = null;
  });
}

// Folder headers are both drag sources (reorder among siblings, when draggableSource
// is true) and drop targets: dragover position within the header decides what a drop
// means. Top/bottom ~25% bands mean "reorder" (only takes effect if canDropOnto's
// sibling check also passes); the middle band means "move into this folder", which
// works regardless of whether target and dragged item are currently siblings, and is
// also offered on archived folders (draggableSource false) so a bookmark can be
// dropped into an archived-but-individually-rendered folder without unarchiving it.
function dragBand(e, el) {
  const rect = el.getBoundingClientRect();
  const ratio = (e.clientY - rect.top) / rect.height;
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "into";
}

function wireFolderDropTarget(header, unitEl, { isUnit, getId, draggableSource }) {
  if (draggableSource) {
    header.draggable = true;
    header.addEventListener("dragstart", (e) => {
      draggedUnit = unitEl;
      e.dataTransfer.effectAllowed = "move";
      unitEl.classList.add("dragging");
    });
    header.addEventListener("dragend", () => {
      unitEl.classList.remove("dragging");
      draggedUnit = null;
    });
  }

  header.addEventListener("dragover", (e) => {
    const band = dragBand(e, header);
    const reorderOk = band !== "into" && canDropOnto(unitEl);
    const intoOk = band === "into" && canDropInto(unitEl);
    if (!reorderOk && !intoOk) {
      unitEl.classList.remove("drag-over", "drag-over-into");
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    unitEl.classList.toggle("drag-over", reorderOk);
    unitEl.classList.toggle("drag-over-into", intoOk);
  });

  header.addEventListener("dragleave", () => {
    unitEl.classList.remove("drag-over", "drag-over-into");
  });

  header.addEventListener("drop", (e) => {
    const band = dragBand(e, header);
    const reorderOk = band !== "into" && canDropOnto(unitEl);
    const intoOk = band === "into" && canDropInto(unitEl);
    unitEl.classList.remove("drag-over", "drag-over-into");
    if (reorderOk) {
      e.preventDefault();
      reorderUnits(unitEl, isUnit, getId);
    } else if (intoOk) {
      e.preventDefault();
      const draggedId = getUnitId(draggedUnit);
      const targetFolderId = unitEl.dataset.folderId;
      chrome.bookmarks.move(draggedId, { parentId: targetFolderId }, () => render());
    }
  });
}

function renderBookmark(node, isDefault) {
  const el = document.createElement("div");
  el.className = "bookmark-item";
  el.dataset.bookmarkId = node.id;
  el.dataset.parentId = node.parentId;

  function showDisplay() {
    const compact = Boolean(isDefault && settings.faviconOnlyDefault);
    el.classList.toggle("bookmark-item--compact", compact);
    el.innerHTML = "";
    el.draggable = !searchQuery;

    const icon = document.createElement("img");
    icon.className = "favicon";
    icon.src = faviconUrl(node.url);
    icon.alt = "";

    const link = document.createElement("a");
    link.href = node.url;
    link.className = "bookmark-link";
    link.title = node.title || node.url;
    link.appendChild(icon);

    if (!compact) {
      const label = document.createElement("span");
      label.className = "bookmark-title";
      label.textContent = node.title || node.url;
      link.appendChild(label);
    }
    el.appendChild(link);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "bookmark-edit-btn";
    editBtn.title = "Rename";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showEdit();
    });
    el.appendChild(editBtn);
  }

  function showEdit() {
    el.classList.remove("bookmark-item--compact");
    el.draggable = false;
    el.innerHTML = "";

    const icon = document.createElement("img");
    icon.className = "favicon";
    icon.src = faviconUrl(node.url);
    icon.alt = "";
    el.appendChild(icon);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "bookmark-edit-input";
    input.value = node.title || "";

    function commit() {
      const trimmed = input.value.trim();
      if (trimmed && trimmed !== node.title) {
        node.title = trimmed;
        chrome.bookmarks.update(node.id, { title: trimmed });
      }
      showDisplay();
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        showDisplay();
      }
    });
    input.addEventListener("blur", commit);
    el.appendChild(input);

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  if (!searchQuery) {
    makeDragReorderable(el, el, {
      isUnit: (candidate) => candidate.classList.contains("bookmark-item"),
      getId: (candidate) => candidate.dataset.bookmarkId,
    });
  }

  showDisplay();
  return el;
}

function render() {
  app.innerHTML = "";
  defaultBookmarksEl.innerHTML = "";

  chrome.bookmarks.getTree((tree) => {
    const roots = tree[0].children || [];
    let rendered = false;
    let hasDefaultBookmarks = false;

    for (const root of roots) {
      if (!root.children || root.children.length === 0) continue;

      const visible = visibleChildren(root.children);
      if (visible.length === 0) continue;
      rendered = true;

      const folders = orderFolders(visible.filter(isFolder));
      const bookmarks = visible.filter((c) => !isFolder(c));

      for (const bookmark of bookmarks) {
        hasDefaultBookmarks = true;
        defaultBookmarksEl.appendChild(renderBookmark(bookmark, true));
      }

      if (folders.length > 0) {
        const container = document.createElement("div");
        renderFolderGroup(folders, container);
        app.appendChild(container);
      }
    }

    defaultBookmarksEl.hidden = !hasDefaultBookmarks;

    if (!rendered) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = searchQuery ? "No matching bookmarks." : "No bookmarks yet.";
      app.appendChild(empty);
    }
  });
}

chrome.storage.local.get(["folderMeta", "settings"], (result) => {
  folderMeta = result.folderMeta || {};
  settings = Object.assign({}, DEFAULT_SETTINGS, result.settings || {});
  applySettings(settings);
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    settings = Object.assign({}, DEFAULT_SETTINGS, changes.settings.newValue || {});
    applySettings(settings);
    render();
  }
});
