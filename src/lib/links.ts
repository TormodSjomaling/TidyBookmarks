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

// The name a bookmark gets when none is given: its site, without "www.".
export function siteTitle(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname ? hostname.replace(/^www\./, "") : url;
  } catch {
    return url;
  }
}

// A link dropped from another window or tab: the URL from its text/uri-list
// data (the first line that isn't a comment), named by the link's text if it
// came with one, otherwise by its site.
export function droppedLink(uriList: string, linkText: string | null): { url: string; title: string } | null {
  const first = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  const url = first ? normalizeUrl(first) : null;
  if (!url) return null;
  const text = linkText?.replace(/\s+/g, " ").trim();
  return { url, title: text || siteTitle(url) };
}
