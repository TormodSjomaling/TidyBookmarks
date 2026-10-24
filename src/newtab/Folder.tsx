import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { canDropBeside, canDropInto, dragBand, type DragBand } from "../lib/dnd";
import { toggleArchived, toggleCollapsed, unarchive } from "../lib/folderMeta";
import { getMeta, groupFolders, isArchived, isFolder, visibleChildren } from "../lib/tree";
import type { BookmarkNode } from "../lib/types";
import { Bookmark } from "./Bookmark";
import { useDashboard } from "./dashboard";
import { applyReorder, claim, isClaimed, toUnit, useDragSource } from "./drag";
import { InlineEdit } from "./InlineEdit";

// A list of bookmark tiles sharing one parent, as rendered inside a folder.
export function BookmarkGrid({ bookmarks, containerKey }: { bookmarks: BookmarkNode[]; containerKey: string }) {
  return (
    <div className="bookmark-grid">
      {bookmarks.map((bookmark) => (
        <Bookmark key={bookmark.id} node={bookmark} isDefault={false} containerKey={containerKey} />
      ))}
    </div>
  );
}

// Sibling folders under one parent: plain ones first in native order, then
// archived ones, folded into a summary row once there are two or more.
export function FolderList({ folders, parentId }: { folders: BookmarkNode[]; parentId: string }) {
  const { folderMeta, query } = useDashboard();
  const { individual, summarized } = groupFolders(folders, folderMeta, query);
  const containerKey = `folders:${parentId}`;

  return (
    <>
      {individual.map((folder) => (
        <Folder key={folder.id} node={folder} containerKey={containerKey} />
      ))}
      {summarized.length > 0 && <ArchivedSummary folders={summarized} />}
    </>
  );
}

function FolderChildren({ node }: { node: BookmarkNode }) {
  const { query } = useDashboard();
  const visible = visibleChildren(node.children ?? [], query);
  const bookmarks = visible.filter((child) => !isFolder(child));
  const folders = visible.filter(isFolder);

  return (
    <>
      {bookmarks.length > 0 && <BookmarkGrid bookmarks={bookmarks} containerKey={`bookmarks:${node.id}`} />}
      <FolderList folders={folders} parentId={node.id} />
    </>
  );
}

const ArchiveIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="8" width="18" height="12" rx="1" />
    <path d="M3 8l1.5-4h15L21 8" />
    <line x1="9.5" y1="13" x2="14.5" y2="13" />
  </svg>
);

interface FolderProps {
  node: BookmarkNode;
  containerKey: string;
}

