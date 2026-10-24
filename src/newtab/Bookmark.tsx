import { useEffect, useState } from "react";
import type { DragUnit } from "../lib/dnd";
import type { BookmarkNode } from "../lib/types";
import { faviconUrl, useDashboard } from "./dashboard";
import { useDragSource, useReorderTarget } from "./drag";
import { InlineEdit } from "./InlineEdit";

interface Props {
  node: BookmarkNode;
  // Default bookmarks sit directly under a Chrome root and render in the header
  // row, favicon-only when settings.faviconOnlyDefault is on.
  isDefault: boolean;
  containerKey: string;
  // Every bookmark in the same rendered list, in display order, for reordering.
  siblings: DragUnit[];
}

export function Bookmark({ node, isDefault, containerKey, siblings }: Props) {
  const { settings, query } = useDashboard();
  const [editing, setEditing] = useState(false);
  // Shown between committing a rename and the tree re-reading the new title.
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  useEffect(() => setPendingTitle(null), [node.title]);

  const unit: DragUnit = { id: node.id, parentId: node.parentId ?? "", containerKey };
  const { dragging, sourceProps } = useDragSource(unit);
  const { over, targetProps } = useReorderTarget(unit, siblings);
  const dndEnabled = !query;

  const url = node.url ?? "";
  const title = pendingTitle ?? node.title;
  const compact = isDefault && settings.faviconOnlyDefault && !editing;
  const className = [
    "bookmark-item",
    compact && "bookmark-item--compact",
    dragging && "dragging",
    over && "drag-over",
  ]
    .filter(Boolean)
    .join(" ");

  const commitRename = (value: string) => {
    if (value && value !== node.title) {
      setPendingTitle(value);
      chrome.bookmarks.update(node.id, { title: value });
    }
    setEditing(false);
  };

  const favicon = <img className="favicon" src={faviconUrl(url)} alt="" />;

  return (
    <div
      className={className}
      data-bookmark-id={node.id}
      data-parent-id={node.parentId}
      draggable={dndEnabled && !editing}
      {...(dndEnabled ? { ...sourceProps, ...targetProps } : {})}
    >
      {editing ? (
        <>
          {favicon}
          <InlineEdit
            className="bookmark-edit-input"
            initialValue={title}
            onCommit={commitRename}
            onCancel={() => setEditing(false)}
          />
        </>
      ) : (
        <>
          <a href={url} className="bookmark-link" title={title || url}>
            {favicon}
            {!compact && <span className="bookmark-title">{title || url}</span>}
          </a>
          <button
            type="button"
            className="bookmark-edit-btn"
            title="Rename"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditing(true);
            }}
          >
            ✎
          </button>
        </>
      )}
    </div>
  );
}
