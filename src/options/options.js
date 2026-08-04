const DEFAULT_SETTINGS = { faviconOnlyDefault: true, theme: "system", density: "comfortable" };

const checkbox = document.getElementById("favicon-only-default");
const themeSelect = document.getElementById("theme-select");
const densityCheckbox = document.getElementById("density-compact");

document.getElementById("back-btn").addEventListener("click", () => {
  window.location.href = "../newtab/newtab.html";
});

function updateSettings(patch) {
  chrome.storage.local.get(["settings"], (result) => {
    const settings = Object.assign({}, DEFAULT_SETTINGS, result.settings || {}, patch);
    chrome.storage.local.set({ settings });
  });
}

chrome.storage.local.get(["settings"], (result) => {
  const settings = Object.assign({}, DEFAULT_SETTINGS, result.settings || {});
  checkbox.checked = settings.faviconOnlyDefault;
  themeSelect.value = settings.theme;
  densityCheckbox.checked = settings.density === "compact";
  applySettings(settings);
});

checkbox.addEventListener("change", () => {
  updateSettings({ faviconOnlyDefault: checkbox.checked });
});

themeSelect.addEventListener("change", () => {
  updateSettings({ theme: themeSelect.value });
});

densityCheckbox.addEventListener("change", () => {
  updateSettings({ density: densityCheckbox.checked ? "compact" : "comfortable" });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    applySettings(Object.assign({}, DEFAULT_SETTINGS, changes.settings.newValue || {}));
  }
});
