// Generates stand-in favicons for the `npm run dev:web` preview, where Chrome's
// /_favicon/ endpoint doesn't exist: a rounded square in a color derived from
// the site's name, with its initial. Used by the dev server in vite.config.ts.

// The label that names the site: "acme" for staging.acme.example, "jira" for
// jira.example.com, "github" for github.com.
function siteName(pageUrl: string): string {
  let host: string;
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    return "?";
  }
  const labels = host.replace(/^www\./, "").split(".");
  const example = labels.indexOf("example");
  if (example > 0) return labels[example - 1];
  return labels.length > 1 ? labels[labels.length - 2] : labels[0];
}

function hue(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function placeholderFavicon(pageUrl: string): string {
  const name = siteName(pageUrl);
  const initial = name.charAt(0).toUpperCase() || "?";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="hsl(${hue(name)} 55% 45%)"/><text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="600" fill="#fff">${initial}</text></svg>`;
}
