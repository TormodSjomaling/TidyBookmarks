import { useEffect, useId, useRef, useState } from "react";
import type { BookmarkNode } from "../lib/types";
import { PencilIcon } from "../shared/icons";
import { BookmarkEditor } from "./BookmarkEditor";
import { faviconUrl, useDashboard } from "./dashboard";
import { toUnit, useDragSource, useReorderTarget } from "./drag";
import { Highlight } from "./Highlight";

interface Props {
  node: BookmarkNode;
  // Default bookmarks sit directly under a Chrome root and render in the header
  // row, favicon-only when settings.faviconOnlyDefault is on.
  isDefault: boolean;
  containerKey: string;
}

export function Bookmark({ node, isDefault, containerKey }: Props) {
  const { settings, query, activeResultId } = useDashboard();
  const active = activeResultId === node.id;
  const tile = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) tile.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  const [editing, setEditing] = useState(false);
  const editorId = useId();
  // Shown between saving an edit and the tree re-reading the bookmark.
  const [pending, setPending] = useState<{ title: string; url: string } | null>(null);
  useEffect(() => setPending(null), [node.title, node.url]);

  const unit = toUnit(node, containerKey);
  const { dragging, sourceProps } = useDragSource(unit);
  const { over, targetProps } = useReorderTarget(unit);
  const dndEnabled = !query;

  const url = pending?.url ?? node.url ?? "";
  const title = pending?.title ?? node.title;
  const compact = isDefault && settings.faviconOnlyDefault;
  const className = [
    "bookmark-item",
    compact && "bookmark-item--compact",
    editing && "bookmark-item--editing",
    active && "bookmark-item--active",
    dragging && "dragging",
    over === "before" && "drop-before",
    over === "after" && "drop-after",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={tile}
      className={className}
      data-bookmark-id={node.id}
      data-parent-id={node.parentId}
      draggable={dndEnabled && !editing}
      {...(dndEnabled ? { ...sourceProps, ...targetProps } : {})}
    >
      <a href={url} className="bookmark-link" title={title || url}>
        <img className="favicon" src={faviconUrl(url)} alt="" />
        {!compact && (
          <span className="bookmark-title">
            <Highlight text={title || url} />
          </span>
        )}
      </a>
      <button
        type="button"
        className="bookmark-edit-btn"
        title="Edit"
        aria-haspopup="dialog"
        aria-expanded={editing}
        // While open, the button is the popover's native invoker: clicking it
        // hides the popover (and isn't treated as a click outside that would
        // close it only for this click to reopen it).
        popoverTarget={editing ? editorId : undefined}
        popoverTargetAction="hide"
        onClick={(e) => {
          e.stopPropagation();
          if (editing) return;
          // React re-renders during this click, adding popoverTarget before
          // the button's default action runs; cancel it so it doesn't hide the
          // popover we're opening.
          e.preventDefault();
          setEditing(true);
        }}
      >
        <PencilIcon size={compact ? 10 : 13} />
      </button>
      {editing && <BookmarkEditor id={editorId} node={node} onSaved={setPending} onClose={() => setEditing(false)} />}
    </div>
  );
}
