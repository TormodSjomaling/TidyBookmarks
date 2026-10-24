import type { Theme } from "../lib/types";
import { ArrowLeftIcon } from "../shared/icons";
import { updateSettings, useSettings } from "../shared/settings";

export function Options() {
  const settings = useSettings();
  if (!settings) return null;

  return (
    <>
      <div id="options-header">
        <button
          id="back-btn"
          type="button"
          title="Back"
          onClick={() => {
            window.location.href = "../newtab/newtab.html";
          }}
        >
          <ArrowLeftIcon size={18} />
        </button>
        <h1>Options</h1>
      </div>
      <label className="option-row">
        <input
          type="checkbox"
          checked={settings.faviconOnlyDefault}
          onChange={(e) => updateSettings({ faviconOnlyDefault: e.target.checked })}
        />
        <span>Show only favicons for default (unfoldered) bookmarks</span>
      </label>
      <label className="option-row">
        <span>Theme</span>
        <select value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as Theme })}>
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label className="option-row">
        <input
          type="checkbox"
          checked={settings.density === "compact"}
          onChange={(e) => updateSettings({ density: e.target.checked ? "compact" : "comfortable" })}
        />
        <span>Compact mode (tighter spacing)</span>
      </label>
    </>
  );
}
