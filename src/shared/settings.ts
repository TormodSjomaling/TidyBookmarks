import { useEffect, useState } from "react";
import type { Settings } from "../lib/types";

export const DEFAULT_SETTINGS: Settings = { faviconOnlyDefault: true, theme: "system", density: "comfortable" };

function withDefaults(stored: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...stored };
}

// Applies the theme/density settings as attributes on <html>, which theme.css
// keys its overrides off of. "system" theme means no data-theme attribute at
// all, so the prefers-color-scheme media query in theme.css decides, and
// updates live if the OS-level setting changes while the page is open.
export function applySettings(settings: Settings): void {
  const root = document.documentElement;

  if (settings.theme === "dark" || settings.theme === "light") {
    root.setAttribute("data-theme", settings.theme);
  } else {
    root.removeAttribute("data-theme");
  }

  if (settings.density === "compact") {
    root.setAttribute("data-density", "compact");
  } else {
    root.removeAttribute("data-density");
  }
}

// Loads settings, follows changes made from any page, and keeps <html>'s
// theme/density attributes in sync. Null until the first load completes.
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    chrome.storage.local.get("settings").then((result) => {
      if (!cancelled) setSettings(withDefaults(result.settings as Partial<Settings> | undefined));
    });

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes.settings) {
        setSettings(withDefaults(changes.settings.newValue as Partial<Settings> | undefined));
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  useEffect(() => {
    if (settings) applySettings(settings);
  }, [settings]);

  return settings;
}

// Merges a patch into the stored settings (read fresh, so another page's
// concurrent change to a different field isn't lost).
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const result = await chrome.storage.local.get("settings");
  const settings = { ...withDefaults(result.settings as Partial<Settings> | undefined), ...patch };
  await chrome.storage.local.set({ settings });
}
