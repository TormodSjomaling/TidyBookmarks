let folderMeta = {};
let settings = { faviconOnlyDefault: true };
let draggedBookmarkEl = null;
let draggedFolderEl = null;

const ARCHIVE_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="1"></rect><path d="M3 8l1.5-4h15L21 8"></path><line x1="9.5" y1="13" x2="14.5" y2="13"></line></svg>';

const app = document.getElementById("app");
const defaultBookmarksEl = document.getElementById("default-bookmarks");

document.getElementById("options-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
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

function isArchived(meta) {
  return meta.archived && meta.collapsed;
}

function getOrCreateMeta(id) {
  if (!folderMeta[id]) {
    folderMeta[id] = { collapsed: false, archived: false, lastArchivedAt: null };
  }
  return folderMeta[id];
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
  const folders = orderFolders(children.filter(isFolder));
  const bookmarks = children.filter((c) => !isFolder(c));

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

function handleFolderDragStart(e) {
  draggedFolderEl = e.currentTarget.parentElement;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", draggedFolderEl.dataset.folderId);
  draggedFolderEl.classList.add("dragging");
}

function canDropFolderOn(targetHeader) {
  const targetFolder = targetHeader.parentElement;
  return (
    draggedFolderEl &&
    targetFolder !== draggedFolderEl &&
    targetFolder.parentElement === draggedFolderEl.parentElement &&
    targetFolder.dataset.parentId === draggedFolderEl.dataset.parentId
  );
}

function handleFolderDragOver(e) {
  const targetHeader = e.currentTarget;
  if (!canDropFolderOn(targetHeader)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  targetHeader.parentElement.classList.add("drag-over");
}

function handleFolderDragLeave(e) {
  e.currentTarget.parentElement.classList.remove("drag-over");
}

function handleFolderDrop(e) {
  const targetHeader = e.currentTarget;
  const targetFolder = targetHeader.parentElement;
  targetFolder.classList.remove("drag-over");
  if (!canDropFolderOn(targetHeader)) return;
  e.preventDefault();

  const container = targetFolder.parentElement;
  const items = Array.from(container.children).filter((el) => el.classList.contains("folder"));
  const draggedIndex = items.indexOf(draggedFolderEl);
  const targetIndex = items.indexOf(targetFolder);

  if (draggedIndex < targetIndex) {
    container.insertBefore(draggedFolderEl, targetFolder.nextSibling);
  } else {
    container.insertBefore(draggedFolderEl, targetFolder);
  }

  const parentId = draggedFolderEl.dataset.parentId;
  const orderedIds = Array.from(container.children)
    .filter((el) => el.classList.contains("folder") && el.dataset.parentId === parentId)
    .map((el) => el.dataset.folderId);

  orderedIds.forEach((id, index) => {
    chrome.bookmarks.move(id, { index });
  });
}

function handleFolderDragEnd(e) {
  e.currentTarget.parentElement.classList.remove("dragging");
  draggedFolderEl = null;
}

function renderFolder(node) {
  const meta = getMeta(node.id);
  const el = document.createElement("div");
  el.className = "folder";
  el.dataset.folderId = node.id;
  el.dataset.parentId = node.parentId;
  if (meta.collapsed) el.classList.add("collapsed");
  if (isArchived(meta)) el.classList.add("archived");

  const header = document.createElement("div");
  header.className = "folder-header";
  header.addEventListener("click", (e) => {
    if (e.target.closest(".folder-actions")) return;
    toggleCollapsed(node.id);
  });

  if (!isArchived(meta)) {
    header.draggable = true;
    header.addEventListener("dragstart", handleFolderDragStart);
    header.addEventListener("dragover", handleFolderDragOver);
    header.addEventListener("dragleave", handleFolderDragLeave);
    header.addEventListener("drop", handleFolderDrop);
    header.addEventListener("dragend", handleFolderDragEnd);
  }

  const chevron = document.createElement("span");
  chevron.className = "chevron";
  chevron.textContent = "▼";
  header.appendChild(chevron);

  const name = document.createElement("span");
  name.className = "folder-name";
  name.textContent = node.title || "(untitled)";
  header.appendChild(name);

  if (isArchived(meta)) {
    const badge = document.createElement("span");
    badge.className = "folder-badge";
    badge.textContent = "Archived";
    header.appendChild(badge);
  }

  const actions = document.createElement("span");
  actions.className = "folder-actions";

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

function handleBookmarkDragStart(e) {
  draggedBookmarkEl = e.currentTarget;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", draggedBookmarkEl.dataset.bookmarkId);
  draggedBookmarkEl.classList.add("dragging");
}

function canDropOn(target) {
  return (
    draggedBookmarkEl &&
    target !== draggedBookmarkEl &&
    target.parentElement === draggedBookmarkEl.parentElement &&
    target.dataset.parentId === draggedBookmarkEl.dataset.parentId
  );
}

function handleBookmarkDragOver(e) {
  const target = e.currentTarget;
  if (!canDropOn(target)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  target.classList.add("drag-over");
}

function handleBookmarkDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function handleBookmarkDrop(e) {
  const target = e.currentTarget;
  target.classList.remove("drag-over");
  if (!canDropOn(target)) return;
  e.preventDefault();

  const container = target.parentElement;
  const items = Array.from(container.children);
  const draggedIndex = items.indexOf(draggedBookmarkEl);
  const targetIndex = items.indexOf(target);

  if (draggedIndex < targetIndex) {
    container.insertBefore(draggedBookmarkEl, target.nextSibling);
  } else {
    container.insertBefore(draggedBookmarkEl, target);
  }

  const parentId = draggedBookmarkEl.dataset.parentId;
  const orderedIds = Array.from(container.children)
    .filter((el) => el.dataset.parentId === parentId)
    .map((el) => el.dataset.bookmarkId);

  orderedIds.forEach((id, index) => {
    chrome.bookmarks.move(id, { index });
  });
}

function handleBookmarkDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  draggedBookmarkEl = null;
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
    el.draggable = true;

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

  el.addEventListener("dragstart", handleBookmarkDragStart);
  el.addEventListener("dragover", handleBookmarkDragOver);
  el.addEventListener("dragleave", handleBookmarkDragLeave);
  el.addEventListener("drop", handleBookmarkDrop);
  el.addEventListener("dragend", handleBookmarkDragEnd);

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
      rendered = true;

      const folders = orderFolders(root.children.filter(isFolder));
      const bookmarks = root.children.filter((c) => !isFolder(c));

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
      empty.textContent = "No bookmarks yet.";
      app.appendChild(empty);
    }
  });
}

chrome.storage.local.get(["folderMeta", "settings"], (result) => {
  folderMeta = result.folderMeta || {};
  settings = Object.assign({ faviconOnlyDefault: true }, result.settings || {});
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    settings = Object.assign({ faviconOnlyDefault: true }, changes.settings.newValue || {});
    render();
  }
});
