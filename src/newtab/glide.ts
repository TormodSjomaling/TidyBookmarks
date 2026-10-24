// After a drop, the items that moved glide from where they were to where they
// are now, instead of jumping. `captureLayout` records where every tile and
// folder sits just before a move; `playGlide` runs once the re-read tree has
// rendered and animates whatever moved. Moves made elsewhere (another tab,
// Chrome's bookmark manager) aren't captured, so they don't animate.

const ITEMS = "[data-bookmark-id], .folder[data-folder-id]";
const DURATION_MS = 200;
// A capture older than this belongs to a move that never re-rendered.
const MAX_AGE_MS = 1000;

let captured: { at: number; positions: Map<string, { x: number; y: number }> } | null = null;

function keyOf(el: HTMLElement): string {
  return el.dataset.bookmarkId ? `b${el.dataset.bookmarkId}` : `f${el.dataset.folderId}`;
}

// Page-relative, so scrolling between the capture and the re-render doesn't
// read as movement.
function positionOf(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + window.scrollX, y: rect.top + window.scrollY };
}

export function captureLayout(): void {
  const positions = new Map<string, { x: number; y: number }>();
  for (const el of document.querySelectorAll<HTMLElement>(ITEMS)) positions.set(keyOf(el), positionOf(el));
  captured = { at: Date.now(), positions };
}

export function playGlide(): void {
  const before = captured;
  captured = null;
  if (!before || Date.now() - before.at > MAX_AGE_MS) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const moved = new Map<HTMLElement, { dx: number; dy: number }>();
  for (const el of document.querySelectorAll<HTMLElement>(ITEMS)) {
    const from = before.positions.get(keyOf(el));
    if (!from || el.offsetParent === null) continue; // new, or inside a collapsed folder
    const to = positionOf(el);
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) moved.set(el, { dx, dy });
  }

  for (const [el, { dx, dy }] of moved) {
    // Contents ride along with their folder's own glide.
    const folder = el.parentElement?.closest<HTMLElement>(".folder");
    if (folder && moved.has(folder)) continue;
    if (typeof el.animate !== "function") continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: DURATION_MS,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    });
  }
}
