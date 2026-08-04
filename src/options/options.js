const checkbox = document.getElementById("favicon-only-default");

document.getElementById("back-btn").addEventListener("click", () => {
  window.close();
});

chrome.storage.local.get(["settings"], (result) => {
  const settings = Object.assign({ faviconOnlyDefault: true }, result.settings || {});
  checkbox.checked = settings.faviconOnlyDefault;
});

checkbox.addEventListener("change", () => {
  chrome.storage.local.get(["settings"], (result) => {
    const settings = Object.assign({ faviconOnlyDefault: true }, result.settings || {});
    settings.faviconOnlyDefault = checkbox.checked;
    chrome.storage.local.set({ settings });
  });
});