function Folder({ node, containerKey }: FolderProps) {
  const { folderMeta, updateFolderMeta, query, parents, dragged } = useDashboard();
  const meta = getMeta(folderMeta, node.id);
  // Search forces matching folders open without touching their stored state.
  const collapsed = meta.collapsed && !query;
  const archived = isArchived(meta, query);

  const [renaming, setRenaming] = useState(false);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  useEffect(() => setPendingTitle(null), [node.title]);
  const title = pendingTitle ?? node.title;

  const unit = toUnit(node, containerKey);
  const { dragging, sourceProps } = useDragSource(unit);
  const headerRef = useRef<HTMLDivElement>(null);
  const [dropMode, setDropMode] = useState<DragBand | null>(null);

  // The whole folder (header and contents) is a drop target. For another
  // folder, from any level, the header's top edge drops before this folder, its
  // middle drops into it, and anything below (the bottom edge of a collapsed or
  // empty header, or an open folder's contents) drops after it. "Before" and
  // "after" move the folder into this folder's parent, which is how a subfolder
  // moves up a level, and dropping on contents means you can drag past an open
  // folder without aiming for a thin strip. A bookmark can only be dropped into,
  // anywhere on the header. Archived folders can't be dragged themselves (their
  // position is computed), but still accept drops.
  const dropModeAt = (e: DragEvent): DragBand | null => {
    const source = dragged.current;
    const into = canDropInto(source, node.id, parents) ? "into" : null;
    const beside = canDropBeside(source, unit, parents);
    const header = headerRef.current!.getBoundingClientRect();
    if (e.clientY >= header.bottom) return beside ? "after" : null;
    const band = dragBand(e.clientY, header.top, header.height);
    if (!beside || band === "into") return into;
    // An open folder's header borders its own contents at the bottom, so a
    // drop there reads as "into", not "after the whole folder". An open but
    // empty folder has no contents to drop after it on, so it acts collapsed.
    if (band === "after" && !collapsed && node.children?.length) return into;
    return band;
  };

  // What a drag event over this folder would do, claiming it if this folder
  // is the one to handle it.
  const resolveDrop = (e: DragEvent): DragBand | null => {
    if (isClaimed(e)) return null;
    // Over the dragged folder itself (its own contents included) nothing
    // happens; claim the event so its ancestors don't read it as "after" them.
    if (dragged.current?.id === node.id) {
      claim(e);
      return null;
    }
    const mode = dropModeAt(e);
    if (mode) claim(e);
    return mode;
  };

  const dropProps = query
    ? {}
    : {
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
          const mode = resolveDrop(e);
          setDropMode(mode);
          if (!mode) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        },
        onDragLeave: (e: DragEvent<HTMLDivElement>) => {
          // Moving onto one of this folder's own descendants isn't leaving it.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropMode(null);
        },
        onDrop: (e: DragEvent<HTMLDivElement>) => {
          const mode = resolveDrop(e);
          const source = dragged.current;
          setDropMode(null);
          if (!mode || !source) return;
          e.preventDefault();
          if (mode === "into") chrome.bookmarks.move(source.id, { parentId: node.id });
          else applyReorder(source, unit, mode);
        },
      };

  const headerProps = query
    ? {}
    : {
        draggable: !archived && !renaming,
        ...(archived ? {} : sourceProps),
        onClick: (e: MouseEvent) => {
          if ((e.target as Element).closest(".folder-actions")) return;
          updateFolderMeta((current) => toggleCollapsed(current, node.id, Date.now()));
        },
      };

  const commitRename = (value: string) => {
    if (value && value !== node.title) {
      setPendingTitle(value);
      chrome.bookmarks.update(node.id, { title: value });
    }
    setRenaming(false);
  };

  const className = [
    "folder",
    collapsed && "collapsed",
    archived && "archived",
    dragging && "dragging",
    dropMode === "before" && "drop-before",
    dropMode === "after" && "drop-after",
    dropMode === "into" && "drag-over-into",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} data-folder-id={node.id} data-parent-id={node.parentId} {...dropProps}>
      <div className="folder-header" ref={headerRef} {...headerProps}>
        <span className="chevron">▼</span>
        {renaming ? (
          <InlineEdit
            className="folder-edit-input"
            initialValue={title}
            onCommit={commitRename}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <span className="folder-name">{title || "(untitled)"}</span>
        )}
        {archived && <span className="folder-badge">Archived</span>}
        <span className="folder-actions">
          <button type="button" title="Rename" onClick={() => setRenaming(true)}>
            ✎
          </button>
          <button
            type="button"
            title={meta.archived ? "Unarchive" : "Archive"}
            className={meta.archived ? "is-archived" : undefined}
            onClick={() => updateFolderMeta((current) => toggleArchived(current, node.id, Date.now()))}
          >
            <ArchiveIcon />
          </button>
        </span>
      </div>
      <div className="folder-children">
        <FolderChildren node={node} />
      </div>
    </div>
  );
}

// Two or more archived siblings collapse into one "N archived" row; expanding
// it shows a chip per folder, and clicking a chip fully unarchives that folder.
function ArchivedSummary({ folders }: { folders: BookmarkNode[] }) {
  const { updateFolderMeta } = useDashboard();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={expanded ? "archived-summary expanded" : "archived-summary"}>
      <div className="archived-summary-header" onClick={() => setExpanded(!expanded)}>
        <span className="chevron">▼</span>
        <span className="archived-summary-label">{folders.length} archived</span>
      </div>
      <div className="archived-chip-list">
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className="archived-chip"
            title="Unarchive"
            onClick={(e) => {
              e.stopPropagation();
              updateFolderMeta((current) => unarchive(current, folder.id));
            }}
          >
            {folder.title || "(untitled)"}
          </button>
        ))}
      </div>
    </div>
  );
}
