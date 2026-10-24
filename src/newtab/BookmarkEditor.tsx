import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { BookmarkNode } from "../lib/types";

// Accepts what people type in a browser's address bar: "example.com" becomes
// "https://example.com/". Returns null for anything that still isn't a URL.
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // "localhost:3000" looks like a scheme too, so only trust ones written with
  // "//" or the few common schemes that don't use it.
  const hasScheme =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^(mailto|tel|about|data|javascript):/i.test(trimmed);
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).href;
  } catch {
    return null;
  }
}

interface Props {
  id: string;
  node: BookmarkNode;
  // Called after Chrome has accepted the change, with what was saved.
  onSaved: (saved: { title: string; url: string }) => void;
  onClose: () => void;
}

// Popover for editing a bookmark's name and URL, or deleting it from Chrome.
// Uses the native Popover API, so Escape and clicking outside close it; CSS
// anchors it under the tile marked .bookmark-item--editing (see newtab.css).
// Rendered into <body> so the tile's drag-and-drop wiring can't interfere
// with selecting text in the inputs.
export function BookmarkEditor({ id, node, onSaved, onClose }: Props) {
  const popover = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(node.title);
  const [url, setUrl] = useState(node.url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const urlId = useId();

  useEffect(() => {
    const el = popover.current;
    if (!el) return;
    // Light dismiss (Escape, clicking outside) closes the popover natively;
    // mirror that back into React state.
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "closed") onClose();
    };
    el.addEventListener("toggle", onToggle);
    el.showPopover?.();
    nameInput.current?.focus();
    nameInput.current?.select();
    return () => {
      el.removeEventListener("toggle", onToggle);
      el.hidePopover?.();
    };
    // onClose is recreated each render; the popover only needs wiring once.
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("Enter a valid URL, e.g. https://example.com");
      return;
    }
    const newTitle = title.trim();
    const changes: { title?: string; url?: string } = {};
    if (newTitle !== node.title) changes.title = newTitle;
    if (normalized !== node.url) changes.url = normalized;
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await chrome.bookmarks.update(node.id, changes);
      onSaved({ title: newTitle, url: normalized });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the bookmark.");
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await chrome.bookmarks.remove(node.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the bookmark.");
      setBusy(false);
    }
  };

  return createPortal(
    <div ref={popover} id={id} popover="auto" className="bookmark-editor" role="dialog" aria-label="Edit bookmark">
      <form onSubmit={save}>
        <label htmlFor={nameId}>Name</label>
        <input id={nameId} ref={nameInput} type="text" value={title} onChange={(e) => setTitle(e.target.value)} />

        <label htmlFor={urlId}>URL</label>
        <input
          id={urlId}
          type="text"
          inputMode="url"
          spellCheck={false}
          value={url}
          aria-invalid={error !== null}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p className="bookmark-editor-error" role="alert">
            {error}
          </p>
        )}

        {confirmingDelete ? (
          <div className="bookmark-editor-actions">
            <span className="bookmark-editor-confirm">Remove from Chrome bookmarks?</span>
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy}>
              Keep
            </button>
            <button type="button" className="danger" onClick={remove} disabled={busy}>
              Delete
            </button>
          </div>
        ) : (
          <div className="bookmark-editor-actions">
            <button type="button" className="danger-subtle" onClick={() => setConfirmingDelete(true)} disabled={busy}>
              Delete
            </button>
            <span className="spacer" />
            <button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={busy}>
              Save
            </button>
          </div>
        )}
      </form>
    </div>,
    document.body
  );
}
