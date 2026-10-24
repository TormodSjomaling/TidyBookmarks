import { describe, expect, it } from "vitest";
import { droppedLink, normalizeUrl, siteTitle } from "./links";

describe("normalizeUrl", () => {
  it("keeps full URLs", () => {
    expect(normalizeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(normalizeUrl("http://localhost:3000")).toBe("http://localhost:3000/");
  });

  it("adds https:// to bare domains, like the address bar", () => {
    expect(normalizeUrl("  example.com/docs ")).toBe("https://example.com/docs");
    expect(normalizeUrl("localhost:3000")).toBe("https://localhost:3000/");
  });

  it("keeps other schemes", () => {
    expect(normalizeUrl("chrome://extensions")).toBe("chrome://extensions");
    expect(normalizeUrl("mailto:me@example.com")).toBe("mailto:me@example.com");
  });

  it("rejects empty and unparseable input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("siteTitle", () => {
  it("names a bookmark by its site", () => {
    expect(siteTitle("https://www.github.com/anthropics")).toBe("github.com");
    expect(siteTitle("https://docs.acme.example/runbook")).toBe("docs.acme.example");
  });

  it("falls back to the URL itself", () => {
    expect(siteTitle("mailto:me@example.com")).toBe("mailto:me@example.com");
  });
});

describe("droppedLink", () => {
  it("takes the first URL and the link's text", () => {
    const uriList = ["# comment", "https://example.com/a", "https://other.example"].join("\r\n");
    expect(droppedLink(uriList, "  Example\n page ")).toEqual({
      url: "https://example.com/a",
      title: "Example page",
    });
  });

  it("names it by its site without link text", () => {
    expect(droppedLink("https://www.example.com/", null)).toEqual({
      url: "https://www.example.com/",
      title: "example.com",
    });
  });

  it("ignores drops without a URL", () => {
    expect(droppedLink("", "text")).toBeNull();
    expect(droppedLink("not a url", null)).toBeNull();
  });
});
