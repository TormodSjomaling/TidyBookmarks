import { useEffect, useId, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { canDropBeside, canDropInto, dragBand, type DragBand } from "../lib/dnd";
import { toggleArchived, toggleCollapsed, unarchive } from "../lib/folderMeta";
import { folderPreview, getMeta, groupFolders, isArchived, isFolder, visibleChildren } from "../lib/tree";
import type { BookmarkNode } from "../lib/types";
import { ArchiveIcon, ChevronIcon, PencilIcon, PlusIcon } from "../shared/icons";
import { AddPopover } from "./AddPopover";
import { Bookmark } from "./Bookmark";
import { faviconUrl, useDashboard } from "./dashboard";
import { applyReorder, carriesLink, claim, createFromDrop, isClaimed, toUnit, useDragSource } from "./drag";
import { captureLayout } from "./glide";
import { Highlight } from "./Highlight";
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
// archived ones, folded into a summary row once there are two or more. `depth`
// is 0 for folders directly under a Chrome root, which render as cards.
export function FolderList({ folders, parentId, depth }: { folders: BookmarkNode[]; parentId: string; depth: number }) {
  const { folderMeta, query } = useDashboard();
  const { individual, summarized } = groupFolders(folders, folderMeta, query);
  const containerKey = `folders:${parentId}`;

  return (
    <>
      {individual.map((folder) => (
        <Folder key={folder.id} node={folder} containerKey={containerKey} depth={depth} />
      ))}
      {summarized.length > 0 && <ArchivedSummary folders={summarized} />}
    </>
  );
}

function FolderChildren({ node, depth }: { node: BookmarkNode; depth: number }) {
  const { query } = useDashboard();
  const visible = visibleChildren(node.children ?? [], query);
  const bookmarks = visible.filter((child) => !isFolder(child));
  const folders = visible.filter(isFolder);

  return (
    <>
      {bookmarks.length > 0 && <BookmarkGrid bookmarks={bookmarks} containerKey={`bookmarks:${node.id}`} />}
      <FolderList folders={folders} parentId={node.id} depth={depth + 1} />
    </>
  );
}

const PREVIEW_ICONS = 4;

// What a collapsed folder holds, at a glance: a few of its sites' icons and
// a count of all its bookmarks.
function FolderPreview({ node }: { node: BookmarkNode }) {
  const { count, first } = folderPreview(node, PREVIEW_ICONS);
  if (count === 0) return <span className="folder-preview folder-preview--empty">Empty</span>;
  return (
    <span className="folder-preview" title={`${count} bookmark${count === 1 ? "" : "s"}`}>
      {first.map((bookmark) => (
        <img key={bookmark.id} className="favicon" src={faviconUrl(bookmark.url ?? "")} alt="" />
      ))}
      <span className="folder-count">{count}</span>
    </span>
  );
}

interface FolderProps {
  node: BookmarkNode;
  containerKey: string;
  depth: number;
}

function Folder({ node, containerKey, depth }: FolderProps) {
  const { folderMeta, updateFolderMeta, query, parents, dragged } = useDashboard();
  const meta = getMeta(folderMeta, node.id);
  // Search forces matching folders open without touching their stored state.
  const collapsed = meta.collapsed && !query;
  const archived = isArchived(meta, query);

  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const addPopoverId = useId();
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
  // position is computed), but still accept drops. A link dragged in from
  // outside the page is added into the folder, from anywhere on it.
  const dropModeAt = (e: DragEvent): DragBand | null => {
    const source = dragged.current;
    if (!source) return carriesLink(e) ? "into" : null;
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

  // Chrome asks on dragenter as well as dragover whether a drop is allowed
  // here; a mouseup right after entering uses the dragenter answer.
  const accept = (e: DragEvent<HTMLDivElement>) => {
    const mode = resolveDrop(e);
    setDropMode(mode);
    if (!mode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragged.current ? "move" : "copy";
  };

  const dropProps = query
    ? {}
    : {
        onDragEnter: accept,
        onDragOver: accept,
        onDragLeave: (e: DragEvent<HTMLDivElement>) => {
          // Moving onto one of this folder's own descendants isn't leaving it.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropMode(null);
        },
        onDrop: (e: DragEvent<HTMLDivElement>) => {
          const mode = resolveDrop(e);
          const source = dragged.current;
          setDropMode(null);
          if (!mode) return;
          e.preventDefault();
          if (!source) {
            createFromDrop(e.dataTransfer, node.id);
          } else if (mode === "into") {
            captureLayout();
            chrome.bookmarks.move(source.id, { parentId: node.id });
          } else {
            applyReorder(source, unit, mode);
          }
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
    depth === 0 && "folder--top",
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
      <div className={adding ? "folder-header popover-anchor" : "folder-header"} ref={headerRef} {...headerProps}>
        {renaming ? (
          <>
            <span className="chevron">
              <ChevronIcon />
            </span>
            <InlineEdit
              className="folder-edit-input"
              initialValue={title}
              onCommit={commitRename}
              onCancel={() => setRenaming(false)}
            />
          </>
        ) : (
          // A real button, so the folder can be opened and closed from the
          // keyboard. Its click bubbles up to the header's handler.
          <button type="button" className="folder-toggle" aria-expanded={!collapsed}>
            <span className="chevron">
              <ChevronIcon />
            </span>
            <span className="folder-name">
              <Highlight text={title || "(untitled)"} />
            </span>
          </button>
        )}
        {archived && <span className="folder-badge">Archived</span>}
        {collapsed && !archived && !renaming && <FolderPreview node={node} />}
        <span className="folder-actions">
          <button
            type="button"
            title="Add bookmark or folder"
            aria-haspopup="dialog"
            aria-expanded={adding}
            // Same as the bookmark edit button: while open, this button is the
            // popover's invoker, so clicking it again closes it.
            popoverTarget={adding ? addPopoverId : undefined}
            popoverTargetAction="hide"
            onClick={(e) => {
              if (adding) return;
              e.preventDefault();
              setAdding(true);
            }}
          >
            <PlusIcon size={15} />
          </button>
          <button type="button" title="Rename" onClick={() => setRenaming(true)}>
            <PencilIcon size={15} />
          </button>
          <button
            type="button"
            title={meta.archived ? "Unarchive" : "Archive"}
            className={meta.archived ? "is-archived" : undefined}
            onClick={() => updateFolderMeta((current) => toggleArchived(current, node.id, Date.now()))}
          >
            <ArchiveIcon size={15} />
          </button>
        </span>
      </div>
      {adding && (
        <AddPopover
          id={addPopoverId}
          parentId={node.id}
          parentTitle={title || "(untitled)"}
          // Under the + button, at the header's right end.
          alignEnd
          // Open the folder so the new item is visible.
          onAdded={() => meta.collapsed && updateFolderMeta((current) => toggleCollapsed(current, node.id, Date.now()))}
          onClose={() => setAdding(false)}
        />
      )}
      <div className="folder-children">
        <FolderChildren node={node} depth={depth} />
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
        <span className="chevron">
          <ChevronIcon size={14} />
        </span>
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
