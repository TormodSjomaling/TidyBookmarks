import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { normalizeUrl, siteTitle } from "../lib/links";

type Kind = "bookmark" | "folder";

interface Props {
  id: string;
  parentId: string;
  // Shown in the heading: "Add to Work".
  parentTitle: string;
  // Only offer a new folder (the "New folder" button under the top-level folders).
  folderOnly?: boolean;
  // Line the popover up with the anchor's right edge instead of its left.
  alignEnd?: boolean;
  // Called once Chrome has created the bookmark or folder.
  onAdded?: () => void;
  onClose: () => void;
}

// Popover for adding a bookmark or a subfolder to a folder. Like
// BookmarkEditor, a native popover portalled into <body> and anchored by CSS
// to the element marked .popover-anchor. New items go at the end of the folder.
export function AddPopover({ id, parentId, parentTitle, folderOnly = false, alignEnd = false, onAdded, onClose }: Props) {
  const popover = useRef<HTMLDivElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>(folderOnly ? "folder" : "bookmark");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const urlId = useId();
  const nameId = useId();

  useEffect(() => {
    const el = popover.current;
    if (!el) return;
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "closed") onClose();
    };
    el.addEventListener("toggle", onToggle);
    el.showPopover?.();
    return () => {
      el.removeEventListener("toggle", onToggle);
      el.hidePopover?.();
    };
    // onClose is recreated each render; the popover only needs wiring once.
  }, []);

  // The first field of the chosen kind takes focus: URL for a bookmark (you
  // usually paste one), the name for a folder.
  useEffect(() => firstInput.current?.focus(), [kind]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    let details: chrome.bookmarks.CreateDetails;
    if (kind === "bookmark") {
      const normalized = normalizeUrl(url);
      if (!normalized) {
        setError("Enter a valid URL, e.g. https://example.com");
        return;
      }
      details = { parentId, title: title.trim() || siteTitle(normalized), url: normalized };
    } else {
      if (!title.trim()) {
        setError("Give the folder a name.");
        return;
      }
      details = { parentId, title: title.trim() };
    }
    setBusy(true);
    try {
      await chrome.bookmarks.create(details);
      onAdded?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add it.");
      setBusy(false);
    }
  };

  const switchTo = (next: Kind) => {
    setKind(next);
    setError(null);
  };

  const nameField = (
    <>
      <label htmlFor={nameId}>{kind === "bookmark" ? "Name (optional)" : "Folder name"}</label>
      <input
        id={nameId}
        ref={kind === "folder" ? firstInput : undefined}
        type="text"
        value={title}
        placeholder={kind === "bookmark" ? "Uses the site's name if empty" : undefined}
        aria-invalid={kind === "folder" && error !== null}
        onChange={(e) => {
          setTitle(e.target.value);
          setError(null);
        }}
      />
    </>
  );

  return createPortal(
    <div
      ref={popover}
      id={id}
      popover="auto"
      className={alignEnd ? "bookmark-editor bookmark-editor--end" : "bookmark-editor"}
      role="dialog"
      aria-label={folderOnly ? "New folder" : `Add to ${parentTitle}`}
    >
      <form onSubmit={add}>
        <div className="bookmark-editor-heading">
          <span>{folderOnly ? "New folder" : `Add to ${parentTitle}`}</span>
          {!folderOnly && (
            <span className="seg" role="group" aria-label="What to add">
              <button type="button" aria-pressed={kind === "bookmark"} onClick={() => switchTo("bookmark")}>
                Bookmark
              </button>
              <button type="button" aria-pressed={kind === "folder"} onClick={() => switchTo("folder")}>
                Folder
              </button>
            </span>
          )}
        </div>

        {kind === "bookmark" && (
          <>
            <label htmlFor={urlId}>URL</label>
            <input
              id={urlId}
              ref={firstInput}
              type="text"
              inputMode="url"
              spellCheck={false}
              placeholder="example.com"
              value={url}
              aria-invalid={error !== null}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
            />
          </>
        )}
        {nameField}
        {error && (
          <p className="bookmark-editor-error" role="alert">
            {error}
          </p>
        )}

        <div className="bookmark-editor-actions">
          <span className="spacer" />
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {kind === "bookmark" ? "Add bookmark" : "Add folder"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
