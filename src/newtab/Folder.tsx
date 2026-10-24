import { useEffect, useState, type DragEvent, type MouseEvent } from "react";
import { canDropInto, canDropOnto, dragBand, type DragUnit } from "../lib/dnd";
import { toggleArchived, toggleCollapsed, unarchive } from "../lib/folderMeta";
import { getMeta, groupFolders, isArchived, isFolder, visibleChildren } from "../lib/tree";
import type { BookmarkNode } from "../lib/types";
import { Bookmark } from "./Bookmark";
import { useDashboard } from "./dashboard";
import { applyReorder, useDragSource } from "./drag";
import { InlineEdit } from "./InlineEdit";

function toUnits(nodes: BookmarkNode[], containerKey: string): DragUnit[] {
  return nodes.map((node) => ({ id: node.id, parentId: node.parentId ?? "", containerKey }));
}

// A list of bookmark tiles sharing one parent, as rendered inside a folder.
export function BookmarkGrid({ bookmarks, containerKey }: { bookmarks: BookmarkNode[]; containerKey: string }) {
  const siblings = toUnits(bookmarks, containerKey);
  return (
    <div className="bookmark-grid">
      {bookmarks.map((bookmark) => (
        <Bookmark
          key={bookmark.id}
          node={bookmark}
          isDefault={false}
          containerKey={containerKey}
          siblings={siblings}
        />
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
  const siblings = toUnits(individual, containerKey);

  return (
    <>
      {individual.map((folder) => (
        <Folder key={folder.id} node={folder} containerKey={containerKey} siblings={siblings} />
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
  siblings: DragUnit[];
}

function Folder({ node, containerKey, siblings }: FolderProps) {
  const { folderMeta, updateFolderMeta, query, parents, dragged } = useDashboard();
  const meta = getMeta(folderMeta, node.id);
  // Search forces matching folders open without touching their stored state.
  const collapsed = meta.collapsed && !query;
  const archived = isArchived(meta, query);

  const [renaming, setRenaming] = useState(false);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  useEffect(() => setPendingTitle(null), [node.title]);
  const title = pendingTitle ?? node.title;

  const unit: DragUnit = { id: node.id, parentId: node.parentId ?? "", containerKey };
  const { dragging, sourceProps } = useDragSource(unit);
  const [dropMode, setDropMode] = useState<"reorder" | "into" | null>(null);

  // The header is a drop target in two ways depending on where the pointer is:
  // its top/bottom quarters reorder among siblings, its middle moves the dragged
  // item into this folder. Archived folders can't be dragged themselves (their
  // position is computed), but still accept items dropped into them.
  const dropModeAt = (e: DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const band = dragBand(e.clientY, rect.top, rect.height);
    if (band !== "into") return canDropOnto(dragged.current, unit) ? "reorder" : null;
    return canDropInto(dragged.current, node.id, parents) ? "into" : null;
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
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
          const mode = dropModeAt(e);
          setDropMode(mode);
          if (!mode) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        },
        onDragLeave: () => setDropMode(null),
        onDrop: (e: DragEvent<HTMLDivElement>) => {
          const mode = dropModeAt(e);
          const source = dragged.current;
          setDropMode(null);
          if (!mode || !source) return;
          e.preventDefault();
          if (mode === "reorder") applyReorder(siblings, source.id, node.id);
          else chrome.bookmarks.move(source.id, { parentId: node.id });
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
    dropMode === "reorder" && "drag-over",
    dropMode === "into" && "drag-over-into",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} data-folder-id={node.id} data-parent-id={node.parentId}>
      <div className="folder-header" {...headerProps}>
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
