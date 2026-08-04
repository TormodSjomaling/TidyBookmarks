// Shared between newtab.js and options.js: applies the persisted theme/density
// settings as attributes on <html>, which theme.css keys its overrides off of.
// "system" theme means no data-theme attribute at all, so the
// prefers-color-scheme media query in theme.css decides and updates live if the
// OS-level setting changes while the page is open.
function applySettings(settings) {
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
