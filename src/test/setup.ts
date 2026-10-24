// Vitest setup (see vite.config.ts). jsdom hides [popover] elements but has
// no Popover API to show them, so fill in just enough of it: an open popover
// is made visible (inline, since jsdom's built-in popover rule beats
// stylesheets) and toggle events fire like in a browser.
if (!HTMLElement.prototype.showPopover) {
  const toggle = (el: HTMLElement, open: boolean) => {
    if (el.hasAttribute("data-popover-open") === open) return;
    el.toggleAttribute("data-popover-open", open);
    el.style.display = open ? "block" : "";
    el.dispatchEvent(
      Object.assign(new Event("toggle"), { oldState: open ? "closed" : "open", newState: open ? "open" : "closed" })
    );
  };
  HTMLElement.prototype.showPopover = function () {
    toggle(this, true);
  };
  HTMLElement.prototype.hidePopover = function () {
    toggle(this, false);
  };
}

// jsdom has no DragEvent either, so drag events would lose their pointer
// position (clientY), which folder drops depend on.
if (typeof DragEvent === "undefined") {
  globalThis.DragEvent = class DragEvent extends MouseEvent {
    readonly dataTransfer: DataTransfer | null = null;
  } as typeof globalThis.DragEvent;
}
